package expo.modules.rizzoverlay

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import org.json.JSONObject
import kotlin.math.abs

/**
 * Foreground service that owns live mode: the floating bubble, the screen
 * capturer, and the suggestions panel drawn over other apps.
 */
class BubbleService : Service() {
  companion object {
    const val EXTRA_RESULT_CODE = "resultCode"
    const val EXTRA_RESULT_DATA = "resultData"
    private const val ACTION_STOP = "expo.modules.rizzoverlay.STOP"
    private const val CHANNEL_ID = "rizz_live"
    private const val NOTIFICATION_ID = 4210

    @Volatile var instance: BubbleService? = null
      private set

    /** Set by RizzOverlayModule: (eventName, jsonPayload) -> Unit */
    @Volatile var listener: ((String, String) -> Unit)? = null
  }

  private val main = Handler(Looper.getMainLooper())
  private lateinit var wm: WindowManager
  private var capturer: ScreenCapturer? = null
  private var bubble: TextView? = null
  private var bubbleParams: WindowManager.LayoutParams? = null
  private var panel: View? = null
  private var busy = false

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopSelf()
      return START_NOT_STICKY
    }
    if (capturer != null) return START_NOT_STICKY

    // Must be in the foreground with type mediaProjection *before* getMediaProjection (Android 14+).
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, buildNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
    } else {
      startForeground(NOTIFICATION_ID, buildNotification())
    }

    val resultCode = intent?.getIntExtra(EXTRA_RESULT_CODE, 0) ?: 0
    val data: Intent? = if (Build.VERSION.SDK_INT >= 33) {
      intent?.getParcelableExtra(EXTRA_RESULT_DATA, Intent::class.java)
    } else {
      @Suppress("DEPRECATION") intent?.getParcelableExtra(EXTRA_RESULT_DATA)
    }
    val mpm = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
    val projection = data?.let { mpm.getMediaProjection(resultCode, it) }
    if (projection == null) {
      stopSelf()
      return START_NOT_STICKY
    }
    capturer = ScreenCapturer(this, projection) { main.post { stopSelf() } }
    instance = this
    addBubble()
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    instance = null
    hidePanel()
    bubble?.let { runCatching { wm.removeView(it) } }
    bubble = null
    capturer?.release()
    capturer = null
    listener?.invoke("onBubbleStopped", "{}")
    super.onDestroy()
  }

  // ---------------------------------------------------------------------------
  // Bubble
  // ---------------------------------------------------------------------------

  private fun overlayType() =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE

  @SuppressLint("ClickableViewAccessibility", "SetTextI18n")
  private fun addBubble() {
    val size = dp(56)
    val view = TextView(this).apply {
      text = "✨"
      textSize = 24f
      gravity = Gravity.CENTER
      background = GradientDrawable(
        GradientDrawable.Orientation.TL_BR,
        intArrayOf(Color.parseColor("#FF4D8D"), Color.parseColor("#7C4DFF")),
      ).apply { shape = GradientDrawable.OVAL }
      elevation = dp(6).toFloat()
      contentDescription = "Rizz AI: get reply ideas for this chat"
    }
    val params = WindowManager.LayoutParams(
      size, size, overlayType(),
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
      PixelFormat.TRANSLUCENT,
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      x = resources.displayMetrics.widthPixels - size - dp(8)
      y = resources.displayMetrics.heightPixels / 3
    }

    var downX = 0f; var downY = 0f; var startX = 0; var startY = 0; var moved = false
    view.setOnTouchListener { v, e ->
      when (e.action) {
        MotionEvent.ACTION_DOWN -> {
          downX = e.rawX; downY = e.rawY; startX = params.x; startY = params.y; moved = false; true
        }
        MotionEvent.ACTION_MOVE -> {
          val dx = e.rawX - downX; val dy = e.rawY - downY
          if (abs(dx) > dp(6) || abs(dy) > dp(6)) moved = true
          params.x = startX + dx.toInt(); params.y = startY + dy.toInt()
          wm.updateViewLayout(v, params); true
        }
        MotionEvent.ACTION_UP -> {
          if (moved) snapToEdge(v, params) else onBubbleTap()
          true
        }
        else -> false
      }
    }
    wm.addView(view, params)
    bubble = view
    bubbleParams = params
  }

  private fun snapToEdge(v: View, params: WindowManager.LayoutParams) {
    val w = resources.displayMetrics.widthPixels
    params.x = if (params.x + v.width / 2 < w / 2) dp(4) else w - v.width - dp(4)
    wm.updateViewLayout(v, params)
  }

  private fun onBubbleTap() {
    if (panel != null) { hidePanel(); return }
    if (busy) return
    captureAndRead()
  }

  private fun captureAndRead() {
    val cap = capturer ?: return
    busy = true
    bubble?.visibility = View.INVISIBLE // keep the bubble out of the screenshot
    cap.discardPending()
    main.postDelayed({
      val bitmap = runCatching { cap.grab() }.getOrNull()
      bubble?.visibility = View.VISIBLE
      if (bitmap == null) {
        busy = false
        showError("Couldn't read the screen", "Try again in a second.")
        return@postDelayed
      }
      showLoading("Reading the chat…")
      ChatOcr.parse(bitmap, { transcript ->
        bitmap.recycle()
        busy = false
        if (transcript.getJSONArray("messages").length() == 0) {
          showError(
            "No chat found here",
            "Open a conversation and tap again. Some apps block screen reading — use Screenshot mode in the app instead.",
          )
          return@parse
        }
        val l = listener
        if (l == null) {
          showError("Rizz AI is asleep", "Open the Rizz AI app once, then come back and tap the bubble.")
        } else {
          showLoading("Reading the vibe…")
          l("onCapture", transcript.toString())
        }
      }, { err ->
        bitmap.recycle()
        busy = false
        showError("Couldn't read the text", err.message ?: "Try again.")
      })
    }, 220)
  }

  // ---------------------------------------------------------------------------
  // Panel (rendered from JSON pushed by JS — see PanelState in RizzOverlay.types.ts)
  // ---------------------------------------------------------------------------

  fun showPanel(json: String): Boolean {
    val state = runCatching { JSONObject(json) }.getOrNull() ?: return false
    main.post { renderPanel(state) }
    return true
  }

  fun hidePanel() {
    main.post {
      panel?.let { runCatching { wm.removeView(it) } }
      panel = null
    }
  }

  private fun showLoading(title: String) = renderPanel(JSONObject().put("state", "loading").put("title", title))

  private fun showError(title: String, message: String) =
    renderPanel(JSONObject().put("state", "error").put("title", title).put("message", message))

  @SuppressLint("SetTextI18n")
  private fun renderPanel(state: JSONObject) {
    panel?.let { runCatching { wm.removeView(it) } }

    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(16), dp(14), dp(16), dp(16))
      background = GradientDrawable().apply {
        setColor(Color.parseColor("#F2161220"))
        cornerRadius = dp(22).toFloat()
      }
      elevation = dp(12).toFloat()
    }

    // Header: title + close
    val header = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
    header.addView(label(state.optString("title", "Rizz AI ✨"), 16f, "#FFFFFF", bold = true), LinearLayout.LayoutParams(0, -2, 1f))
    header.addView(label("✕", 18f, "#B9B3C9").apply {
      setPadding(dp(10), dp(4), dp(4), dp(4))
      contentDescription = "Close"
      setOnClickListener { hidePanel() }
    })
    root.addView(header)

    when (state.optString("state")) {
      "loading" -> root.addView(label("Thinking of something good…", 14f, "#B9B3C9").apply { setPadding(0, dp(8), 0, 0) })
      "error" -> root.addView(label(state.optString("message"), 14f, "#FFB4C8").apply { setPadding(0, dp(8), 0, 0) })
      else -> renderResult(root, state)
    }

    val scroll = ScrollView(this).apply {
      isVerticalScrollBarEnabled = false
      addView(root)
    }
    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.WRAP_CONTENT, overlayType(),
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
      PixelFormat.TRANSLUCENT,
    ).apply {
      gravity = Gravity.BOTTOM
      y = dp(12)
      horizontalMargin = 0.03f
    }
    wm.addView(scroll, params)
    // Cap the height so the chat underneath stays visible.
    scroll.post {
      val max = (resources.displayMetrics.heightPixels * 0.55).toInt()
      if (scroll.height > max) { params.height = max; wm.updateViewLayout(scroll, params) }
    }
    panel = scroll
  }

  @SuppressLint("SetTextI18n")
  private fun renderResult(root: LinearLayout, state: JSONObject) {
    state.optJSONObject("vibe")?.let { vibe ->
      val interest = vibe.optInt("interest")
      val bar = "▰".repeat(interest / 10) + "▱".repeat(10 - interest / 10)
      root.addView(label("Vibe $bar $interest% · ${vibe.optString("mood")}", 13f, "#FFD166").apply { setPadding(0, dp(6), 0, 0) })
      root.addView(label(vibe.optString("summary"), 13f, "#B9B3C9").apply { setPadding(0, dp(2), 0, dp(4)) })
    }

    state.optJSONObject("safety")?.let { s ->
      if (s.optString("flag", "none") != "none") {
        root.addView(label("⚠️ ${s.optString("message")}", 13f, "#FFB4C8").apply {
          setPadding(dp(10), dp(8), dp(10), dp(8))
          background = GradientDrawable().apply { setColor(Color.parseColor("#33FF4D8D")); cornerRadius = dp(12).toFloat() }
        }, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(6) })
      }
    }

    // Tone chips
    val tones = state.optJSONArray("tones")
    val active = state.optString("activeTone")
    if (tones != null && tones.length() > 0) {
      val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
      for (i in 0 until tones.length()) {
        val t = tones.getJSONObject(i)
        val id = t.getString("id")
        val selected = id == active
        row.addView(label("${t.optString("emoji")} ${t.optString("label")}", 13f, if (selected) "#FFFFFF" else "#D9D3E8").apply {
          setPadding(dp(12), dp(6), dp(12), dp(6))
          background = GradientDrawable().apply {
            setColor(Color.parseColor(if (selected) "#FF4D8D" else "#2A2438"))
            cornerRadius = dp(16).toFloat()
          }
          setOnClickListener {
            if (!selected) {
              showLoading("Switching to ${t.optString("label")}…")
              listener?.invoke("onToneChange", JSONObject().put("tone", id).toString())
            }
          }
        }, LinearLayout.LayoutParams(-2, -2).apply { rightMargin = dp(6) })
      }
      root.addView(HorizontalScrollView(this).apply {
        isHorizontalScrollBarEnabled = false
        addView(row)
      }, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(10); bottomMargin = dp(4) })
    }

    // Suggestion cards — tap to copy
    val suggestions = state.optJSONArray("suggestions")
    if (suggestions != null) {
      for (i in 0 until suggestions.length()) {
        val s = suggestions.getJSONObject(i)
        val text = s.getString("text")
        val card = LinearLayout(this).apply {
          orientation = LinearLayout.VERTICAL
          setPadding(dp(14), dp(12), dp(14), dp(12))
          background = GradientDrawable().apply { setColor(Color.parseColor("#241E33")); cornerRadius = dp(16).toFloat() }
          isClickable = true
          contentDescription = "Copy: $text"
          setOnClickListener { copy(text) }
        }
        card.addView(label(text, 15f, "#FFFFFF"))
        card.addView(label("💡 ${s.optString("why")}", 12f, "#9C95AE").apply { setPadding(0, dp(4), 0, 0) })
        root.addView(card, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(8) })
      }
    }

    state.optString("coachTip").takeIf { it.isNotBlank() }?.let {
      root.addView(label("🧠 $it", 12f, "#9C95AE").apply { setPadding(0, dp(10), 0, 0) })
    }

    root.addView(label("↻  New ideas", 14f, "#FF8FB5", bold = true).apply {
      gravity = Gravity.CENTER
      setPadding(0, dp(12), 0, 0)
      setOnClickListener {
        showLoading("Cooking up new ones…")
        listener?.invoke("onRegenerate", "{}")
      }
    })
  }

  private fun copy(text: String) {
    val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    cm.setPrimaryClip(ClipData.newPlainText("Rizz AI reply", text))
    Toast.makeText(this, "Copied! Long-press the message box to paste 💬", Toast.LENGTH_SHORT).show()
    hidePanel()
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private fun label(text: String, size: Float, color: String, bold: Boolean = false) = TextView(this).apply {
    this.text = text
    textSize = size
    setTextColor(Color.parseColor(color))
    if (bold) typeface = Typeface.DEFAULT_BOLD
  }

  private fun dp(v: Int) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt()

  private fun buildNotification(): Notification {
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      nm.createNotificationChannel(NotificationChannel(CHANNEL_ID, "Live mode", NotificationManager.IMPORTANCE_LOW))
    }
    val stop = PendingIntent.getService(
      this, 0, Intent(this, BubbleService::class.java).setAction(ACTION_STOP),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(this, CHANNEL_ID)
    else @Suppress("DEPRECATION") Notification.Builder(this)
    return builder
      .setContentTitle("Rizz AI live mode is on")
      .setContentText("Tap the ✨ bubble in any chat. The screen is only read when you tap.")
      .setSmallIcon(android.R.drawable.ic_menu_edit)
      .setOngoing(true)
      .addAction(Notification.Action.Builder(null, "Stop", stop).build())
      .build()
  }
}
