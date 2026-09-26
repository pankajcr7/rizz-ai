package expo.modules.rizzoverlay

import android.annotation.SuppressLint
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.inputmethodservice.InputMethodService
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.inputmethod.EditorInfo
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Rizz AI Keyboard: a normal QWERTY keyboard with a ✨ bar on top.
 *
 *   1. Copy their message in any app.
 *   2. Tap ✨ — the keyboard reads the clipboard (allowed for the active IME)
 *      and, if you've started typing, your draft.
 *   3. Tap a suggestion to type it into the chat.
 *
 * Nothing is sent until the user taps ✨. Nothing is ever sent to the chat app
 * without the user tapping a suggestion and then pressing send themselves.
 */
class RizzKeyboardService : InputMethodService() {
  private val main = Handler(Looper.getMainLooper())
  private val io = Executors.newSingleThreadExecutor()

  private lateinit var root: LinearLayout
  private lateinit var bar: LinearLayout
  private lateinit var keys: LinearLayout
  private var shift = false
  private var capsLock = false
  private var symbols = false
  private var lastSpaceAt = 0L
  private var requestSeq = 0

  private val tones = listOf("smooth" to "😎 Smooth", "flirty" to "😏 Flirty", "funny" to "😂 Funny", "witty" to "🧠 Witty", "sweet" to "🥰 Sweet", "confident" to "🔥 Confident")

