package expo.modules.rizzoverlay

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.util.DisplayMetrics
import android.view.WindowManager

/**
 * Holds one MediaProjection for the lifetime of live mode. Android 14+ allows
 * only one VirtualDisplay per projection, so it is created once and frames are
 * read on demand. Nothing is recorded or stored: a frame is only copied out
 * when the user taps the bubble.
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

  init {
    val (w, h, dpi) = realMetrics(context)
    width = w
    height = h
    reader = ImageReader.newInstance(w, h, PixelFormat.RGBA_8888, 2)
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
  fun grab(): Bitmap? {
    val image = reader.acquireLatestImage() ?: return null
    try {
      val plane = image.planes[0]
      val rowPadding = plane.rowStride - plane.pixelStride * width
      val padded = Bitmap.createBitmap(width + rowPadding / plane.pixelStride, height, Bitmap.Config.ARGB_8888)
      padded.copyPixelsFromBuffer(plane.buffer)
      if (rowPadding == 0) return padded
      val cropped = Bitmap.createBitmap(padded, 0, 0, width, height)
      padded.recycle()
      return cropped
    } finally {
      image.close()
    }
  }

  /** Drop any buffered frame so the next grab() reflects the screen after this call. */
  fun discardPending() {
    reader.acquireLatestImage()?.close()
  }

  fun release() {
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
