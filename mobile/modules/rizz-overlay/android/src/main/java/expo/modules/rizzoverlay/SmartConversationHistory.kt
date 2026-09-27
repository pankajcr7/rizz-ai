package expo.modules.rizzoverlay

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

/** Private, bounded transcript cache. A contact on two apps has two separate histories. */
object SmartConversationHistory {
  private const val PREFS = "rizz_smart_history"
  private const val MAX_MESSAGES = 360

  data class Line(val from: String, val text: String) {
    fun json() = JSONObject().put("from", from).put("text", text)
  }

  private fun key(pkg: String, name: String) = "$pkg|${name.trim().lowercase(Locale.ROOT)}"

  @Synchronized fun get(ctx: Context, pkg: String, name: String): List<Line> {
    val raw = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(key(pkg, name), null) ?: return emptyList()
    return runCatching {
      val arr = JSONArray(raw)
      (0 until arr.length()).mapNotNull { i ->
        val item = arr.optJSONObject(i) ?: return@mapNotNull null
        val from = item.optString("from")
        val text = item.optString("text").trim()
        if (from in setOf("me", "them") && text.isNotEmpty()) Line(from, text.take(1000)) else null
      }
    }.getOrDefault(emptyList())
  }

  /** Merges repeated notification snapshots and on-screen scans by their common edge. */
  @Synchronized fun append(ctx: Context, pkg: String, name: String, incoming: List<Line>): List<Line> {
    if (pkg !in SmartNotify.SUPPORTED || name.isBlank() || incoming.isEmpty()) return get(ctx, pkg, name)
    val old = get(ctx, pkg, name)
    val fresh = incoming.filter { it.from in setOf("me", "them") && it.text.isNotBlank() }
      .map { Line(it.from, it.text.trim().take(1000)) }
    if (fresh.isEmpty()) return old
    val merged = when {
      old.isEmpty() -> fresh
      fresh.size >= old.size && fresh.windowed(old.size).any { it == old } -> fresh
      old.size >= fresh.size && old.windowed(fresh.size).any { it == fresh } -> old
      else -> {
        val overlap = (minOf(old.size, fresh.size) downTo 1).firstOrNull { n -> old.takeLast(n) == fresh.take(n) } ?: 0
        val reverse = (minOf(old.size, fresh.size) downTo 1).firstOrNull { n -> fresh.takeLast(n) == old.take(n) } ?: 0
        if (reverse > overlap) fresh + old.drop(reverse) else old + fresh.drop(overlap)
      }
    }.takeLast(MAX_MESSAGES)
    val array = JSONArray()
    merged.forEach { array.put(it.json()) }
    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(key(pkg, name), array.toString()).apply()
    return merged
  }

  @Synchronized fun clear(ctx: Context, pkg: String? = null) {
    val prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val editor = prefs.edit()
    if (pkg == null) editor.clear() else prefs.all.keys.filter { it.startsWith("$pkg|") }.forEach(editor::remove)
    editor.apply()
  }

  fun markFullyRead(ctx: Context, pkg: String, name: String) {
    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("${key(pkg, name)}|complete", true).apply()
  }

  fun fullyRead(ctx: Context, pkg: String, name: String): Boolean =
    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("${key(pkg, name)}|complete", false)
}
