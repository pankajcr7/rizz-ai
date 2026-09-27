package expo.modules.rizzoverlay

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Rect
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * On-device OCR (ML Kit, no network) that turns a chat screenshot into
 * ordered "me"/"them" messages. Who sent what is decided per line from
 * several clues, so it works across chat styles:
 *
 *  - Bubble colour: sent bubbles are coloured (Instagram purple/blue,
 *    WhatsApp green, Messenger/Tinder/Telegram blue); received ones are
 *    grey, white or dark grey. This is the strongest clue.
 *  - Alignment: sent bubbles hug the right edge, received ones the left.
 *  - Snapchat has no bubbles: every message is left-aligned under a small
 *    "ME" or "<THEIR NAME>" label, so labels decide the sender there.
 */
object ChatOcr {
  private val recognizer by lazy { TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS) }

  private val NOISE = listOf(
    Regex("""^\d{1,2}[:.]\d{2}\s*([ap]\.?m\.?)?\s*[✓✔]*$""", RegexOption.IGNORE_CASE),
    // Status words only when they're the whole line ("Seen", "Seen 2h ago", "Delivered just now") — never "today was fun".
    Regex("""^(seen|delivered|sent|read|opened|received|typing\W*|active now|online|today|yesterday|new chat|tap to chat|tap to view|double tap to like|edited)(\s+(just now|by .*|at .*|on .*|\d.*))?$""", RegexOption.IGNORE_CASE),
    Regex("""^(you )?(replied to|reacted .* to|liked a message|sent an attachment|unsent a message)\b.*$""", RegexOption.IGNORE_CASE),
    Regex("""^(active|seen|last seen)\s.*\bago$""", RegexOption.IGNORE_CASE),
    Regex("""^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?(\s+\d{1,2}[:.]\d{2}.*)?$""", RegexOption.IGNORE_CASE),
    Regex("""^\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*(\s+\d{2,4})?(\s+\d{1,2}[:.]\d{2}.*)?$""", RegexOption.IGNORE_CASE),
    Regex("""^(message|message\.\.\.|send a chat|type a message|aa|chat|send message)\W*$""", RegexOption.IGNORE_CASE),
    Regex("""^[\W_]{1,3}$"""), // stray icons read as punctuation
  )
  /** WhatsApp/Telegram print the time inside the bubble, on the last line. */
  private val TRAILING_TIME = Regex("""\s+\d{1,2}[:.]\d{2}\s*([ap]\.?m\.?)?\s*[✓✔]*\s*$""", RegexOption.IGNORE_CASE)
  /** Snapchat sender labels: short, all caps ("ME", "PRIYA", "RAHUL S"). */
  private val SNAP_LABEL = Regex("""^[\p{Lu}0-9][\p{Lu}0-9 ._'-]{0,29}$""")

  private enum class Bubble { NONE, GREY, COLOURED }
  private data class Raw(val text: String, val box: Rect)
  private data class Line(val text: String, val box: Rect, val side: String)

  /** `ignore`: screen areas covered by our own overlay (e.g. the history pill), in bitmap pixels. */
  fun parse(bitmap: Bitmap, ignore: List<Rect>, onResult: (JSONObject) -> Unit, onError: (Exception) -> Unit) {
    recognizer.process(InputImage.fromBitmap(bitmap, 0))
      .addOnSuccessListener { result ->
        val raw = result.textBlocks.flatMap { it.lines }
          .mapNotNull { l -> l.boundingBox?.let { Raw(l.text.trim(), it) } }
          .filter { r -> ignore.none { Rect.intersects(it, r.box) } }
        val out = runCatching { toTranscript(raw, bitmap) }
        out.onSuccess(onResult).onFailure { onError(it as? Exception ?: RuntimeException(it)) }
      }
      .addOnFailureListener { onError(it) }
  }

  private fun toTranscript(raw: List<Raw>, bmp: Bitmap): JSONObject {
    val width = bmp.width
    val height = bmp.height
    val headerBottom = (height * 0.13).toInt()
    val footerTop = (height * 0.90).toInt()
    val sorted = raw.sortedBy { it.box.top }

    // The chat title (their name) sits in the header, below the status bar.
    var theirName = sorted.firstOrNull { r ->
      r.box.top > height * 0.035 && r.box.bottom < headerBottom && r.text.length in 2..30 && NOISE.none { it.matches(r.text) }
    }?.text

    val body = sorted.filter { r ->
      r.box.top >= headerBottom && r.box.bottom <= footerTop && r.text.isNotEmpty() && NOISE.none { it.matches(r.text) }
    }

    val bubbles = body.map { bubbleOf(bmp, it.box) }
    val medianHeight = body.map { it.box.height() }.sorted().let { if (it.isEmpty()) 0 else it[it.size / 2] }
    val snapLabels = body.filter { isSnapLabel(it, width, medianHeight) }
    val snapchat = snapLabels.any { it.text == "ME" } &&
      bubbles.count { it.first == Bubble.NONE } >= bubbles.size * 0.7

    val lines = mutableListOf<Line>()
    if (snapchat) {
      // Everything under "ME" is mine until the next label; anything above the first label belongs to the other person.
      val firstLabel = snapLabels.first()
      var side = if (firstLabel.text == "ME") "them" else "me"
      for (r in body) {
        if (isSnapLabel(r, width, medianHeight)) {
          side = if (r.text == "ME") "me" else "them"
          if (side == "them" && r.text.length >= 2) theirName = titleCase(r.text)
          continue
        }
        lines += Line(clean(r.text), r.box, side)
      }
    } else {
      body.forEachIndexed { i, r ->
        val side = sideOf(r.box, bubbles[i].first, width, lines.lastOrNull()?.side) ?: return@forEachIndexed
        lines += Line(clean(r.text), r.box, side)
      }
    }

    // Merge wrapped lines of the same bubble: same side, small vertical gap.
    val messages = JSONArray()
    var current: Line? = null
    var buffer = StringBuilder()
    fun flush() {
      val c = current ?: return
      val text = buffer.toString().trim()
      if (text.isNotEmpty()) messages.put(JSONObject().put("from", c.side).put("text", text))
    }
    for (line in lines) {
      if (line.text.isEmpty()) continue
      val prev = current
      val gap = if (prev == null) Int.MAX_VALUE else line.box.top - prev.box.bottom
      val sameBubble = prev != null && prev.side == line.side && gap < line.box.height() * 0.9
      if (sameBubble) buffer.append(' ').append(line.text) else { flush(); buffer = StringBuilder(line.text) }
      current = line
    }
    flush()

    val sentColours = body.indices.filter { bubbles[it].first == Bubble.COLOURED }.map { bubbles[it].second }
    val platform = when {
      snapchat -> "snapchat"
      sentColours.isEmpty() -> "other"
      else -> platformFromHue(averageHue(sentColours))
    }

    return JSONObject()
      .put("theirName", theirName ?: JSONObject.NULL)
      .put("messages", messages)
      .put("lineCount", raw.size)
      .put("platform", platform)
  }

  /**
   * Votes from bubble colour (strongest) and alignment. Returns null for
   * centred lines with no bubble: date separators, "You matched!" and such.
   */
  private fun sideOf(box: Rect, bubble: Bubble, width: Int, previous: String?): String? {
    val rightAnchored = (width - box.right).toFloat() / width < 0.15f
    val leftAnchored = box.left.toFloat() / width < 0.22f
    var score = 0f
    score += when (bubble) {
      Bubble.COLOURED -> 3f
      Bubble.GREY -> -1.5f
      Bubble.NONE -> 0f
    }
    score += when {
      rightAnchored && !leftAnchored -> 2f
      leftAnchored && !rightAnchored -> -2f
      rightAnchored && leftAnchored -> 0f // full-width line: decided by colour, or continues the bubble
      else -> if (bubble == Bubble.NONE) return null else 0f
    }
    return when {
      score > 0f -> "me"
      score < 0f -> "them"
      else -> previous ?: "them"
    }
  }

  /** The bubble behind a text line: coloured, grey, or none (text on the chat background). */
  private fun bubbleOf(bmp: Bitmap, box: Rect): Pair<Bubble, Int> {
    val pad = max(6, bmp.width / 70)
    val y = box.centerY()
    val bg = sample(bmp, 3, y)
    // Just outside the text on both sides, still inside the bubble's padding.
    val candidates = listOf(sample(bmp, box.left - pad, y), sample(bmp, box.right + pad, y))
    val colour = candidates.maxByOrNull { distance(it, bg) } ?: bg
    if (distance(colour, bg) < 24) return Bubble.NONE to colour
    return (if (chroma(colour) >= 28) Bubble.COLOURED else Bubble.GREY) to colour
  }

  /** Average of a 3×3 patch, clamped to the image. */
  private fun sample(bmp: Bitmap, x: Int, y: Int): Int {
    var r = 0; var g = 0; var b = 0; var n = 0
    for (dx in -1..1) for (dy in -1..1) {
      val px = bmp.getPixel((x + dx).coerceIn(0, bmp.width - 1), (y + dy).coerceIn(0, bmp.height - 1))
      r += Color.red(px); g += Color.green(px); b += Color.blue(px); n++
    }
    return Color.rgb(r / n, g / n, b / n)
  }

  private fun distance(a: Int, b: Int) =
    abs(Color.red(a) - Color.red(b)) + abs(Color.green(a) - Color.green(b)) + abs(Color.blue(a) - Color.blue(b))

  private fun chroma(c: Int): Int {
    val r = Color.red(c); val g = Color.green(c); val b = Color.blue(c)
    return max(r, max(g, b)) - min(r, min(g, b))
  }

  private fun averageHue(colours: List<Int>): Float {
    val hsv = FloatArray(3)
    // Hue is circular: average as unit vectors.
    var x = 0.0; var y = 0.0
    for (c in colours) {
      Color.colorToHSV(c, hsv)
      val rad = Math.toRadians(hsv[0].toDouble())
      x += Math.cos(rad); y += Math.sin(rad)
    }
    val deg = Math.toDegrees(Math.atan2(y, x)).toFloat()
    return if (deg < 0) deg + 360f else deg
  }

  /** Best guess only — used to pick the right texting style, never shown as fact. */
  private fun platformFromHue(hue: Float) = when (hue) {
    in 75f..170f -> "whatsapp" // green / teal
    in 245f..330f -> "instagram" // purple / violet / magenta
    else -> "other" // blue is shared by Messenger, Tinder, Telegram…
  }

  private fun isSnapLabel(r: Raw, width: Int, medianHeight: Int): Boolean {
    if (!SNAP_LABEL.matches(r.text)) return false
    if (r.box.left.toFloat() / width > 0.22f) return false
    return r.text == "ME" || (medianHeight > 0 && r.box.height() < medianHeight * 0.9)
  }

  private fun clean(text: String) = text.replace(TRAILING_TIME, "").trim()

  private fun titleCase(s: String) =
    s.lowercase().split(' ').joinToString(" ") { w -> w.replaceFirstChar { it.titlecase() } }
}
