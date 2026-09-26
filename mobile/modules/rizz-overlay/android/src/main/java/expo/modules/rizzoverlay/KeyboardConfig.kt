package expo.modules.rizzoverlay

import android.content.Context
import org.json.JSONObject

/**
 * Settings the keyboard needs (backend URL, session token, tone, language…).
 * The app writes them via RizzOverlayModule.setKeyboardConfig; the keyboard
 * service reads them. Stored in private SharedPreferences.
 */
object KeyboardConfig {
  private const val PREFS = "rizz_keyboard"
  private const val KEY = "config"

  data class Config(
    val apiUrl: String,
    val token: String,
    val tone: String,
    val language: String,
    val boldness: Int,
  )

  fun save(context: Context, json: String) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, json).apply()
  }

  fun load(context: Context): Config? {
    val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null) ?: return null
    return runCatching {
      val o = JSONObject(raw)
      Config(
        apiUrl = o.getString("apiUrl").trimEnd('/'),
        token = o.getString("token"),
        tone = o.optString("tone", "smooth"),
        language = o.optString("language", "auto"),
        boldness = o.optInt("boldness", 3),
      )
    }.getOrNull()
  }

  /** The keyboard can change tone itself; remember it for next time. */
  fun saveTone(context: Context, tone: String) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val raw = prefs.getString(KEY, null) ?: return
    runCatching { prefs.edit().putString(KEY, JSONObject(raw).put("tone", tone).toString()).apply() }
  }
}
