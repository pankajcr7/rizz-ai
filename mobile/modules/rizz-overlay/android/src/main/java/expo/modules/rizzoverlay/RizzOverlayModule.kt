package expo.modules.rizzoverlay

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.view.inputmethod.InputMethodManager
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val REQ_SCREEN_CAPTURE = 7421

/**
 * JS bridge for "Live mode": a floating bubble that, when tapped, captures the
 * current screen once, OCRs the chat on-device and hands the messages to JS.
 * JS calls the backend and pushes the suggestions back into the native panel.
 */
class RizzOverlayModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context is gone" }

  private var pendingStart: Promise? = null

  override fun definition() = ModuleDefinition {
    Name("RizzOverlay")

    // Payloads are JSON strings so the shapes live in one place (TypeScript).
    Events("onCapture", "onToneChange", "onRegenerate", "onBubbleStopped", "onAction")

    OnCreate {
      BubbleService.listener = { event, json -> sendEvent(event, mapOf("json" to json)) }
    }

    OnDestroy {
      BubbleService.listener = null
    }

    Function("isSupported") { Build.VERSION.SDK_INT >= Build.VERSION_CODES.O }

    Function("hasOverlayPermission") { Settings.canDrawOverlays(context) }

    Function("openOverlaySettings") {
      val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    Function("isBubbleRunning") { BubbleService.instance != null }

    /**
     * Asks for screen-capture consent (Android shows its own dialog every
     * session — that's required by the OS and can't be skipped), then starts
     * the bubble service. Resolves true if the bubble is running.
     */
    AsyncFunction("startBubble") { promise: Promise ->
      if (!Settings.canDrawOverlays(context)) {
        promise.reject("E_NO_OVERLAY", "Allow 'Display over other apps' first", null)
        return@AsyncFunction
      }
      if (BubbleService.instance != null) {
        promise.resolve(true)
        return@AsyncFunction
      }
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.reject("E_NO_ACTIVITY", "App is not in the foreground", null)
        return@AsyncFunction
      }
      pendingStart?.resolve(false)
      pendingStart = promise
      val mpm = context.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
      activity.startActivityForResult(mpm.createScreenCaptureIntent(), REQ_SCREEN_CAPTURE)
    }

    OnActivityResult { _, payload ->
      if (payload.requestCode != REQ_SCREEN_CAPTURE) return@OnActivityResult
      val promise = pendingStart ?: return@OnActivityResult
      pendingStart = null
      val data = payload.data
      if (payload.resultCode != Activity.RESULT_OK || data == null) {
        promise.resolve(false) // user tapped "Cancel"
        return@OnActivityResult
      }
      val intent = Intent(context, BubbleService::class.java)
        .putExtra(BubbleService.EXTRA_RESULT_CODE, payload.resultCode)
        .putExtra(BubbleService.EXTRA_RESULT_DATA, data)
      try {
        context.startForegroundService(intent)
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("E_START_FAILED", e.message ?: "Could not start live mode", e)
      }
    }

    Function("stopBubble") {
      context.stopService(Intent(context, BubbleService::class.java))
    }

    /** Render panel state pushed from JS (loading / result / error). See types.ts `PanelState`. */
    Function("showPanel") { json: String ->
      BubbleService.instance?.showPanel(json) ?: false
    }

    Function("hidePanel") {
      BubbleService.instance?.hidePanel()
    }

    // ---- Rizz AI Keyboard -------------------------------------------------

    /** Hand the keyboard what it needs to call the backend (URL, token, tone, language, boldness). */
    Function("setKeyboardConfig") { json: String ->
      KeyboardConfig.save(context, json)
    }

    Function("isKeyboardEnabled") {
      val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
      imm.enabledInputMethodList.any { it.packageName == context.packageName && it.serviceName.endsWith("RizzKeyboardService") }
    }

    Function("isKeyboardSelected") {
      val current = Settings.Secure.getString(context.contentResolver, Settings.Secure.DEFAULT_INPUT_METHOD).orEmpty()
      current.startsWith("${context.packageName}/") && current.endsWith("RizzKeyboardService")
    }

    Function("openKeyboardSettings") {
      context.startActivity(Intent(Settings.ACTION_INPUT_METHOD_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    Function("showKeyboardPicker") {
      val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
      imm.showInputMethodPicker()
    }

    // ---- Smart notifications ---------------------------------------------

    Function("hasNotificationAccess") {
      val enabled = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners").orEmpty()
      enabled.split(":").any { it.startsWith("${context.packageName}/") }
    }

    Function("openNotificationAccessSettings") {
      context.startActivity(Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    /** JSON: [{ "pkg": "com.whatsapp", "name": "WhatsApp", "enabled": true }, …] */
    Function("getSmartApps") {
      val on = SmartNotify.enabledApps(context)
      val arr = org.json.JSONArray()
      SmartNotify.SUPPORTED.forEach { (pkg, name) -> arr.put(org.json.JSONObject().put("pkg", pkg).put("name", name).put("enabled", pkg in on)) }
      arr.toString()
    }

    Function("setSmartApps") { json: String ->
      val arr = org.json.JSONArray(json)
      SmartNotify.setEnabledApps(context, (0 until arr.length()).map { arr.getString(it) }.toSet())
    }
  }
}
