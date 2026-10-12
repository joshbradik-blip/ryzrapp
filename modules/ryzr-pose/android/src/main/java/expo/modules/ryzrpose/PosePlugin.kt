package expo.modules.ryzrpose

import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.pose.PoseDetection
import com.google.mlkit.vision.pose.PoseLandmark
import com.google.mlkit.vision.pose.defaults.PoseDetectorOptions
import com.mrousavy.camera.frameprocessors.Frame
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin
import com.mrousavy.camera.frameprocessors.VisionCameraProxy
import java.util.concurrent.TimeUnit

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

    val image = frame.image
    val input = InputImage.fromMediaImage(image, rotation)

    // Frame processors run on the camera thread, never the main thread, so
    // blocking here is allowed. The timeout keeps a stalled detector from
    // freezing the camera.
    val pose = try {
      Tasks.await(detector.process(input), 500, TimeUnit.MILLISECONDS)
    } catch (e: Exception) {
      return null
    }

    val swap = rotation == 90 || rotation == 270
    val width = (if (swap) image.height else image.width).toDouble()
    val height = (if (swap) image.width else image.height).toDouble()

    val landmarks = HashMap<String, Any>()
    for ((type, name) in NAMES) {
      val lm = pose.getPoseLandmark(type) ?: continue
      landmarks[name] = hashMapOf<String, Any>(
        "x" to lm.position.x.toDouble(),
        "y" to lm.position.y.toDouble(),
        "score" to lm.inFrameLikelihood.toDouble(),
      )
    }

    return hashMapOf<String, Any>(
      "width" to width,
      "height" to height,
      "landmarks" to landmarks,
    )
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
