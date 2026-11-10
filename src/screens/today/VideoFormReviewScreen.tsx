import React, { useEffect, useRef, useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { ResizeMode, Video } from 'expo-av';
import { Button } from '../../components/ui/Button';
import { GradientButton } from '../../components/ui/GradientButton';
import { SectionLabel } from '../../components/ui/SectionLabel';
import { getExerciseById } from '../../constants/exercises';
import { Colors } from '../../constants/theme';
import {
  isReviewVideoDuration,
  MAX_REVIEW_VIDEO_BYTES,
  MAX_REVIEW_VIDEO_SECONDS,
  pickedReviewVideo,
  recordedReviewVideo,
  reviewVideoForm,
  supportsVideoFormReview,
  VIDEO_FORM_REVIEW_ENABLED,
  type ReviewVideo,
  type VideoFormReviewExerciseId,
  type VideoFormReviewResult,
} from '../../lib/videoFormReview';
import { useSubscriptionStore } from '../../store/subscriptionStore';
import { TodayStackParamList } from '../../types';

type Props = NativeStackScreenProps<TodayStackParamList, 'VideoFormReview'>;
type Operation = 'opening-camera' | 'picking' | 'recording' | 'submitting';
// Native video duration can round up at the last frame.
const CAPTURE_SECONDS = MAX_REVIEW_VIDEO_SECONDS - 1;

export function VideoFormReviewScreen({ route }: Props) {
  const isPremium = useSubscriptionStore((state) => state.isPremium);
  const { exerciseId } = route.params;

  if (!VIDEO_FORM_REVIEW_ENABLED || !isPremium || !supportsVideoFormReview(exerciseId)) {
    return (
      <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: Colors.background, padding: 24 }}>
        <Text style={{ color: Colors.text }}>Video Form Review is unavailable for this exercise or account.</Text>
      </SafeAreaView>
    );
  }

  return <VideoReview exerciseId={exerciseId} />;
}

