package expo.modules.ryzrpose

import com.mrousavy.camera.frameprocessors.FrameProcessorPluginRegistry
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Exists to get the "ryzrPose" frame processor plugin registered: Expo
// autolinking instantiates this module at startup, which loads the class and
// runs the companion initializer below. JS also touches the module before
// asking VisionCamera for the plugin, so the order never depends on timing.
class RyzrPoseModule : Module() {
  companion object {
    init {
      FrameProcessorPluginRegistry.addFrameProcessorPlugin("ryzrPose") { proxy, options ->
        PosePlugin(proxy, options)
      }
    }
  }

  override fun definition() = ModuleDefinition {
    Name("RyzrPose")

    Function("isAvailable") { true }
  }
}
