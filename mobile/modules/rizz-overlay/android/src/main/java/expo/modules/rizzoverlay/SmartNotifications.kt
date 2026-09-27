package expo.modules.rizzoverlay

import android.app.Notification
import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.RemoteInput
import android.content.BroadcastReceiver
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.widget.Toast
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap

/**
 * Smart notifications: when a message notification arrives from an app the
 * user switched on (Instagram, WhatsApp…), post a Rizz AI notification with
 * "✨ Get replies". Nothing is sent to our server until the user taps it.
 * Tapping "Send N" replies through the original app's own quick-reply action.
 */
object SmartNotify {
  const val CHANNEL = "rizz_smart"
  private const val PREFS = "rizz_notify"
  private const val KEY_APPS = "apps"

  /** Apps we understand and the user can switch on. */
  val SUPPORTED = mapOf(
    "com.instagram.android" to "Instagram",
    "com.whatsapp" to "WhatsApp",
    "com.tinder" to "Tinder",
    "com.snapchat.android" to "Snapchat",
    "com.bumble.app" to "Bumble",
    "co.hinge.app" to "Hinge",
    "org.telegram.messenger" to "Telegram",
    "com.facebook.orca" to "Messenger",
  )

  data class Pending(
    val pkg: String,
    val title: String,
    val text: String,
    val reply: Notification.Action?,
    val openChat: PendingIntent?,
    var suggestions: List<String> = emptyList(),
  )

  /** Our notification id → the message it's about. In-memory: stale after process death (handled). */
  val pending = ConcurrentHashMap<Int, Pending>()
  @Volatile var captureTarget: Pending? = null
  @Volatile var captureTargetAt: Long = 0

  fun platform(pkg: String): String = when (pkg) {
    "com.facebook.orca" -> "facebook"
    else -> SUPPORTED[pkg]?.lowercase() ?: "other"
  }

  fun enabledApps(ctx: Context): Set<String> =
    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getStringSet(KEY_APPS, emptySet()) ?: emptySet()

  fun setEnabledApps(ctx: Context, apps: Set<String>) {
    val next = apps.filter { it in SUPPORTED }.toSet()
    (enabledApps(ctx) - next).forEach { SmartConversationHistory.clear(ctx, it) }
    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putStringSet(KEY_APPS, next).apply()
  }

