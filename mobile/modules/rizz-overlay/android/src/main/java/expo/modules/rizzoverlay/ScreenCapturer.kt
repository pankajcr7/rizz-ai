package expo.modules.rizzoverlay

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.Image
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.util.DisplayMetrics
import android.view.WindowManager

/**
 * Holds one MediaProjection for the lifetime of live mode. Android 14+ allows
 * only one VirtualDisplay per projection, so it is created once. The latest
 * frame stays in memory until replaced; it is copied and read only when the
 * user taps the bubble. Nothing is recorded to disk.
 */
class ScreenCapturer(
  context: Context,
  private val projection: MediaProjection,
  private val onStopped: () -> Unit,
) {
  val width: Int
  val height: Int
  private val thread = HandlerThread("rizz-capture").apply { start() }
  private val handler = Handler(thread.looper)
  private val reader: ImageReader
  private val display: VirtualDisplay
  private val frameLock = Any()
  private var latestImage: Image? = null
  private var closed = false

  init {
    val (w, h, dpi) = realMetrics(context)
    width = w
    height = h
    // Keep one acquired image while leaving two slots for acquireLatestImage
    // to discard older frames. Otherwise a full queue can stall the producer.
    reader = ImageReader.newInstance(w, h, PixelFormat.RGBA_8888, 3)
    reader.setOnImageAvailableListener({ source ->
      val image = runCatching { source.acquireLatestImage() }.getOrNull() ?: return@setOnImageAvailableListener
      synchronized(frameLock) {
        latestImage?.close()
        if (closed) image.close() else latestImage = image
      }
    }, handler)
    // Must be registered before createVirtualDisplay on Android 14+.
    projection.registerCallback(object : MediaProjection.Callback() {
      override fun onStop() = onStopped()
    }, handler)
    // Returns null if the system refuses (e.g. consent revoked) — fail loudly so the service can stop cleanly.
    display = projection.createVirtualDisplay(
      "rizz-live", w, h, dpi,
      DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
      reader.surface, null, handler,
    ) ?: run {
      reader.close()
      projection.stop()
      thread.quitSafely()
      throw IllegalStateException("Screen capture was refused by the system")
    }
  }

  /** Latest frame as a Bitmap, or null if nothing has been drawn yet. */
  fun grab(): Bitmap? = synchronized(frameLock) {
    val image = latestImage ?: return@synchronized null
    val plane = image.planes[0]
    val rowPadding = plane.rowStride - plane.pixelStride * width
    val padded = Bitmap.createBitmap(width + rowPadding / plane.pixelStride, height, Bitmap.Config.ARGB_8888)
    try {
      padded.copyPixelsFromBuffer(plane.buffer)
      if (rowPadding == 0) return@synchronized padded
      Bitmap.createBitmap(padded, 0, 0, width, height)
    } finally {
      if (rowPadding != 0) padded.recycle()
    }
  }

  fun release() {
    reader.setOnImageAvailableListener(null, null)
    synchronized(frameLock) {
      closed = true
      latestImage?.close()
      latestImage = null
    }
    display.release()
    reader.close()
    projection.stop()
    thread.quitSafely()
  }

  private companion object {
    @SuppressLint("NewApi")
    fun realMetrics(context: Context): Triple<Int, Int, Int> {
      val wm = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
      val dpi = context.resources.displayMetrics.densityDpi
      return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        val b = wm.maximumWindowMetrics.bounds
        Triple(b.width(), b.height(), dpi)
      } else {
        val m = DisplayMetrics()
        @Suppress("DEPRECATION")
        wm.defaultDisplay.getRealMetrics(m)
        Triple(m.widthPixels, m.heightPixels, dpi)
      }
    }
  }
}
