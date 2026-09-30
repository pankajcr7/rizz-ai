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
import android.graphics.Rect
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.abs

/**
 * Foreground service that owns live mode: the floating bubble, the screen
 * capturer, and the panel drawn over other apps.
 *
 *  - Tap the bubble: read this screen and get replies.
 *  - Long-press it (or "Read whole chat" in the panel): history mode. The
 *    user scrolls up while every screen is read; "Done" sends all screens to
 *    JS, which stitches them into one transcript.
 *  - "Coach" in the panel: ask the wingman about this chat, with a text box.
 */
class BubbleService : Service() {
  companion object {
    const val EXTRA_RESULT_CODE = "resultCode"
    const val EXTRA_RESULT_DATA = "resultData"
    private const val ACTION_STOP = "expo.modules.rizzoverlay.STOP"
    private const val CHANNEL_ID = "rizz_live"
    private const val NOTIFICATION_ID = 4210
    private const val LIVE_BG = "#F20B0B0C"
    private const val LIVE_SURFACE = "#19191B"
    private const val LIVE_SURFACE_2 = "#2B2B2F"
    private const val LIVE_LIME = "#D5FF63"
    private const val LIVE_PINK = "#FF3EAD"
    private const val LIVE_DIM = "#B4B4B9"
    /** Screens kept per history read: plenty for a long chat, bounded memory and upload. */
    private const val MAX_HISTORY_FRAMES = 45

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
  private var panelParams: WindowManager.LayoutParams? = null
  private var busy = false

  // History mode
  private var pill: View? = null
  private var pillLabel: TextView? = null
  private var historyActive = false
  private val historyFrames = mutableListOf<JSONObject>()
  private val historyNames = mutableListOf<String>()
  private val historyPlatforms = mutableListOf<String>()
  private var lastFrameKey = ""

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
    capturer = try {
      ScreenCapturer(this, projection) { main.post { stopSelf() } }
    } catch (e: Exception) {
      stopSelf() // capture unavailable — end live mode instead of crashing
      return START_NOT_STICKY
    }
    instance = this
    addBubble()
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    instance = null
    historyActive = false
    removePill()
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
      text = "R"
      textSize = 28f
      setTextColor(Color.parseColor("#0B0B0C"))
      typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD_ITALIC)
      gravity = Gravity.CENTER
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(Color.parseColor(LIVE_LIME))
        setStroke(dp(3), Color.parseColor("#0B0B0C"))
      }
      elevation = dp(6).toFloat()
      contentDescription = "Rizz AI Live: tap for replies, hold to read the whole chat"
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

    var downX = 0f; var downY = 0f; var startX = 0; var startY = 0; var moved = false; var longPressed = false
    val longPress = Runnable {
      longPressed = true
      view.performHapticFeedback(android.view.HapticFeedbackConstants.LONG_PRESS)
      startHistory()
    }
    view.setOnTouchListener { v, e ->
      when (e.action) {
        MotionEvent.ACTION_DOWN -> {
          downX = e.rawX; downY = e.rawY; startX = params.x; startY = params.y; moved = false; longPressed = false
          main.postDelayed(longPress, 550)
          true
        }
        MotionEvent.ACTION_MOVE -> {
          val dx = e.rawX - downX; val dy = e.rawY - downY
          if (abs(dx) > dp(6) || abs(dy) > dp(6)) { moved = true; main.removeCallbacks(longPress) }
          params.x = startX + dx.toInt(); params.y = startY + dy.toInt()
          wm.updateViewLayout(v, params); true
        }
        MotionEvent.ACTION_UP -> {
          main.removeCallbacks(longPress)
          if (moved) snapToEdge(v, params) else if (!longPressed) onBubbleTap()
          true
        }
        MotionEvent.ACTION_CANCEL -> { main.removeCallbacks(longPress); false }
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
    if (busy || historyActive) return
    captureAndRead()
  }

  /** Posts an event to JS, or explains in the panel that the app's JS side isn't running. */
  private fun emit(event: String, json: String): Boolean {
    val l = listener
    if (l == null) {
      showError("Rizz AI is asleep", "Open the Rizz AI app once, then come back and tap the bubble.")
      return false
    }
    l(event, json)
    return true
  }

  private fun action(name: String, extra: JSONObject = JSONObject()) = emit("onAction", extra.put("action", name).toString())

  private fun captureAndRead() {
    val cap = capturer ?: return
    busy = true
    val ignored = listOfNotNull(bubbleRect())
    bubble?.visibility = View.INVISIBLE // keep the bubble out of the screenshot
    fun tryCapture(attempt: Int) {
      if (capturer !== cap) return
      val bitmap = runCatching { cap.grab() }.getOrNull()
      if (bitmap == null && attempt < 8) {
        main.postDelayed({ tryCapture(attempt + 1) }, 180)
        return
      }
      bubble?.visibility = View.VISIBLE
      if (bitmap == null) {
        busy = false
        showError("Couldn't read the screen", "Screen sharing may have stopped. Turn Live mode off, then start it again.")
        return
      }
      showLoading("Reading the chat…")
      ChatOcr.parse(bitmap, ignored, { transcript ->
        bitmap.recycle()
        busy = false
        if (transcript.getJSONArray("messages").length() == 0) {
          showError(
            "No chat found here",
            "Open a conversation and tap again. Some apps block screen reading — use Screenshot mode in the app instead.",
          )
          return@parse
        }
        transcript.put("mode", "screen")
        if (listener != null) showLoading("Reading the vibe…")
        emit("onCapture", transcript.toString())
      }, { err ->
        bitmap.recycle()
        busy = false
        showError("Couldn't read the text", err.message ?: "Try again.")
      })
    }
    main.postDelayed({ tryCapture(0) }, 220)
  }

  /** Ignore the floating bubble if Android captured a frame before it disappeared. */
  private fun bubbleRect(): Rect? {
    val view = bubble ?: return null
    if (view.width == 0) return null
    val location = IntArray(2)
    view.getLocationOnScreen(location)
    return Rect(location[0], location[1], location[0] + view.width, location[1] + view.height)
  }

  // ---------------------------------------------------------------------------
  // History mode: read every screen while the user scrolls up
  // ---------------------------------------------------------------------------

  fun startHistory() {
    if (historyActive || capturer == null) return
    hidePanelNow()
    historyActive = true
    busy = false
    historyFrames.clear()
    historyNames.clear()
    historyPlatforms.clear()
    lastFrameKey = ""
    bubble?.visibility = View.GONE
    addPill()
    main.postDelayed({ readHistoryFrame() }, 250) // let the panel disappear first
  }

  private fun readHistoryFrame() {
    if (!historyActive) return
    val cap = capturer ?: return
    val bitmap = runCatching { cap.grab() }.getOrNull()
    if (bitmap == null) {
      main.postDelayed({ readHistoryFrame() }, 300)
      return
    }
    ChatOcr.parse(bitmap, listOfNotNull(pillRect()), { t ->
      bitmap.recycle()
      if (!historyActive) return@parse
      val messages = t.getJSONArray("messages")
      val key = messages.toString()
      if (messages.length() > 0 && key != lastFrameKey) {
        lastFrameKey = key
        historyFrames += JSONObject().put("messages", messages)
        t.optString("theirName").takeIf { it.isNotBlank() && !t.isNull("theirName") }?.let { historyNames += it }
        historyPlatforms += t.optString("platform", "other")
        updatePill()
      }
      if (historyFrames.size >= MAX_HISTORY_FRAMES) finishHistory()
      else main.postDelayed({ readHistoryFrame() }, 250)
    }, {
      bitmap.recycle()
      if (historyActive) main.postDelayed({ readHistoryFrame() }, 400)
    })
  }

  private fun finishHistory() {
    if (!historyActive) return
    historyActive = false
    removePill()
    bubble?.visibility = View.VISIBLE
    if (historyFrames.isEmpty()) {
      showError(
        "No chat found here",
        "Open a conversation, then hold the R bubble and scroll up slowly. Some apps block screen reading.",
      )
      return
    }
    val payload = JSONObject()
      .put("mode", "history")
      .put("frames", JSONArray(historyFrames))
      .put("names", JSONArray(historyNames))
      .put("platforms", JSONArray(historyPlatforms))
    historyFrames.clear()
    if (listener != null) showLoading("Reading the whole chat…")
    emit("onCapture", payload.toString())
  }

  private fun cancelHistory() {
    historyActive = false
    historyFrames.clear()
    removePill()
    bubble?.visibility = View.VISIBLE
  }

  @SuppressLint("SetTextI18n")
  private fun addPill() {
    val row = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      setPadding(dp(16), dp(8), dp(8), dp(8))
      background = GradientDrawable().apply {
        setColor(Color.parseColor(LIVE_BG))
        cornerRadius = dp(28).toFloat()
        setStroke(dp(1), Color.parseColor(LIVE_LIME))
      }
      elevation = dp(10).toFloat()
    }
    val text = label("Scroll up slowly…", 14f, "#FFFFFF", bold = true)
    row.addView(text)
    row.addView(chip("Done ✓", primary = true) { finishHistory() }, LinearLayout.LayoutParams(-2, -2).apply { leftMargin = dp(12) })
    row.addView(label("✕", 18f, LIVE_DIM).apply {
      setPadding(dp(12), dp(4), dp(8), dp(4))
      contentDescription = "Cancel"
      setOnClickListener { cancelHistory() }
    })
    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT, overlayType(),
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
      PixelFormat.TRANSLUCENT,
    ).apply {
      // Over the message box, which is ignored by the reader anyway — the chat itself stays visible.
      gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
      y = dp(14)
    }
    wm.addView(row, params)
    pill = row
    pillLabel = text
  }

  @SuppressLint("SetTextI18n")
  private fun updatePill() {
    val n = historyFrames.size
    pillLabel?.text = if (n <= 1) "Scroll up slowly…" else "Read $n screens · keep going"
  }

  private fun removePill() {
    pill?.let { runCatching { wm.removeView(it) } }
    pill = null
    pillLabel = null
  }

  /** Where the pill is on screen, so the reader skips it. */
  private fun pillRect(): Rect? {
    val v = pill ?: return null
    if (v.width == 0) return null
    val loc = IntArray(2)
    v.getLocationOnScreen(loc)
    return Rect(loc[0], loc[1], loc[0] + v.width, loc[1] + v.height)
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
    main.post { hidePanelNow() }
  }

  private fun hidePanelNow() {
    panel?.let { v ->
      (getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager).hideSoftInputFromWindow(v.windowToken, 0)
      runCatching { wm.removeView(v) }
    }
    panel = null
    panelParams = null
  }

  /** The coach panel takes typing; everything else must never steal focus from the chat app. */
  private fun setPanelFocusable(focusable: Boolean) {
    val v = panel ?: return
    val p = panelParams ?: return
    val base = WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH
    p.flags = if (focusable) base else base or WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
    runCatching { wm.updateViewLayout(v, p) }
  }

  private fun showLoading(title: String) = renderPanel(JSONObject().put("state", "loading").put("title", title))

  private fun showError(title: String, message: String) =
    renderPanel(JSONObject().put("state", "error").put("title", title).put("message", message))

  @SuppressLint("SetTextI18n", "ClickableViewAccessibility")
  private fun renderPanel(state: JSONObject) {
    hidePanelNow()
    val coach = state.optString("state") == "coach"

    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(18), dp(15), dp(18), dp(18))
      background = GradientDrawable().apply {
        setColor(Color.parseColor(LIVE_BG))
        cornerRadius = dp(28).toFloat()
        setStroke(dp(1), Color.parseColor(LIVE_LIME))
      }
      elevation = dp(12).toFloat()
    }

    root.addView(View(this).apply {
      background = GradientDrawable().apply { setColor(Color.parseColor("#45454A")); cornerRadius = dp(3).toFloat() }
    }, LinearLayout.LayoutParams(dp(34), dp(4)).apply { gravity = Gravity.CENTER_HORIZONTAL; bottomMargin = dp(12) })
    root.addView(label("RIZZ AI  •  LIVE", 11f, LIVE_LIME, bold = true).apply {
      letterSpacing = 0.16f
      setPadding(0, 0, 0, dp(7))
    })
    // Keep the title and close control visible above the swipeable reply deck.
    val header = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
    header.addView(label(state.optString("title", "Rizz AI"), 21f, "#FFFFFF", bold = true), LinearLayout.LayoutParams(0, -2, 1f))
    header.addView(label("✕", 20f, LIVE_DIM).apply {
      setPadding(dp(10), dp(4), dp(4), dp(4))
      contentDescription = "Close"
      setOnClickListener { hidePanel() }
    })
    root.addView(header)

    when (state.optString("state")) {
      "loading" -> root.addView(label("Reading the room…", 15f, LIVE_DIM).apply { setPadding(0, dp(12), 0, dp(4)) })
      "error" -> root.addView(label(state.optString("message"), 14f, "#FFD0E6").apply { setPadding(0, dp(12), 0, dp(4)) })
      "coach" -> renderCoach(root, state)
      else -> renderResult(root, state)
    }

    val scroll = ScrollView(this).apply {
      isVerticalScrollBarEnabled = false
      addView(root)
    }
    // Back closes the panel when it has focus (coach mode); outside taps hand focus back to the chat app.
    val frame = object : FrameLayout(this) {
      override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.keyCode == KeyEvent.KEYCODE_BACK) {
          if (event.action == KeyEvent.ACTION_UP) hidePanelNow()
          return true
        }
        return super.dispatchKeyEvent(event)
      }
    }
    frame.addView(scroll)
    frame.setOnTouchListener { _, e ->
      if (e.action == MotionEvent.ACTION_OUTSIDE) setPanelFocusable(false)
      false
    }
    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.WRAP_CONTENT, overlayType(),
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
        WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH,
      PixelFormat.TRANSLUCENT,
    ).apply {
      // The coach sits at the top so the keyboard doesn't cover it.
      gravity = if (coach) Gravity.TOP else Gravity.BOTTOM
      y = if (coach) dp(36) else dp(12)
      horizontalMargin = 0.03f
    }
    wm.addView(frame, params)
    panel = frame
    panelParams = params
    // Cap the height so the chat underneath stays visible.
    frame.post {
      val max = (resources.displayMetrics.heightPixels * if (coach) 0.5 else 0.55).toInt()
      if (frame.height > max && panel === frame) { params.height = max; runCatching { wm.updateViewLayout(frame, params) } }
      if (coach) scroll.fullScroll(View.FOCUS_DOWN)
    }
  }

  /** Wingman chat about the chat on screen: preset questions, a text box, and copyable answers. */
  @SuppressLint("SetTextI18n")
  private fun renderCoach(root: LinearLayout, state: JSONObject) {
    val turns = state.optJSONArray("turns") ?: JSONArray()
    if (turns.length() == 0) {
      root.addView(label(state.optString("intro", "Ask me anything about this chat."), 13f, LIVE_DIM).apply { setPadding(0, dp(8), 0, 0) })
    }
    for (i in 0 until turns.length()) {
      val t = turns.getJSONObject(i)
      val mine = t.optString("role") == "user"
      if (mine) {
        root.addView(label(t.optString("content"), 14f, "#FFFFFF").apply {
          setPadding(dp(12), dp(8), dp(12), dp(8))
          background = GradientDrawable().apply { setColor(Color.parseColor(LIVE_PINK)); cornerRadius = dp(16).toFloat() }
        }, LinearLayout.LayoutParams(-2, -2).apply { topMargin = dp(10); gravity = Gravity.END })
      } else {
        // Each paragraph can be copied on its own: the coach puts ready-to-send lines on separate lines.
        t.optString("content").split("\n").map { it.trim() }.filter { it.isNotEmpty() }.forEach { para ->
          val sendable = para.removePrefix("-").removePrefix("•").trim().trim('"', '“', '”')
          root.addView(label(para, 14f, "#FFFFFF").apply {
            setPadding(dp(12), dp(8), dp(12), dp(8))
            background = GradientDrawable().apply { setColor(Color.parseColor(LIVE_SURFACE_2)); cornerRadius = dp(16).toFloat() }
            contentDescription = "Coach: $para. Tap to copy."
            setOnClickListener { copy(sendable, close = false) }
          }, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(6) })
        }
      }
    }
    if (state.optBoolean("thinking")) {
      root.addView(label("Coach is typing…", 13f, LIVE_DIM).apply { setPadding(0, dp(8), 0, 0) })
    } else if (turns.length() > 0) {
      root.addView(label("Tap any line to copy it", 11f, LIVE_DIM).apply { setPadding(0, dp(6), 0, 0) })
    }

    val chips = state.optJSONArray("chips")
    if (chips != null && chips.length() > 0 && !state.optBoolean("thinking")) {
      val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
      for (i in 0 until chips.length()) {
        val q = chips.getString(i)
        row.addView(chip(q) { action("coach_ask", JSONObject().put("question", q)) }, LinearLayout.LayoutParams(-2, -2).apply { rightMargin = dp(6) })
      }
      root.addView(HorizontalScrollView(this).apply {
        isHorizontalScrollBarEnabled = false
        addView(row)
      }, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(10) })
    }

    // Text box + send
    val inputRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
    val input = EditText(this).apply {
      hint = "Ask the coach…"
      setHintTextColor(Color.parseColor(LIVE_DIM))
      setTextColor(Color.WHITE)
      textSize = 14f
      maxLines = 3
      imeOptions = EditorInfo.IME_ACTION_SEND
      inputType = EditorInfo.TYPE_CLASS_TEXT or EditorInfo.TYPE_TEXT_FLAG_CAP_SENTENCES
      setPadding(dp(14), dp(10), dp(14), dp(10))
      background = GradientDrawable().apply { setColor(Color.parseColor(LIVE_SURFACE_2)); cornerRadius = dp(20).toFloat() }
      isEnabled = !state.optBoolean("thinking")
    }
    fun send() {
      val q = input.text.toString().trim()
      if (q.isEmpty()) return
      action("coach_ask", JSONObject().put("question", q))
    }
    input.setOnEditorActionListener { _, id, _ -> if (id == EditorInfo.IME_ACTION_SEND) { send(); true } else false }
    // Taking focus only when the user taps the box keeps the chat app's keyboard working otherwise.
    input.setOnTouchListener { v, e ->
      if (e.action == MotionEvent.ACTION_DOWN) {
        setPanelFocusable(true)
        v.post {
          v.requestFocus()
          (getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager).showSoftInput(v, InputMethodManager.SHOW_IMPLICIT)
        }
      }
      false
    }
    inputRow.addView(input, LinearLayout.LayoutParams(0, -2, 1f))
    inputRow.addView(label("➤", 20f, LIVE_LIME, bold = true).apply {
      setPadding(dp(12), dp(6), dp(4), dp(6))
      contentDescription = "Send"
      setOnClickListener { send() }
    })
    root.addView(inputRow, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(10) })

    root.addView(label("‹  Back to replies", 13f, LIVE_PINK, bold = true).apply {
      setPadding(0, dp(12), 0, 0)
      setOnClickListener { action("show_replies") }
    })
  }

  @SuppressLint("SetTextI18n")
  private fun renderResult(root: LinearLayout, state: JSONObject) {
    state.optJSONObject("vibe")?.let { vibe ->
      val card = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(13), dp(10), dp(13), dp(10))
        background = GradientDrawable().apply { setColor(Color.parseColor(LIVE_SURFACE)); cornerRadius = dp(16).toFloat() }
      }
      card.addView(label("VIBE CHECK  •  ${vibe.optInt("interest")}%", 11f, LIVE_LIME, bold = true))
      vibe.optString("summary").takeIf { it.isNotBlank() }?.let {
        card.addView(label(it, 13f, LIVE_DIM).apply { setPadding(0, dp(4), 0, 0) })
      }
      root.addView(card, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(11) })
    }
    state.optString("stats").takeIf { it.isNotBlank() }?.let {
      root.addView(label(it, 12f, LIVE_DIM).apply { setPadding(0, dp(7), 0, 0) })
    }

    state.optJSONObject("safety")?.let { s ->
      if (s.optString("flag", "none") != "none") {
        root.addView(label("⚠️ ${s.optString("message")}", 13f, "#FFD0E6").apply {
          setPadding(dp(10), dp(8), dp(10), dp(8))
          background = GradientDrawable().apply { setColor(Color.parseColor("#482C2732")); cornerRadius = dp(12).toFloat() }
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
        row.addView(label(t.optString("label"), 13f, if (selected) "#0B0B0C" else "#FFFFFF", bold = selected).apply {
          setPadding(dp(16), dp(8), dp(16), dp(8))
          background = GradientDrawable().apply {
            setColor(Color.parseColor(if (selected) LIVE_PINK else LIVE_SURFACE))
            cornerRadius = dp(19).toFloat()
            if (!selected) setStroke(dp(1), Color.parseColor(LIVE_LIME))
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
      }, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(12); bottomMargin = dp(9) })
    }

    // Large, swipeable reply cards keep the underlying conversation visible.
    val suggestions = state.optJSONArray("suggestions")
    if (suggestions != null && suggestions.length() > 0) {
      root.addView(label("SWIPE FOR YOUR REPLIES", 11f, LIVE_DIM, bold = true).apply { setPadding(0, dp(4), 0, dp(7)) })
      val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
      val cardWidth = (resources.displayMetrics.widthPixels - dp(70)).coerceAtLeast(dp(220))
      for (i in 0 until suggestions.length()) {
        val s = suggestions.getJSONObject(i)
        val text = s.getString("text")
        val card = LinearLayout(this).apply {
          orientation = LinearLayout.VERTICAL
          setPadding(dp(16), dp(13), dp(16), dp(15))
          background = GradientDrawable().apply {
            setColor(Color.parseColor(LIVE_SURFACE))
            cornerRadius = dp(22).toFloat()
            setStroke(dp(1), Color.parseColor("#45454A"))
          }
          isClickable = true
          contentDescription = "Copy: $text"
          setOnClickListener { copy(text) }
        }
        card.addView(label("${i + 1} / ${suggestions.length()}", 11f, LIVE_LIME, bold = true))
        card.addView(label(text, 20f, "#FFFFFF", bold = true), LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(12) })
        s.optString("why").takeIf { it.isNotBlank() }?.let { why ->
          card.addView(label(why, 12f, LIVE_DIM), LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(8) })
        }
        card.addView(label("▣  Copy reply", 15f, "#0B0B0C", bold = true).apply {
          gravity = Gravity.CENTER
          setPadding(dp(10), dp(11), dp(10), dp(11))
          background = GradientDrawable().apply { setColor(Color.parseColor(LIVE_PINK)); cornerRadius = dp(28).toFloat() }
          setOnClickListener { copy(text) }
        }, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(15) })
        row.addView(card, LinearLayout.LayoutParams(cardWidth, -2).apply { rightMargin = dp(9) })
      }
      root.addView(HorizontalScrollView(this).apply {
        isHorizontalScrollBarEnabled = false
        addView(row)
      })
    }

    state.optString("coachTip").takeIf { it.isNotBlank() }?.let {
      root.addView(label(it, 12f, LIVE_DIM).apply { setPadding(0, dp(10), 0, 0) })
    }

    // What else you can do with this chat
    val actions = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
    if (!state.optBoolean("wholeChat")) {
      actions.addView(chip("Read whole chat") { startHistory() }, LinearLayout.LayoutParams(-2, -2).apply { rightMargin = dp(7) })
    }
    actions.addView(chip("Ask coach") { action("coach_open") }, LinearLayout.LayoutParams(-2, -2).apply { rightMargin = dp(7) })
    actions.addView(chip("Fix sides in app") { openApp() }, LinearLayout.LayoutParams(-2, -2).apply { rightMargin = dp(7) })
    root.addView(HorizontalScrollView(this).apply {
      isHorizontalScrollBarEnabled = false
      addView(actions)
    }, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(12) })

    root.addView(label("↻  New ideas", 14f, LIVE_PINK, bold = true).apply {
      gravity = Gravity.CENTER
      setPadding(0, dp(12), 0, 0)
      setOnClickListener {
        showLoading("Cooking up new ones…")
        listener?.invoke("onRegenerate", "{}")
      }
    })
  }

  private fun copy(text: String, close: Boolean = true) {
    val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    cm.setPrimaryClip(ClipData.newPlainText("Rizz AI reply", text))
    Toast.makeText(this, "Copied — paste it in the chat", Toast.LENGTH_SHORT).show()
    if (close) hidePanel()
  }

  /** Opens Rizz AI with this chat loaded, where every bubble can be flipped between you and them. */
  private fun openApp() {
    if (!action("open_in_app")) return
    hidePanelNow()
    packageManager.getLaunchIntentForPackage(packageName)?.let {
      startActivity(it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT))
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private fun chip(text: String, primary: Boolean = false, onClick: () -> Unit) =
    label(text, 13f, if (primary) "#0B0B0C" else "#FFFFFF", bold = true).apply {
      setPadding(dp(14), dp(8), dp(14), dp(8))
      background = GradientDrawable().apply {
        setColor(Color.parseColor(if (primary) LIVE_LIME else LIVE_SURFACE))
        cornerRadius = dp(18).toFloat()
        if (!primary) setStroke(dp(1), Color.parseColor("#45454A"))
      }
      setOnClickListener { onClick() }
    }

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
      .setContentText("Tap ✨ for replies, hold it to read the whole chat. The screen is only read when you ask.")
      .setSmallIcon(android.R.drawable.ic_menu_edit)
      .setOngoing(true)
      .addAction(Notification.Action.Builder(null, "Stop", stop).build())
      .build()
  }
}