  fun ensureChannel(ctx: Context) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      nm.createNotificationChannel(NotificationChannel(CHANNEL, "Smart replies", NotificationManager.IMPORTANCE_DEFAULT).apply {
        description = "“Get replies” when a new message arrives"
        setSound(null, null)
      })
    }
  }

  fun builder(ctx: Context): Notification.Builder =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(ctx, CHANNEL) else @Suppress("DEPRECATION") Notification.Builder(ctx)

  fun action(ctx: Context, id: Int, what: String, index: Int = -1): PendingIntent {
    val intent = Intent(ctx, SmartNotifyReceiver::class.java).setAction(what).putExtra("id", id).putExtra("index", index)
    return PendingIntent.getBroadcast(ctx, id * 10 + index + 1, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  fun openAction(ctx: Context, id: Int, p: Pending): PendingIntent {
    val intent = Intent(ctx, SmartOpenChatActivity::class.java)
      .putExtra("id", id).putExtra("pkg", p.pkg).putExtra("title", p.title)
      .putExtra("openChat", p.openChat)
    return PendingIntent.getActivity(ctx, id, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  fun notify(ctx: Context, id: Int, n: Notification) {
    (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(id, n)
  }

  fun cancel(ctx: Context, id: Int) {
    (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(id)
    pending.remove(id)
  }

  /** Same backend call the keyboard makes. */
  fun fetchSuggestions(cfg: KeyboardConfig.Config, pkg: String, theirName: String, history: List<SmartConversationHistory.Line>): List<String> {
    val recent = history.takeLast(60)
    val earlier = history.dropLast(recent.size).takeLast(300)
    val body = JSONObject()
      .put("platform", platform(pkg))
      .put("tone", cfg.tone)
      .put("theirName", theirName.take(60))
      .put("messages", JSONArray().apply { recent.forEach { put(it.json()) } })
      .put("earlier", JSONArray().apply { earlier.forEach { put(it.json()) } })
      .put("count", 3)
      .put("prefs", JSONObject().put("length", "short").put("emoji", 1).put("language", cfg.language).put("boldness", cfg.boldness))
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
      val raw = (if (code in 200..299) conn.inputStream else conn.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
      if (code !in 200..299) {
        throw IllegalStateException(runCatching { JSONObject(raw).getJSONObject("error").getString("message") }.getOrNull() ?: "Couldn't get replies")
      }
      val arr = JSONObject(raw).getJSONArray("suggestions")
      return (0 until arr.length()).map { arr.getJSONObject(it).getString("text") }
    } catch (e: java.io.IOException) {
      throw IllegalStateException("No connection to Rizz AI")
    } finally {
      conn.disconnect()
    }
  }
}

class RizzNotificationListener : NotificationListenerService() {
  override fun onNotificationPosted(sbn: StatusBarNotification) {
    if (sbn.packageName == packageName || sbn.packageName !in SmartNotify.enabledApps(this)) return
    val n = sbn.notification ?: return
    if (sbn.isOngoing || (n.flags and Notification.FLAG_GROUP_SUMMARY) != 0) return

    val extras = n.extras ?: return
    val title = (extras.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE) ?: extras.getCharSequence(Notification.EXTRA_TITLE))?.toString()?.trim().orEmpty()
    val lines = notificationMessages(extras)
    val text = lines.lastOrNull()?.text ?: lastMessage(extras) ?: return
    if (title.isEmpty() || text.isEmpty()) return
    if (lines.lastOrNull()?.from == "me") return
    SmartConversationHistory.append(this, sbn.packageName, title, if (lines.isEmpty()) listOf(SmartConversationHistory.Line("them", text)) else lines)

    val reply = n.actions?.firstOrNull { a -> a.remoteInputs?.any { it.allowFreeFormInput } == true }
    // One Rizz notification per conversation, updated as new messages arrive.
    val id = 70_000 + ((sbn.packageName + title).hashCode() and 0xFFFF)
    SmartNotify.pending[id] = SmartNotify.Pending(sbn.packageName, title, text, reply, n.contentIntent)
    SmartNotify.ensureChannel(this)

    val app = SmartNotify.SUPPORTED[sbn.packageName] ?: "chat"
    val p = SmartNotify.pending[id]!!
    val history = SmartConversationHistory.get(this, p.pkg, p.title)
    val primary = if (history.size >= 3 && history.any { it.from == "me" })
      SmartNotify.action(this, id, SmartNotifyReceiver.ACTION_GET) else SmartNotify.openAction(this, id, p)
    val notification = SmartNotify.builder(this)
      .setSmallIcon(android.R.drawable.ic_menu_edit)
      .setContentTitle("✨ Reply to $title")
      .setContentText("“${text.take(80)}” · $app")
      .setAutoCancel(true)
      .setOnlyAlertOnce(true)
      .addAction(Notification.Action.Builder(null, "✨ Reply / read chat", primary).build())
      .addAction(Notification.Action.Builder(null, "Dismiss", SmartNotify.action(this, id, SmartNotifyReceiver.ACTION_DISMISS)).build())
      .build()
    SmartNotify.notify(this, id, notification)
  }

  /** Read every message the social app exposes, including historic MessagingStyle entries. */
  private fun notificationMessages(extras: Bundle): List<SmartConversationHistory.Line> {
    val result = mutableListOf<SmartConversationHistory.Line>()
    for (field in listOf(Notification.EXTRA_HISTORIC_MESSAGES, Notification.EXTRA_MESSAGES)) {
      for (item in extras.getParcelableArray(field).orEmpty()) {
        val b = item as? Bundle ?: continue
        val text = b.getCharSequence("text")?.toString()?.trim().orEmpty()
        if (text.isEmpty()) continue
        val sender = b.getCharSequence("sender")?.toString().orEmpty()
        @Suppress("DEPRECATION")
        val person = if (Build.VERSION.SDK_INT >= 33) b.getParcelable("sender_person", android.app.Person::class.java)
          else b.getParcelable<android.app.Person>("sender_person")
        val from = if (sender.isBlank() && person == null) "me" else "them"
        result += SmartConversationHistory.Line(from, text)
      }
    }
    return result
  }

  /** MessagingStyle notifications keep a list; fall back to the plain text. */
  private fun lastMessage(extras: Bundle): String? {
    val msgs = extras.getParcelableArray(Notification.EXTRA_MESSAGES)
    val fromStyle = msgs?.lastOrNull()?.let { (it as? Bundle)?.getCharSequence("text")?.toString() }
    val text = fromStyle ?: extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString() ?: extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()
    return text?.trim()?.takeIf { it.isNotEmpty() && !it.matches(Regex("^\\d+ new messages?$", RegexOption.IGNORE_CASE)) }
  }
}

class SmartNotifyReceiver : BroadcastReceiver() {
  companion object {
    const val ACTION_GET = "expo.modules.rizzoverlay.SMART_GET"
    const val ACTION_SEND = "expo.modules.rizzoverlay.SMART_SEND"
    const val ACTION_COPY = "expo.modules.rizzoverlay.SMART_COPY"
    const val ACTION_DISMISS = "expo.modules.rizzoverlay.SMART_DISMISS"
  }

  override fun onReceive(ctx: Context, intent: Intent) {
    val id = intent.getIntExtra("id", -1)
    val index = intent.getIntExtra("index", -1)
    val p = SmartNotify.pending[id]
    when (intent.action) {
      ACTION_DISMISS -> SmartNotify.cancel(ctx, id)
      ACTION_GET -> {
        if (p == null) return expired(ctx, id)
        val history = SmartConversationHistory.get(ctx, p.pkg, p.title)
        if (history.size < 3 || history.none { it.from == "me" }) return openChatForReading(ctx, id, p)
        val cfg = KeyboardConfig.load(ctx)
        if (cfg == null || cfg.token.isBlank()) return status(ctx, id, "Open Rizz AI once to connect smart replies")
        status(ctx, id, "Reading the vibe…", ongoing = true)
        val done = goAsync()
        Thread {
          try {
            val list = SmartNotify.fetchSuggestions(cfg, p.pkg, p.title, history)
            p.suggestions = list
            Handler(Looper.getMainLooper()).post { showSuggestions(ctx, id, p) }
          } catch (e: Exception) {
            status(ctx, id, e.message ?: "Couldn't get replies")
          } finally {
            done.finish()
          }
        }.start()
      }
      ACTION_SEND -> {
        val pp = p ?: return expired(ctx, id)
        val text = pp.suggestions.getOrNull(index) ?: return expired(ctx, id)
        val reply = pp.reply ?: return copy(ctx, id, text, pp)
        val inputs = reply.remoteInputs ?: return copy(ctx, id, text, pp)
        try {
          val results = Bundle()
          inputs.forEach { results.putCharSequence(it.resultKey, text) }
          val fill = Intent()
          RemoteInput.addResultsToIntent(inputs, fill, results)
          reply.actionIntent.send(ctx, 0, fill)
          SmartConversationHistory.append(ctx, pp.pkg, pp.title, listOf(SmartConversationHistory.Line("me", text)))
          status(ctx, id, "Sent to ${pp.title} ✓")
          Handler(Looper.getMainLooper()).postDelayed({ SmartNotify.cancel(ctx, id) }, 2500)
        } catch (e: Exception) {
          copy(ctx, id, text, pp) // quick-reply refused — fall back to copy
        }
      }
      ACTION_COPY -> {
        val pp = p ?: return expired(ctx, id)
        val text = pp.suggestions.getOrNull(index) ?: return expired(ctx, id)
        copy(ctx, id, text, pp)
      }
    }
  }

  private fun openChatForReading(ctx: Context, id: Int, p: SmartNotify.Pending) {
    SmartOpenChatActivity.open(ctx, id, p)
  }

  private fun showSuggestions(ctx: Context, id: Int, p: SmartNotify.Pending) {
    if (p.suggestions.isEmpty()) return status(ctx, id, "Rizz AI can't help with this one")
    val body = p.suggestions.mapIndexed { i, s -> "${i + 1}. $s" }.joinToString("\n")
    val verb = if (p.reply != null) "Send" else "Copy"
    val b = SmartNotify.builder(ctx)
      .setSmallIcon(android.R.drawable.ic_menu_edit)
      .setContentTitle("✨ Replies for ${p.title}")
      .setContentText(p.suggestions.first())
      .setStyle(Notification.BigTextStyle().bigText(body))
      .setOnlyAlertOnce(true)
      .setAutoCancel(true)
    p.suggestions.take(3).forEachIndexed { i, _ ->
      val what = if (p.reply != null) ACTION_SEND else ACTION_COPY
      b.addAction(Notification.Action.Builder(null, "$verb ${i + 1}", SmartNotify.action(ctx, id, what, i)).build())
    }
    SmartNotify.notify(ctx, id, b.build())
  }

  private fun copy(ctx: Context, id: Int, text: String, p: SmartNotify.Pending) {
    val cm = ctx.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    cm.setPrimaryClip(ClipData.newPlainText("Rizz AI reply", text))
    Toast.makeText(ctx, "Copied — open ${SmartNotify.SUPPORTED[p.pkg] ?: "the chat"} and paste", Toast.LENGTH_SHORT).show()
    status(ctx, id, "Copied — paste it in the chat")
  }

  private fun status(ctx: Context, id: Int, text: String, ongoing: Boolean = false) {
    val title = SmartNotify.pending[id]?.title
    val n = SmartNotify.builder(ctx)
      .setSmallIcon(android.R.drawable.ic_menu_edit)
      .setContentTitle(if (title != null) "✨ $title" else "✨ Rizz AI")
      .setContentText(text)
      .setOnlyAlertOnce(true)
      .setOngoing(ongoing)
      .setAutoCancel(!ongoing)
      .build()
    SmartNotify.notify(ctx, id, n)
  }

  private fun expired(ctx: Context, id: Int) = status(ctx, id, "This one expired — open the chat to reply")
}

/** User-initiated activity: opens the original notification's exact chat, then ends. */
class SmartOpenChatActivity : Activity() {
  companion object {
    fun open(ctx: Context, id: Int, p: SmartNotify.Pending) {
      val bubbleReady = BubbleService.instance != null
      val opened = runCatching {
        if (p.openChat != null) p.openChat.send()
        else {
          val launch = ctx.packageManager.getLaunchIntentForPackage(p.pkg) ?: error("App unavailable")
          ctx.startActivity(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
      }.isSuccess
      val message = when {
        !opened -> "Open ${SmartNotify.SUPPORTED[p.pkg]} to read this chat"
        bubbleReady -> "Scroll up through this chat, then tap Done. Saved for next time."
        else -> "Start the Rizz AI Live bubble, then read this chat"
      }
      SmartNotify.notify(ctx, id, SmartNotify.builder(ctx)
        .setSmallIcon(android.R.drawable.ic_menu_edit).setContentTitle("✨ ${p.title}")
        .setContentText(message).setAutoCancel(true).build())
      if (opened && bubbleReady) {
        SmartNotify.captureTarget = p
        SmartNotify.captureTargetAt = System.currentTimeMillis()
        Handler(Looper.getMainLooper()).postDelayed({ BubbleService.instance?.startHistory() }, 1200)
      }
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val pkg = intent.getStringExtra("pkg").orEmpty()
    val title = intent.getStringExtra("title").orEmpty()
    @Suppress("DEPRECATION")
    val original = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra("openChat", PendingIntent::class.java)
      else intent.getParcelableExtra<PendingIntent>("openChat")
    if (pkg in SmartNotify.SUPPORTED && title.isNotBlank()) {
      val p = SmartNotify.pending[intent.getIntExtra("id", -1)]
        ?: SmartNotify.Pending(pkg, title, "", null, original)
      open(this, intent.getIntExtra("id", -1), p)
    }
    finish()
  }
}