function VideoReview({ exerciseId }: { exerciseId: VideoFormReviewExerciseId }) {
  const isFocused = useIsFocused();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const operationRef = useRef<Operation | null>(null);
  const upload = useRef<AbortController | null>(null);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [clip, setClip] = useState<ReviewVideo | null>(null);
  const [verifiedUri, setVerifiedUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VideoFormReviewResult | null>(null);

  useEffect(() => () => {
    upload.current?.abort();
    upload.current = null;
  }, []);

  useEffect(() => {
    if (!isFocused) {
      setCameraOpen(false);
      setCameraReady(false);
    }
  }, [isFocused]);

  const begin = (next: Operation) => {
    if (operationRef.current) return false;
    operationRef.current = next;
    setOperation(next);
    setError(null);
    return true;
  };

  const finish = () => {
    operationRef.current = null;
    setOperation(null);
  };

  const closeCamera = () => {
    setCameraOpen(false);
    setCameraReady(false);
  };

  const useClip = (video: ReviewVideo) => {
    setClip(video);
    setVerifiedUri(null);
    setResult(null);
    closeCamera();
  };

  const openCamera = async () => {
    if (!begin('opening-camera')) return;
    try {
      const granted = permission?.granted || (await requestPermission()).granted;
      if (!granted) {
        setError('Allow camera access to record, or choose a video instead.');
        return;
      }
      setCameraOpen(true);
    } catch {
      setError('Could not open the camera. You can still choose a video.');
    } finally {
      finish();
    }
  };

  const record = async () => {
    if (!camera.current || !cameraReady || !begin('recording')) return;
    try {
      const video = await camera.current.recordAsync({
        maxDuration: CAPTURE_SECONDS,
        maxFileSize: MAX_REVIEW_VIDEO_BYTES,
      });
      if (!video?.uri) throw new Error('No recording');
      useClip(recordedReviewVideo(video.uri));
    } catch {
      setError('Could not record the video. Try recording again.');
    } finally {
      finish();
    }
  };

  const choose = async () => {
    if (!begin('picking')) return;
    try {
      const selection = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        allowsMultipleSelection: false,
        videoExportPreset: ImagePicker.VideoExportPreset.H264_640x480,
      });
      if (!selection.canceled) useClip(pickedReviewVideo(selection.assets[0]));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open that video. Choose another clip.');
    } finally {
      finish();
    }
  };

  const submit = async () => {
    if (!clip || verifiedUri !== clip.uri || result || !begin('submitting')) return;
    const controller = new AbortController();
    upload.current = controller;
    const timeout = setTimeout(() => controller.abort(), 120_000);
    try {
      const review = await reviewVideoForm(exerciseId, clip, controller.signal);
      if (upload.current === controller) setResult(review);
    } catch (err) {
      if (upload.current === controller) {
        setError(controller.signal.aborted
          ? 'The review took too long. Try submitting again.'
          : err instanceof Error ? err.message : 'Could not review your video. Try again.');
      }
    } finally {
      clearTimeout(timeout);
      if (upload.current === controller) {
        upload.current = null;
        finish();
      }
    }
  };

  const recording = operation === 'recording';
  const submitting = operation === 'submitting';
  const busy = operation !== null;

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 36, gap: 14 }}>
        <Text style={{ color: Colors.text, fontSize: 26, fontWeight: '900' }}>
          {getExerciseById(exerciseId)?.name}
        </Text>
        <Text style={{ color: Colors.textSecondary, fontSize: 14, lineHeight: 21 }}>
          Film from the side with your full body in view. Record a silent clip or choose a 2–20 second MP4 or MOV, up to 20 MB.
        </Text>

        {cameraOpen && isFocused ? (
          <>
            <View style={{ height: 300, borderRadius: 14, overflow: 'hidden' }}>
              <CameraView
                ref={camera}
                style={{ flex: 1 }}
                facing="back"
                mode="video"
                videoQuality="480p"
                mute
                onCameraReady={() => setCameraReady(true)}
                onMountError={() => {
                  closeCamera();
                  setError('Camera unavailable. You can still choose a video.');
                }}
              />
            </View>
            <GradientButton
              title={recording ? 'Stop recording' : 'Start recording'}
              icon={recording ? 'stop-circle-outline' : 'videocam-outline'}
              onPress={recording ? () => camera.current?.stopRecording() : record}
              disabled={!cameraReady}
            />
            <Button title="Cancel camera" variant="ghost" onPress={closeCamera} disabled={recording} />
          </>
        ) : (
          <>
            {clip && (
              <Video
                key={clip.uri}
                source={{ uri: clip.uri }}
                style={{ width: '100%', height: 250, borderRadius: 14, backgroundColor: Colors.surface }}
                resizeMode={ResizeMode.CONTAIN}
                useNativeControls
                isMuted
                onLoad={(status) => {
                  if (status.isLoaded && isReviewVideoDuration(status.durationMillis)) {
                    setVerifiedUri(clip.uri);
                  } else {
                    setError('Choose a playable video that is 2 to 20 seconds long.');
                  }
                }}
                onError={() => {
                  setVerifiedUri(null);
                  setError('This video could not be played. Record or choose another clip.');
                }}
              />
            )}
            <Button title={clip ? 'Record again' : 'Record video'} variant="secondary" onPress={openCamera} disabled={busy} />
            <Button title={clip ? 'Choose another video' : 'Choose a video'} variant="secondary" onPress={choose} disabled={busy} />
            {permission && !permission.granted && !permission.canAskAgain && (
              <Button title="Open camera settings" variant="ghost" onPress={() => void Linking.openSettings()} disabled={busy} />
            )}
          </>
        )}

        {error && (
          <Text accessibilityRole="alert" style={{ color: Colors.warning, fontSize: 14, lineHeight: 21 }}>{error}</Text>
        )}

        {clip && !cameraOpen && (
          result ? (
            <View style={{ padding: 16, gap: 8, borderRadius: 14, backgroundColor: Colors.surface }}>
              <SectionLabel>{result.status === 'reviewed' ? 'Form cue' : 'Try another clip'}</SectionLabel>
              <Text accessibilityLiveRegion="polite" style={{ color: Colors.text, fontSize: 16, lineHeight: 23 }}>{result.cue}</Text>
            </View>
          ) : (
            <>
              <View style={{ padding: 14, gap: 6, borderRadius: 12, backgroundColor: Colors.surface }}>
                <SectionLabel>Private upload</SectionLabel>
                <Text style={{ color: Colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
                  Submit for review uploads this clip privately to RYZR. RYZR measures your movement and deletes its copy after processing. Claude receives only movement measurements.
                </Text>
              </View>
              <GradientButton
                title="Submit for review"
                icon="cloud-upload-outline"
                onPress={submit}
                loading={submitting}
                disabled={busy || verifiedUri !== clip.uri}
              />
              {submitting && (
                <Text accessibilityLiveRegion="polite" style={{ color: Colors.textSecondary, textAlign: 'center' }}>
                  Uploading and reviewing your clip…
                </Text>
              )}
            </>
          )
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
