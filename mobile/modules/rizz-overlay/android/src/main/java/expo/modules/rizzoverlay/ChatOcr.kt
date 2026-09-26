package expo.modules.rizzoverlay

import android.graphics.Bitmap
import android.graphics.Rect
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import org.json.JSONArray
import org.json.JSONObject

/**
 * On-device OCR (ML Kit, no network) that turns a chat screenshot into
 * ordered "me"/"them" messages using bubble alignment:
 * outgoing bubbles hug the right edge, incoming ones hug the left.
 */
object ChatOcr {
  private val recognizer by lazy { TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS) }

  private val NOISE = listOf(
    Regex("""^\d{1,2}[:.]\d{2}\s*([ap]\.?m\.?)?$""", RegexOption.IGNORE_CASE),
    Regex("""^(seen|delivered|sent|read|opened|received|typing\W*|active now|online|today|yesterday)\b.*$""", RegexOption.IGNORE_CASE),
    Regex("""^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?(\s+\d{1,2}[:.]\d{2}.*)?$""", RegexOption.IGNORE_CASE),
    Regex("""^(message|send a chat|type a message|aa)\W*$""", RegexOption.IGNORE_CASE),
    Regex("""^[\W_]{1,3}$"""), // stray icons read as punctuation
  )

  private data class Line(val text: String, val box: Rect, val side: String)

  fun parse(bitmap: Bitmap, onResult: (JSONObject) -> Unit, onError: (Exception) -> Unit) {
    recognizer.process(InputImage.fromBitmap(bitmap, 0))
      .addOnSuccessListener { result ->
        val lines = result.textBlocks.flatMap { it.lines }.mapNotNull { l -> l.boundingBox?.let { l.text.trim() to it } }
        onResult(toTranscript(lines, bitmap.width, bitmap.height))
      }
      .addOnFailureListener { onError(it) }
  }

  fun toTranscript(raw: List<Pair<String, Rect>>, width: Int, height: Int): JSONObject {
    val headerBottom = (height * 0.13).toInt()
    val footerTop = (height * 0.90).toInt()
    val sorted = raw.sortedBy { it.second.top }

    // The chat title (their name) sits in the header, below the status bar.
    val theirName = sorted.firstOrNull { (text, box) ->
      box.top > height * 0.035 && box.bottom < headerBottom && text.length in 2..30 && NOISE.none { it.matches(text) }
    }?.first

    val lines = mutableListOf<Line>()
    for ((text, box) in sorted) {
      if (box.top < headerBottom || box.bottom > footerTop) continue
      if (text.isEmpty() || NOISE.any { it.matches(text) }) continue
      val leftMargin = box.left.toFloat() / width
      val rightMargin = (width - box.right).toFloat() / width
      val rightAnchored = rightMargin < 0.15f
      val leftAnchored = leftMargin < 0.22f
      val side = when {
        rightAnchored && !leftAnchored -> "me"
        leftAnchored && !rightAnchored -> "them"
        rightAnchored && leftAnchored -> lines.lastOrNull()?.side ?: "them" // full-width line: continue the bubble
        else -> continue // centred: date separators, "You matched!", etc.
      }
      lines += Line(text, box, side)
    }

    // Merge wrapped lines of the same bubble: same side, small vertical gap.
    val messages = JSONArray()
    var current: Line? = null
    var buffer = StringBuilder()
    fun flush() {
      val c = current ?: return
      messages.put(JSONObject().put("from", c.side).put("text", buffer.toString()))
    }
    for (line in lines) {
      val prev = current
      val gap = if (prev == null) Int.MAX_VALUE else line.box.top - prev.box.bottom
      val sameBubble = prev != null && prev.side == line.side && gap < line.box.height() * 0.9
      if (sameBubble) {
        buffer.append(' ').append(line.text)
      } else {
        flush()
        buffer = StringBuilder(line.text)
      }
      current = line
    }
    flush()

    // Keep the most recent part of long chats.
    val recent = JSONArray()
    val start = maxOf(0, messages.length() - 30)
    for (i in start until messages.length()) recent.put(messages.get(i))

    return JSONObject()
      .put("theirName", theirName ?: JSONObject.NULL)
      .put("messages", recent)
      .put("lineCount", raw.size)
  }
}