  override fun onCreateInputView(): View {
    root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setBackgroundColor(Color.parseColor(BG))
      setPadding(dp(4), dp(6), dp(4), dp(8))
    }
    bar = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
    keys = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
    root.addView(bar, LinearLayout.LayoutParams(-1, dp(58)))
    root.addView(keys)
    showIdleBar()
    renderKeys()
    return root
  }

  override fun onStartInputView(info: EditorInfo?, restarting: Boolean) {
    super.onStartInputView(info, restarting)
    // Sentence-start capitalisation for text fields.
    val capsMode = currentInputConnection?.getCursorCapsMode(info?.inputType ?: 0) ?: 0
    shift = capsMode != 0
    capsLock = false
    symbols = false
    if (::keys.isInitialized) {
      renderKeys()
      showIdleBar()
    }
  }

  override fun onDestroy() {
    io.shutdownNow()
    super.onDestroy()
  }

  // ---------------------------------------------------------------------------
  // Rizz bar
  // ---------------------------------------------------------------------------

  private fun currentTone(): Pair<String, String> {
    val id = KeyboardConfig.load(this)?.tone ?: "smooth"
    return tones.firstOrNull { it.first == id } ?: tones[0]
  }

  @SuppressLint("SetTextI18n")
  private fun showIdleBar(hint: String? = null) {
    bar.removeAllViews()
    bar.addView(pill("✨ Rizz", accent = true) { rizz() })
    bar.addView(pill(currentTone().second) { cycleTone(rerun = false) })
    bar.addView(label(hint ?: "Copy their message, then tap ✨", 12f, MUTED).apply {
      setPadding(dp(8), 0, dp(4), 0)
      maxLines = 2
    }, LinearLayout.LayoutParams(0, -2, 1f))
  }

  private fun showMessage(text: String, color: String = MUTED) {
    bar.removeAllViews()
    bar.addView(label(text, 13f, color).apply { setPadding(dp(10), 0, dp(10), 0) }, LinearLayout.LayoutParams(0, -2, 1f))
    bar.addView(pill("✕") { showIdleBar() })
  }

  private fun showSuggestions(items: List<String>, replaceDraft: Int) {
    bar.removeAllViews()
    val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
    for (text in items) {
      row.addView(pill(text, maxWidth = dp(240)) {
        val ic = currentInputConnection ?: return@pill
        // Improving a draft replaces what the user typed; otherwise just insert.
        if (replaceDraft > 0) ic.deleteSurroundingText(replaceDraft, 0)
        ic.commitText(text, 1)
        showIdleBar("Typed it — edit if you like, then send 🔥")
      })
    }
    row.addView(pill(currentTone().second) { cycleTone(rerun = true) })
    row.addView(pill("↻") { rizz() })
    row.addView(pill("✕") { showIdleBar() })
    bar.addView(HorizontalScrollView(this).apply {
      isHorizontalScrollBarEnabled = false
      addView(row)
    }, LinearLayout.LayoutParams(-1, -1))
  }

  private fun cycleTone(rerun: Boolean) {
    val i = tones.indexOfFirst { it.first == currentTone().first }
    val next = tones[(i + 1) % tones.size]
    KeyboardConfig.saveTone(this, next.first)
    if (rerun) rizz() else showIdleBar()
  }

  /** Read clipboard (their message) + text before the cursor (your draft) and ask the backend. */
  private fun rizz() {
    val cfg = KeyboardConfig.load(this)
    if (cfg == null || cfg.token.isBlank()) {
      showMessage("Open the Rizz AI app once to connect the keyboard", DANGER)
      return
    }
    val clip = runCatching {
      val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
      cm.primaryClip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.coerceToText(this)?.toString()?.trim()
    }.getOrNull().orEmpty().take(1000)
    val draft = currentInputConnection?.getTextBeforeCursor(500, 0)?.toString()?.trim().orEmpty()

    if (clip.isEmpty() && draft.isEmpty()) {
      showMessage("Copy their message first (long-press it → Copy), then tap ✨")
      return
    }

    val seq = ++requestSeq
    showMessage(if (clip.isNotEmpty()) "Reading the vibe…" else "Polishing your reply…")
    val tone = currentTone().first
    io.execute {
      val result = runCatching { requestSuggestions(cfg, tone, clip, draft) }
      main.post {
        if (seq != requestSeq) return@post
        result.fold(
          onSuccess = { list ->
            if (list.isEmpty()) showMessage("Rizz AI can't help with this one.") else showSuggestions(list, if (draft.isNotEmpty()) draft.length else 0)
          },
          onFailure = { showMessage(it.message ?: "Something went wrong", DANGER) },
        )
      }
    }
  }

  private fun requestSuggestions(cfg: KeyboardConfig.Config, tone: String, clip: String, draft: String): List<String> {
    val messages = JSONArray()
    // No copied message → send only the draft; the backend then just polishes it.
    if (clip.isNotEmpty()) messages.put(JSONObject().put("from", "them").put("text", clip))
    val body = JSONObject()
      .put("platform", "other")
      .put("tone", tone)
      .put("messages", messages)
      .put("count", 3)
      .put("prefs", JSONObject().put("length", "short").put("emoji", 1).put("language", cfg.language).put("boldness", cfg.boldness))
    if (draft.isNotEmpty()) body.put("draft", draft.take(1000))

    val conn = (URL("${cfg.apiUrl}/v1/suggest").openConnection() as HttpURLConnection).apply {
      requestMethod = "POST"
      connectTimeout = 10_000
      readTimeout = 45_000
      doOutput = true
      setRequestProperty("content-type", "application/json")
      setRequestProperty("authorization", "Bearer ${cfg.token}")
    }
    try {
      conn.outputStream.use { it.write(body.toString().toByteArray()) }
      val code = conn.responseCode
      val text = (if (code in 200..299) conn.inputStream else conn.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
      if (code == 401) throw IllegalStateException("Open the Rizz AI app to reconnect the keyboard")
      if (code !in 200..299) {
        val msg = runCatching { JSONObject(text).getJSONObject("error").getString("message") }.getOrNull()
        throw IllegalStateException(msg ?: "Couldn't get replies ($code)")
      }
      val arr = JSONObject(text).getJSONArray("suggestions")
      return (0 until arr.length()).map { arr.getJSONObject(it).getString("text") }
    } catch (e: java.io.IOException) {
      throw IllegalStateException("No connection to Rizz AI")
    } finally {
      conn.disconnect()
    }
  }

  // ---------------------------------------------------------------------------
  // Keys
  // ---------------------------------------------------------------------------

  private val letters = listOf("qwertyuiop", "asdfghjkl", "zxcvbnm")
  private val syms = listOf("1234567890", "@#₹_&-+()/", "*\"':;!?")

  private fun renderKeys() {
    keys.removeAllViews()
    val rows = if (symbols) syms else letters
    rows.forEachIndexed { i, row ->
      val line = keyRow()
      if (i == 1 && !symbols) line.setPadding(dp(16), 0, dp(16), 0)
      if (i == 2 && !symbols) line.addView(key(if (capsLock) "⇪" else "⇧", special = true, weight = 1.5f) { toggleShift() })
      for (c in row) {
        val ch = if (!symbols && (shift || capsLock)) c.uppercaseChar() else c
        line.addView(key(ch.toString()) { type(ch.toString()) })
      }
      if (i == 2) line.addView(repeatKey("⌫", weight = 1.5f) { backspace() })
      keys.addView(line)
    }
    val bottom = keyRow()
    bottom.addView(key(if (symbols) "ABC" else "?123", special = true, weight = 1.5f) { symbols = !symbols; renderKeys() })
    if (Build.VERSION.SDK_INT >= 28 && shouldOfferSwitchingToNextInputMethod()) {
      bottom.addView(key("🌐", special = true) { switchToNextInputMethod(false) })
    }
    bottom.addView(key(",") { type(",") })
    bottom.addView(key("space", special = true, weight = 4f) { space() })
    bottom.addView(key(".") { type(".") })
    bottom.addView(key("⏎", special = true, weight = 1.5f, accent = true) { enter() })
    keys.addView(bottom)
  }

  private fun type(s: String) {
    currentInputConnection?.commitText(s, 1)
    if (shift && !capsLock) {
      shift = false
      renderKeys()
    }
  }

  private fun space() {
    val ic = currentInputConnection ?: return
    val now = System.currentTimeMillis()
    // Double-space → ". " like most keyboards.
    val before = ic.getTextBeforeCursor(2, 0)?.toString().orEmpty()
    if (now - lastSpaceAt < 400 && before.length == 2 && before[1] == ' ' && before[0].isLetterOrDigit()) {
      ic.deleteSurroundingText(1, 0)
      ic.commitText(". ", 1)
      shift = true
      renderKeys()
    } else {
      ic.commitText(" ", 1)
    }
    lastSpaceAt = now
  }

  private fun backspace() {
    val ic = currentInputConnection ?: return
    val selected = ic.getSelectedText(0)
    if (!selected.isNullOrEmpty()) ic.commitText("", 1) else sendDownUpKeyEvents(KeyEvent.KEYCODE_DEL)
  }

  private fun enter() {
    val info = currentInputEditorInfo
    val action = (info?.imeOptions ?: 0) and EditorInfo.IME_MASK_ACTION
    val noEnterAction = ((info?.imeOptions ?: 0) and EditorInfo.IME_FLAG_NO_ENTER_ACTION) != 0
    if (action != EditorInfo.IME_ACTION_NONE && action != EditorInfo.IME_ACTION_UNSPECIFIED && !noEnterAction) {
      currentInputConnection?.performEditorAction(action)
    } else {
      currentInputConnection?.commitText("\n", 1)
    }
  }

  private fun toggleShift() {
    when {
      capsLock -> { capsLock = false; shift = false }
      shift -> capsLock = true // second tap = caps lock
      else -> shift = true
    }
    renderKeys()
  }

  // ---------------------------------------------------------------------------
  // Views
  // ---------------------------------------------------------------------------

  private fun keyRow() = LinearLayout(this).apply {
    orientation = LinearLayout.HORIZONTAL
    layoutParams = LinearLayout.LayoutParams(-1, dp(50))
  }

  private fun keyBg(special: Boolean, accent: Boolean) = GradientDrawable().apply {
    cornerRadius = dp(8).toFloat()
    setColor(Color.parseColor(if (accent) PINK else if (special) KEY_SPECIAL else KEY))
  }

  private fun key(text: String, special: Boolean = false, weight: Float = 1f, accent: Boolean = false, onTap: () -> Unit): View {
    val v = label(text, if (text.length > 1 && !text.startsWith("⇧") && !text.startsWith("⌫")) 14f else 20f, TEXT).apply {
      gravity = Gravity.CENTER
      background = keyBg(special, accent)
      isClickable = true
      contentDescription = when (text) { "⌫" -> "Delete"; "⏎" -> "Enter"; "⇧", "⇪" -> "Shift"; "🌐" -> "Switch keyboard"; else -> text }
      setOnClickListener {
        it.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
        onTap()
      }
    }
    return v.also { it.layoutParams = LinearLayout.LayoutParams(0, -1, weight).apply { setMargins(dp(3), dp(4), dp(3), dp(4)) } }
  }

  /** Key that repeats while held (backspace). */
  @SuppressLint("ClickableViewAccessibility")
  private fun repeatKey(text: String, weight: Float, onTap: () -> Unit): View {
    val v = key(text, special = true, weight = weight, onTap = onTap)
    val repeater = object : Runnable {
      override fun run() {
        onTap()
        main.postDelayed(this, 60)
      }
    }
    v.setOnTouchListener { view, e ->
      when (e.action) {
        MotionEvent.ACTION_DOWN -> {
          view.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
          onTap()
          main.postDelayed(repeater, 400)
          true
        }
        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
          main.removeCallbacks(repeater)
          true
        }
        else -> false
      }
    }
    return v
  }

  private fun pill(text: String, accent: Boolean = false, maxWidth: Int? = null, onTap: () -> Unit) = label(text, 13f, TEXT, bold = accent).apply {
    gravity = Gravity.CENTER_VERTICAL
    setPadding(dp(12), dp(7), dp(12), dp(7))
    maxLines = 2
    maxWidth?.let { this.maxWidth = it }
    background = GradientDrawable().apply {
      cornerRadius = dp(16).toFloat()
      setColor(Color.parseColor(if (accent) PINK else KEY_SPECIAL))
    }
    isClickable = true
    setOnClickListener {
      it.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
      onTap()
    }
    layoutParams = LinearLayout.LayoutParams(-2, -2).apply { setMargins(dp(3), 0, dp(3), 0) }
  }

  private fun label(text: String, size: Float, color: String, bold: Boolean = false) = TextView(this).apply {
    this.text = text
    textSize = size
    setTextColor(Color.parseColor(color))
    if (bold) typeface = Typeface.DEFAULT_BOLD
  }

  private fun dp(v: Int) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt()

  private companion object {
    const val BG = "#0B0A0F"
    const val KEY = "#272335"
    const val KEY_SPECIAL = "#1E1B28"
    const val PINK = "#FF3D7F"
    const val TEXT = "#F5F3F7"
    const val MUTED = "#A8A3B5"
    const val DANGER = "#F43F5E"
  }
}
