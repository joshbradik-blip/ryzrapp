package expo.modules.ryzrpose

import android.media.Image
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.pose.PoseDetection
import com.google.mlkit.vision.pose.PoseLandmark
import com.google.mlkit.vision.pose.defaults.PoseDetectorOptions
import com.mrousavy.camera.frameprocessors.Frame
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin
import com.mrousavy.camera.frameprocessors.VisionCameraProxy
import java.util.concurrent.TimeUnit
import kotlin.math.max
import kotlin.math.sqrt

// Google ML Kit pose detector, exposed to JS as the VisionCamera frame
// processor plugin "ryzrPose".
//
// Results are returned in pixels of the *upright* image; nativePose.ts turns
// them into the pipeline's normalized coordinates.
@Suppress("UNUSED_PARAMETER")
class PosePlugin(proxy: VisionCameraProxy, options: Map<String, Any>?) : FrameProcessorPlugin() {
  // Stream mode tracks the person across frames instead of re-detecting from
  // scratch each time: faster, and steadier keypoints.
  private val detector = PoseDetection.getClient(
    PoseDetectorOptions.Builder()
      .setDetectorMode(PoseDetectorOptions.STREAM_MODE)
      .build()
  )

  override fun callback(frame: Frame, params: Map<String, Any>?): Any? {
    // Clockwise rotation (degrees) that brings the frame upright — the same
    // convention ML Kit's rotationDegrees uses.
    val rotation = ((params?.get("rotation") as? Number)?.toInt() ?: 0).let { ((it % 360) + 360) % 360 }

    val image = try {
      frame.image
    } catch (e: Exception) {
      return null
    }

    // An empty result used to mean two different things — the detector threw,
    // or it ran and found nobody — and JS could not tell them apart. It also
    // could not tell a detector that sees a real room from one handed a black
    // or garbled buffer. `debug` answers both, so a device that reports no
    // person can be diagnosed from the screen instead of from guesses.
    val shape = describeBuffer(image)

    val startedAt = System.nanoTime()
    val pose = try {
      Tasks.await(detector.process(InputImage.fromMediaImage(image, rotation)), 500, TimeUnit.MILLISECONDS)
    } catch (e: Exception) {
      return result(image, rotation, emptyMap(), "$shape err:${e.javaClass.simpleName}")
    }
    val tookMs = (System.nanoTime() - startedAt) / 1_000_000

    val landmarks = HashMap<String, Any>()
    for ((type, name) in NAMES) {
      val lm = pose.getPoseLandmark(type) ?: continue
      landmarks[name] = hashMapOf<String, Any>(
        "x" to lm.position.x.toDouble(),
        "y" to lm.position.y.toDouble(),
        "score" to lm.inFrameLikelihood.toDouble(),
      )
    }

    return result(image, rotation, landmarks, "$shape ${landmarks.size}lm ${tookMs}ms")
  }

  private fun result(
    image: Image,
    rotation: Int,
    landmarks: Map<String, Any>,
    debug: String,
  ): Map<String, Any> {
    val swap = rotation == 90 || rotation == 270
    return hashMapOf(
      "width" to (if (swap) image.height else image.width).toDouble(),
      "height" to (if (swap) image.width else image.height).toDouble(),
      "landmarks" to landmarks,
      "debug" to debug,
    )
  }

  /**
   * Format, plane layout and brightness of the luma plane, as one short
   * string. A real scene reads as a mid mean with a wide spread; a black or
   * garbled buffer reads as a near-zero mean, a near-zero spread, or both.
   */
  private fun describeBuffer(image: Image): String {
    return try {
      val plane = image.planes[0]
      val buffer = plane.buffer
      val rowStride = plane.rowStride
      val pixelStride = max(1, plane.pixelStride)

      // Sampled on a coarse grid: this runs on every frame, so it has to cost
      // nothing next to the detector itself.
      val stepX = max(1, image.width / 48)
      val stepY = max(1, image.height / 48)
      var sum = 0L
      var sumSquares = 0L
      var count = 0
      var y = 0
      while (y < image.height) {
        val rowStart = y * rowStride
        var x = 0
        while (x < image.width) {
          val index = rowStart + x * pixelStride
          if (index < buffer.limit()) {
            val value = buffer.get(index).toInt() and 0xFF
            sum += value
            sumSquares += (value * value).toLong()
            count++
          }
          x += stepX
        }
        y += stepY
      }

      if (count == 0) return "fmt${image.format} p${image.planes.size} rs$rowStride ps$pixelStride y:none"
      val mean = sum / count
      val spread = sqrt(((sumSquares / count) - mean * mean).toDouble().coerceAtLeast(0.0)).toInt()
      "fmt${image.format} p${image.planes.size} rs$rowStride ps$pixelStride y$mean±$spread"
    } catch (e: Exception) {
      "shape err:${e.javaClass.simpleName}"
    }
  }

  companion object {
    // ML Kit's left/right are the subject's own, same as the pipeline's.
    private val NAMES = listOf(
      PoseLandmark.NOSE to "nose",
      PoseLandmark.LEFT_EYE to "left_eye",
      PoseLandmark.RIGHT_EYE to "right_eye",
      PoseLandmark.LEFT_EAR to "left_ear",
      PoseLandmark.RIGHT_EAR to "right_ear",
      PoseLandmark.LEFT_SHOULDER to "left_shoulder",
      PoseLandmark.RIGHT_SHOULDER to "right_shoulder",
      PoseLandmark.LEFT_ELBOW to "left_elbow",
      PoseLandmark.RIGHT_ELBOW to "right_elbow",
      PoseLandmark.LEFT_WRIST to "left_wrist",
      PoseLandmark.RIGHT_WRIST to "right_wrist",
      PoseLandmark.LEFT_HIP to "left_hip",
      PoseLandmark.RIGHT_HIP to "right_hip",
      PoseLandmark.LEFT_KNEE to "left_knee",
      PoseLandmark.RIGHT_KNEE to "right_knee",
      PoseLandmark.LEFT_ANKLE to "left_ankle",
      PoseLandmark.RIGHT_ANKLE to "right_ankle",
      PoseLandmark.LEFT_HEEL to "left_heel",
      PoseLandmark.RIGHT_HEEL to "right_heel",
      PoseLandmark.LEFT_FOOT_INDEX to "left_foot_index",
      PoseLandmark.RIGHT_FOOT_INDEX to "right_foot_index",
    )
  }
}
