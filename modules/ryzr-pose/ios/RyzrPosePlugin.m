// Apple Vision body-pose detector, exposed to JS as the VisionCamera frame
// processor plugin "ryzrPose".
//
// Vision is a system framework, so this adds nothing to the app download.
// Results are returned in pixels of the *upright* image; nativePose.ts turns
// them into the pipeline's normalized coordinates.

#import <Foundation/Foundation.h>
#import <CoreMedia/CoreMedia.h>
#import <Vision/Vision.h>
#import <VisionCamera/Frame.h>
#import <VisionCamera/FrameProcessorPlugin.h>
#import <VisionCamera/FrameProcessorPluginRegistry.h>

@interface RyzrPosePlugin : FrameProcessorPlugin
@end

@implementation RyzrPosePlugin {
  VNDetectHumanBodyPoseRequest* _request;
  NSDictionary<VNHumanBodyPoseObservationJointName, NSString*>* _names;
}

VISION_EXPORT_FRAME_PROCESSOR(RyzrPosePlugin, ryzrPose)

- (instancetype)initWithProxy:(VisionCameraProxyHolder*)proxy withOptions:(NSDictionary*)options {
  self = [super initWithProxy:proxy withOptions:options];
  if (self) {
    _request = [[VNDetectHumanBodyPoseRequest alloc] init];
    // Vision's left/right are the subject's own, same as the pipeline's.
    _names = @{
      VNHumanBodyPoseObservationJointNameNose : @"nose",
      VNHumanBodyPoseObservationJointNameLeftEye : @"left_eye",
      VNHumanBodyPoseObservationJointNameRightEye : @"right_eye",
      VNHumanBodyPoseObservationJointNameLeftEar : @"left_ear",
      VNHumanBodyPoseObservationJointNameRightEar : @"right_ear",
      VNHumanBodyPoseObservationJointNameLeftShoulder : @"left_shoulder",
      VNHumanBodyPoseObservationJointNameRightShoulder : @"right_shoulder",
      VNHumanBodyPoseObservationJointNameLeftElbow : @"left_elbow",
      VNHumanBodyPoseObservationJointNameRightElbow : @"right_elbow",
      VNHumanBodyPoseObservationJointNameLeftWrist : @"left_wrist",
      VNHumanBodyPoseObservationJointNameRightWrist : @"right_wrist",
      VNHumanBodyPoseObservationJointNameLeftHip : @"left_hip",
      VNHumanBodyPoseObservationJointNameRightHip : @"right_hip",
      VNHumanBodyPoseObservationJointNameLeftKnee : @"left_knee",
      VNHumanBodyPoseObservationJointNameRightKnee : @"right_knee",
      VNHumanBodyPoseObservationJointNameLeftAnkle : @"left_ankle",
      VNHumanBodyPoseObservationJointNameRightAnkle : @"right_ankle",
    };
  }
  return self;
}

/// `rotation` is the clockwise rotation (degrees) that brings the frame upright.
/// Vision wants the orientation the pixel data is *in*, which is that rotation's
/// EXIF equivalent: data needing 90° clockwise is `.right`.
static CGImagePropertyOrientation OrientationForRotation(int rotation) {
  switch (rotation) {
    case 90: return kCGImagePropertyOrientationRight;
    case 180: return kCGImagePropertyOrientationDown;
    case 270: return kCGImagePropertyOrientationLeft;
    default: return kCGImagePropertyOrientationUp;
  }
}

- (id)callback:(Frame*)frame withArguments:(NSDictionary*)arguments {
  NSNumber* rotationArg = arguments[@"rotation"];
  int rotation = [rotationArg isKindOfClass:[NSNumber class]] ? rotationArg.intValue : 0;

  CVPixelBufferRef pixels = CMSampleBufferGetImageBuffer(frame.buffer);
  if (pixels == NULL) return nil;

  double bufferWidth = (double)CVPixelBufferGetWidth(pixels);
  double bufferHeight = (double)CVPixelBufferGetHeight(pixels);
  BOOL swap = rotation == 90 || rotation == 270;
  double width = swap ? bufferHeight : bufferWidth;
  double height = swap ? bufferWidth : bufferHeight;

  VNImageRequestHandler* handler =
      [[VNImageRequestHandler alloc] initWithCVPixelBuffer:pixels
                                               orientation:OrientationForRotation(rotation)
                                                   options:@{}];
  NSError* error = nil;
  if (![handler performRequests:@[ _request ] error:&error]) return nil;

  NSMutableDictionary* landmarks = [NSMutableDictionary dictionary];
  VNHumanBodyPoseObservation* observation = _request.results.firstObject;
  if (observation != nil) {
    NSDictionary<VNHumanBodyPoseObservationJointName, VNRecognizedPoint*>* points =
        [observation recognizedPointsForJointsGroupName:VNHumanBodyPoseObservationJointsGroupNameAll
                                                  error:nil];
    for (VNHumanBodyPoseObservationJointName joint in _names) {
      VNRecognizedPoint* point = points[joint];
      if (point == nil || point.confidence <= 0) continue;
      // Vision is normalized with the origin bottom-left; flip to top-left pixels.
      landmarks[_names[joint]] = @{
        @"x" : @(point.location.x * width),
        @"y" : @((1.0 - point.location.y) * height),
        @"score" : @(point.confidence),
      };
    }
  }

  return @{ @"width" : @(width), @"height" : @(height), @"landmarks" : landmarks };
}

@end
