import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TodayStackParamList } from '../../types';
import { Colors } from '../../constants/theme';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { Camera, useCameraDevice, useFrameProcessor } from 'react-native-vision-camera';
import { useTensorflowModel } from 'react-native-fast-tflite';
import { runOnJS } from 'react-native-reanimated';
import Svg, { Line, Circle } from 'react-native-svg';
import {
  Keypoint,
  KP,
  SKELETON_PAIRS,
  parseMoveNetOutput,
  getExerciseConfig,
  RepCounter,
  FormIssue,
} from '../../lib/poseUtils';
import { getLiveFormCue } from '../../lib/anthropic';
import { useProfileStore } from '../../store/profileStore';

type Props = NativeStackScreenProps<TodayStackParamList, 'FormCoach'>;

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const MIN_COACHING_INTERVAL_MS = 10_000; // don't call API more than once per 10s
const COACHING_EVERY_N_REPS = 5;
const UI_UPDATE_EVERY_N_FRAMES = 2; // throttle skeleton redraws to ~15fps
const INTRO_DISMISSED_KEY = 'formcoach_intro_dismissed_v1';

const POSITIONING_TIPS: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
  { icon: 'phone-portrait-outline', text: 'Prop your phone up 6–10 feet away so it can see your full body head-to-toe.' },
  { icon: 'body-outline',           text: 'Stand side-on for squats, deadlifts, and lunges. Face the camera for curls, presses, and rows.' },
  { icon: 'sunny-outline',          text: 'Bright, even lighting helps the AI track your joints. Avoid backlight from windows.' },
  { icon: 'square-outline',         text: 'A clean, uncluttered background works best — fewer false detections.' },
  { icon: 'shirt-outline',          text: 'Form-fitting clothes are easier to track than baggy hoodies.' },
];

const SET_COMPLETE_PHRASES = [
  'Great set — rest up and come back stronger.',
  "That's a wrap. Solid work.",
  'Set complete. You earned that rest.',
  'Good grind. Recovery starts now.',
];

function rnd(arr: string[]) { return arr[Math.floor(Math.random() * arr.length)]; }

function scoreColor(s: number) {
  if (s >= 80) return Colors.primary;
  if (s >= 60) return Colors.warning;
  return Colors.danger;
}

// ── Skeleton overlay ───────────────────────────────────────────────────────

interface SkeletonProps {
  keypoints: Keypoint[];
  width: number;
  height: number;
}

function SkeletonOverlay({ keypoints, width, height }: SkeletonProps) {
  if (keypoints.length < 17) return null;
  return (
    <Svg style={StyleSheet.absoluteFill} width={width} height={height}>
      {/* Connections */}
      {SKELETON_PAIRS.map(([a, b]) => {
        const kpA = keypoints[a], kpB = keypoints[b];
        if (!kpA || !kpB || kpA.score < 0.3 || kpB.score < 0.3) return null;
        return (
          <Line
            key={`${a}-${b}`}
            x1={kpA.x * width}  y1={kpA.y * height}
            x2={kpB.x * width}  y2={kpB.y * height}
            stroke={Colors.primary}
            strokeWidth={2.5}
            strokeOpacity={0.85}
          />
        );
      })}
      {/* Joints */}
      {keypoints.map((kp, i) => {
        if (kp.score < 0.3) return null;
        return (
          <Circle
            key={i}
            cx={kp.x * width}
            cy={kp.y * height}
            r={i === KP.NOSE ? 6 : 5}
            fill={Colors.primary}
            fillOpacity={0.9}
          />
        );
      })}
    </Svg>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────

export function FormCoachScreen({ navigation, route }: Props) {
  const { exerciseName } = route.params;
  const { profile } = useProfileStore();
  const config = getExerciseConfig(exerciseName);

  // Camera
  const device = useCameraDevice('front');
  const [cameraPermission, setCameraPermission] = useState<'granted' | 'denied' | 'unknown'>('unknown');

  // TFLite model
  const model = useTensorflowModel(require('../../../assets/models/movenet_lightning.tflite'));

  // Session state
  const [isActive, setIsActive] = useState(false);
  const [repCount, setRepCount] = useState(0);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [showSummary, setShowSummary] = useState(false);

  // Live pose state (updated at ~15fps from worklet)
  const [keypoints, setKeypoints] = useState<Keypoint[]>([]);
  const [currentFormIssue, setCurrentFormIssue] = useState<FormIssue | null>(null);
  const [poseConfidence, setPoseConfidence] = useState(0); // avg visible joint score

  // Coaching cue overlay
  const [coachingCue, setCoachingCue] = useState<string | null>(null);
  const [loadingCue, setLoadingCue] = useState(false);
  const cueAnim = useRef(new Animated.Value(0)).current;

  // Refs that are safe to read in worklets / callbacks
  const repCounterRef = useRef(new RepCounter(config.downThreshold, config.upThreshold));
  const isActiveRef = useRef(false);
  const frameCountRef = useRef(0);
  const lastCoachingRef = useRef(0);
  const repCountRef = useRef(0);

  // Session summary data
  const [repFormScores, setRepFormScores] = useState<number[]>([]);
  const [allFormIssues, setAllFormIssues] = useState<string[]>([]);

  // Positioning tutorial
  const [introVisible, setIntroVisible] = useState(false);
  const [introChecked, setIntroChecked] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    Camera.requestCameraPermission().then(status => {
      setCameraPermission(status === 'granted' ? 'granted' : 'denied');
    });
    AsyncStorage.getItem(INTRO_DISMISSED_KEY).then((v) => {
      if (v !== 'true') setIntroVisible(true);
      setIntroChecked(true);
    });
    return () => { Speech.stop(); };
  }, []);

  const dismissIntro = useCallback(() => {
    if (dontShowAgain) {
      AsyncStorage.setItem(INTRO_DISMISSED_KEY, 'true').catch(() => {});
    }
    setIntroVisible(false);
  }, [dontShowAgain]);

  // ── Animate coaching cue ──
  const showCue = useCallback((cue: string) => {
    setCoachingCue(cue);
    Animated.sequence([
      Animated.timing(cueAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.delay(5000),
      Animated.timing(cueAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
    if (voiceEnabled) {
      Speech.stop();
      Speech.speak(cue, { rate: 0.9, pitch: 1.0 });
    }
  }, [voiceEnabled, cueAnim]);

  // ── Fetch AI coaching cue (async, non-blocking) ──
  const fetchCoachingCue = useCallback(async (reps: number, issue: string | null) => {
    const now = Date.now();
    if (now - lastCoachingRef.current < MIN_COACHING_INTERVAL_MS) return;
    lastCoachingRef.current = now;
    setLoadingCue(true);
    try {
      const cue = await getLiveFormCue(exerciseName, reps, issue);
      showCue(cue);
    } catch { /* non-critical */ } finally {
      setLoadingCue(false);
    }
  }, [exerciseName, showCue]);

  // ── Called from worklet thread via runOnJS ──
  const onPoseUpdate = useCallback((
    kps: Keypoint[],
    confidence: number,
    repCompleted: boolean,
    formIssueText: string | null,
    formScore: number,
  ) => {
    setKeypoints(kps);
    setPoseConfidence(confidence);

    if (formIssueText) {
      setCurrentFormIssue({ cue: formIssueText });
    } else {
      setCurrentFormIssue(null);
    }

    if (repCompleted) {
      const nextRep = repCountRef.current + 1;
      repCountRef.current = nextRep;
      setRepCount(nextRep);
      setRepFormScores(prev => [...prev, formScore]);
      if (formIssueText) setAllFormIssues(prev => [...prev, formIssueText]);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      if (nextRep % COACHING_EVERY_N_REPS === 0) {
        fetchCoachingCue(nextRep, formIssueText);
      }
    }
  }, [fetchCoachingCue]);

  // ── Frame processor (runs on worklet thread) ──
  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    if (!isActiveRef.current) return;
    if (model.state !== 'loaded') return;

    frameCountRef.current += 1;
    const shouldUpdateUI = frameCountRef.current % UI_UPDATE_EVERY_N_FRAMES === 0;

    try {
      const outputs = model.model.runSync([frame]);
      const raw = outputs[0]; // Float32Array, shape [1,1,17,3] flattened
      const kps = parseMoveNetOutput(raw as Float32Array);

      // Confidence: average score of major joints
      const majorJoints = [KP.LEFT_SHOULDER, KP.RIGHT_SHOULDER, KP.LEFT_HIP, KP.RIGHT_HIP];
      const avgConf = majorJoints.reduce((s, i) => s + (kps[i]?.score ?? 0), 0) / majorJoints.length;

      // Form check
      const formIssue = config.checkForm(kps);
      const formScore = Math.round(avgConf * 100);

      // Rep counting
      let repCompleted = false;
      if (config.autoCount && avgConf > 0.4) {
        const progress = config.getProgress(kps);
        if (progress !== null) {
          repCompleted = repCounterRef.current.tick(progress);
        }
      }

      if (shouldUpdateUI) {
        runOnJS(onPoseUpdate)(kps, avgConf, repCompleted, formIssue?.cue ?? null, formScore);
      } else if (repCompleted) {
        // Always fire rep events even if skipping UI update
        runOnJS(onPoseUpdate)(kps, avgConf, true, formIssue?.cue ?? null, formScore);
      }
    } catch {
      // Frame processing errors are non-fatal
    }
  }, [model.state, model.model]);

  const startSession = () => {
    repCounterRef.current = new RepCounter(config.downThreshold, config.upThreshold);
    repCountRef.current = 0;
    frameCountRef.current = 0;
    lastCoachingRef.current = 0;
    isActiveRef.current = true;
    setIsActive(true);
    setRepCount(0);
    setRepFormScores([]);
    setAllFormIssues([]);
    setCurrentFormIssue(null);
    setCoachingCue(null);
  };

  const endSet = () => {
    isActiveRef.current = false;
    setIsActive(false);
    Speech.stop();
    setShowSummary(true);
    if (voiceEnabled) {
      setTimeout(() => Speech.speak(rnd(SET_COMPLETE_PHRASES), { rate: 0.9 }), 400);
    }
  };

  const addManualRep = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = repCountRef.current + 1;
    repCountRef.current = next;
    setRepCount(next);
    setRepFormScores(prev => [...prev, Math.round(poseConfidence * 100)]);
    if (next % COACHING_EVERY_N_REPS === 0) {
      fetchCoachingCue(next, currentFormIssue?.cue ?? null);
    }
  };

  // ── Permission gate ──────────────────────────────────────────────────────
  if (cameraPermission === 'unknown') {
    return <View style={{ flex: 1, backgroundColor: Colors.background }} />;
  }

  if (cameraPermission === 'denied') {
    return (
      <View style={styles.centered}>
        <Ionicons name="camera-outline" size={48} color={Colors.primary} style={{ marginBottom: 20 }} />
        <Text style={styles.permTitle}>Camera access needed</Text>
        <Text style={styles.permBody}>
          Form Coach watches your movement in real time — no video is stored or sent.
        </Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.permBtn}>
          <Text style={styles.permBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.centered}>
        <Ionicons name="camera-outline" size={48} color={Colors.muted} style={{ marginBottom: 20 }} />
        <Text style={styles.permTitle}>No front camera found</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 16 }}>
          <Text style={{ color: Colors.muted, fontSize: 15 }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Model loading state ──────────────────────────────────────────────────
  if (model.state === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={{ color: Colors.textSecondary, marginTop: 16, fontSize: 15 }}>
          Loading pose model…
        </Text>
      </View>
    );
  }

  if (model.state === 'error') {
    return (
      <View style={styles.centered}>
        <Ionicons name="warning-outline" size={48} color={Colors.danger} style={{ marginBottom: 20 }} />
        <Text style={styles.permTitle}>Model failed to load</Text>
        <Text style={styles.permBody}>
          Make sure the MoveNet model file is at{'\n'}assets/models/movenet_lightning.tflite
        </Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.permBtn}>
          <Text style={styles.permBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Summary screen ───────────────────────────────────────────────────────
  if (showSummary) {
    const avgScore = repFormScores.length > 0
      ? Math.round(repFormScores.reduce((a, b) => a + b, 0) / repFormScores.length)
      : 0;
    const uniqueIssues = [...new Set(allFormIssues)].slice(0, 3);

    return (
      <ScrollView style={{ flex: 1, backgroundColor: Colors.background }} contentContainerStyle={{ padding: 32, paddingBottom: 60 }}>
        <Text style={{ color: Colors.muted, fontSize: 12, fontWeight: '600', letterSpacing: 1, marginBottom: 8 }}>SET COMPLETE</Text>
        <Text style={{ color: Colors.text, fontSize: 28, fontWeight: '900', marginBottom: 4 }}>{exerciseName}</Text>
        <Text style={{ color: Colors.textSecondary, fontSize: 16, marginBottom: 32 }}>
          {repCount} rep{repCount !== 1 ? 's' : ''} · pose-detected
        </Text>

        <View style={[styles.scoreCard, { borderColor: scoreColor(avgScore) + '55' }]}>
          <Text style={{ color: Colors.muted, fontSize: 12, fontWeight: '600', letterSpacing: 0.5, marginBottom: 8 }}>AVERAGE FORM SCORE</Text>
          <Text style={{ color: scoreColor(avgScore), fontSize: 64, fontWeight: '900', lineHeight: 70 }}>{avgScore}</Text>
          <Text style={{ color: Colors.textSecondary, fontSize: 14, marginTop: 4 }}>
            {avgScore >= 80 ? 'Excellent form — keep it up' : avgScore >= 60 ? 'Good effort — a few things to tighten' : 'Focus on technique before adding load'}
          </Text>
        </View>

        {uniqueIssues.length > 0 && (
          <>
            <Text style={{ color: Colors.text, fontSize: 17, fontWeight: '800', marginBottom: 12 }}>Key corrections</Text>
            <View style={{ gap: 10, marginBottom: 32 }}>
              {uniqueIssues.map((issue, i) => (
                <View key={i} style={[styles.issueRow, { borderLeftColor: i === 0 ? Colors.warning : Colors.info }]}>
                  <Ionicons name={i === 0 ? 'warning-outline' : 'bulb-outline'} size={18} color={i === 0 ? Colors.warning : Colors.info} />
                  <Text style={{ color: Colors.text, fontSize: 14, flex: 1, lineHeight: 20 }}>{issue}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {uniqueIssues.length === 0 && repCount > 0 && (
          <View style={[styles.issueRow, { borderLeftColor: Colors.primary, marginBottom: 32 }]}>
            <Ionicons name="checkmark-circle-outline" size={18} color={Colors.primary} />
            <Text style={{ color: Colors.text, fontSize: 14, flex: 1, lineHeight: 20 }}>
              Clean session — no major form issues detected.
            </Text>
          </View>
        )}

        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.doneBtn}>
          <Text style={styles.doneBtnText}>Back to Workout</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── Live camera screen ────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {/* Positioning tutorial modal */}
      <Modal
        visible={introChecked && introVisible}
        transparent
        animationType="fade"
        onRequestClose={dismissIntro}
      >
        <View style={styles.introBackdrop}>
          <View style={styles.introCard}>
            <View style={styles.introIconCircle}>
              <Ionicons name="videocam-outline" size={28} color={Colors.primary} />
            </View>
            <Text style={styles.introTitle}>Set up your camera</Text>
            <Text style={styles.introSubtitle}>
              For best results, make sure the camera can see your whole body.
            </Text>

            <View style={{ marginTop: 18, marginBottom: 4 }}>
              {POSITIONING_TIPS.map((tip, i) => (
                <View key={i} style={styles.introTipRow}>
                  <View style={styles.introTipIconWrap}>
                    <Ionicons name={tip.icon} size={18} color={Colors.primary} />
                  </View>
                  <Text style={styles.introTipText}>{tip.text}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              onPress={() => setDontShowAgain((v) => !v)}
              style={styles.introCheckRow}
              activeOpacity={0.7}
            >
              <View style={[styles.introCheckbox, dontShowAgain && styles.introCheckboxActive]}>
                {dontShowAgain && <Ionicons name="checkmark" size={14} color="#000" />}
              </View>
              <Text style={styles.introCheckLabel}>Don't show this again</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={dismissIntro} style={styles.introBtn}>
              <Text style={styles.introBtnText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        frameProcessor={isActive ? frameProcessor : undefined}
        outputOrientation="preview"
      />

      {/* Skeleton overlay */}
      {isActive && keypoints.length > 0 && (
        <SkeletonOverlay keypoints={keypoints} width={SCREEN_W} height={SCREEN_H} />
      )}

      {/* Top scrim */}
      <View style={styles.topScrim} />
      <View style={styles.bottomScrim} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => { Speech.stop(); navigation.goBack(); }}
          style={styles.closeBtn}
        >
          <Ionicons name="close" size={18} color={Colors.text} />
          <Text style={{ color: Colors.text, fontSize: 15, fontWeight: '700' }}>Close</Text>
        </TouchableOpacity>

        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: Colors.text, fontSize: 15, fontWeight: '800' }}>{exerciseName}</Text>
          {isActive && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.primary }} />
              <Text style={{ color: Colors.primary, fontSize: 11, fontWeight: '700' }}>LIVE</Text>
            </View>
          )}
        </View>

        <TouchableOpacity onPress={() => setVoiceEnabled(v => !v)} style={{ opacity: voiceEnabled ? 1 : 0.4 }}>
          <Ionicons name={voiceEnabled ? 'volume-high' : 'volume-mute'} size={22} color={Colors.text} />
        </TouchableOpacity>
      </View>

      {/* Pose confidence badge */}
      {isActive && (
        <View style={[styles.badge, { top: 100, right: 20, borderColor: scoreColor(Math.round(poseConfidence * 100)) }]}>
          <Text style={{ color: scoreColor(Math.round(poseConfidence * 100)), fontSize: 20, fontWeight: '900', lineHeight: 22 }}>
            {Math.round(poseConfidence * 100)}
          </Text>
          <Text style={{ color: Colors.muted, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 }}>CONF</Text>
        </View>
      )}

      {/* Form issue badge */}
      {isActive && currentFormIssue && (
        <View style={[styles.badge, { top: 100, left: 20, borderColor: Colors.warning, paddingHorizontal: 8, paddingVertical: 6, maxWidth: 140 }]}>
          <Ionicons name="flash" size={12} color={Colors.warning} />
          <Text style={{ color: Colors.warning, fontSize: 10, fontWeight: '700', textAlign: 'center', marginTop: 2 }}>
            FORM
          </Text>
        </View>
      )}

      {/* Loading cue indicator */}
      {loadingCue && (
        <View style={[styles.analyzingBadge, { top: 160, left: 20 }]}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={{ color: Colors.primary, fontSize: 12, fontWeight: '700' }}>Coach…</Text>
        </View>
      )}

      {/* Coaching cue bubble */}
      <Animated.View style={[
        styles.cueBubble,
        {
          opacity: cueAnim,
          transform: [{ translateY: cueAnim.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }],
        },
      ]}>
        {coachingCue && (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <Ionicons name="flash" size={16} color={Colors.primary} style={{ marginTop: 2 }} />
            <Text style={{ color: Colors.text, fontSize: 15, fontWeight: '600', lineHeight: 21, flex: 1 }}>
              {coachingCue}
            </Text>
          </View>
        )}
      </Animated.View>

      {/* Form issue text (local, instant) */}
      {isActive && currentFormIssue && !coachingCue && (
        <View style={[styles.cueBubble, { borderLeftColor: Colors.warning, opacity: 1 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <Ionicons name="warning-outline" size={16} color={Colors.warning} style={{ marginTop: 2 }} />
            <Text style={{ color: Colors.text, fontSize: 14, fontWeight: '600', lineHeight: 20, flex: 1 }}>
              {currentFormIssue.cue}
            </Text>
          </View>
        </View>
      )}

      {/* Rep counter */}
      {isActive && (
        <View style={styles.repCenter}>
          <Text style={{ color: Colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: 2 }}>
            {config.autoCount ? 'REPS (AUTO)' : 'REPS (TAP +)'}
          </Text>
          <Text style={{ color: Colors.text, fontSize: 96, fontWeight: '900', lineHeight: 100 }}>{repCount}</Text>
        </View>
      )}

      {/* Bottom controls */}
      <View style={styles.bottomControls}>
        {!isActive ? (
          <TouchableOpacity onPress={startSession} style={styles.startBtn}>
            <Ionicons name="body-outline" size={22} color="#000" />
            <Text style={styles.startBtnText}>Start Form Coach</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ gap: 12 }}>
            {/* Manual rep button shown for both auto and manual counting */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={() => {
                  repCountRef.current = Math.max(0, repCountRef.current - 1);
                  setRepCount(repCountRef.current);
                }}
                style={[styles.repBtn, { flex: 1 }]}
              >
                <Text style={{ color: Colors.text, fontSize: 22, fontWeight: '300' }}>−</Text>
              </TouchableOpacity>

              {!config.autoCount && (
                <TouchableOpacity onPress={addManualRep} style={[styles.repBtn, { flex: 2, borderColor: Colors.primary, backgroundColor: Colors.primary + '22' }]}>
                  <Text style={{ color: Colors.primary, fontSize: 15, fontWeight: '800' }}>+ Rep</Text>
                </TouchableOpacity>
              )}

              {config.autoCount && (
                <View style={[styles.repBtn, { flex: 2, opacity: 0.4 }]}>
                  <Text style={{ color: Colors.muted, fontSize: 12, fontWeight: '600', textAlign: 'center' }}>Auto counting</Text>
                </View>
              )}
            </View>

            <TouchableOpacity onPress={endSet} style={styles.endBtn}>
              <Text style={styles.endBtnText}>End Set — View Summary</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1, backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center', padding: 32,
  },
  permTitle: { color: Colors.text, fontSize: 22, fontWeight: '900', textAlign: 'center', marginBottom: 12 },
  permBody:  { color: Colors.textSecondary, fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  permBtn:   { backgroundColor: Colors.primary, paddingHorizontal: 32, paddingVertical: 16, borderRadius: 12 },
  permBtnText: { color: '#000', fontWeight: '800', fontSize: 16 },

  topScrim:    { position: 'absolute', top: 0, left: 0, right: 0, height: 130, backgroundColor: 'rgba(0,0,0,0.6)' },
  bottomScrim: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 210, backgroundColor: 'rgba(0,0,0,0.7)' },

  header: {
    position: 'absolute', top: 0, left: 0, right: 0,
    padding: 20, paddingTop: 52,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  closeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
  },
  badge: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 12, borderWidth: 1.5,
    paddingHorizontal: 12, paddingVertical: 8,
    alignItems: 'center',
  },
  analyzingBadge: {
    position: 'absolute',
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6,
  },
  cueBubble: {
    position: 'absolute', top: 165, left: 20, right: 20,
    backgroundColor: 'rgba(10,10,10,0.9)',
    borderRadius: 14, padding: 14,
    borderLeftWidth: 3, borderLeftColor: Colors.primary,
  },
  repCenter: {
    position: 'absolute', top: 0, bottom: 220, left: 0, right: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  bottomControls: { position: 'absolute', bottom: 44, left: 24, right: 24 },
  startBtn: {
    backgroundColor: Colors.primary, borderRadius: 14,
    padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  startBtnText: { color: '#000', fontWeight: '900', fontSize: 18 },
  repBtn: {
    height: 52, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  endBtn: {
    backgroundColor: 'rgba(30,30,30,0.9)', borderRadius: 14,
    padding: 18, alignItems: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  endBtnText: { color: Colors.text, fontWeight: '800', fontSize: 16 },
  scoreCard: {
    backgroundColor: Colors.surface, borderRadius: 20, padding: 28,
    borderWidth: 1.5, alignItems: 'center', marginBottom: 24,
  },
  issueRow: {
    backgroundColor: Colors.surface2, borderRadius: 12,
    padding: 14, borderLeftWidth: 3,
    flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 8,
  },
  doneBtn:    { backgroundColor: Colors.primary, borderRadius: 14, padding: 18, alignItems: 'center' },
  doneBtnText: { color: '#000', fontWeight: '800', fontSize: 16 },

  // Positioning tutorial modal
  introBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  introCard: {
    width: '100%', maxWidth: 420,
    backgroundColor: Colors.surface, borderRadius: 20,
    padding: 24,
    borderWidth: 1, borderColor: Colors.border,
  },
  introIconCircle: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.primary + '22',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
  },
  introTitle: { color: Colors.text, fontSize: 22, fontWeight: '900', marginBottom: 6 },
  introSubtitle: { color: Colors.textSecondary, fontSize: 14, lineHeight: 20 },
  introTipRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    marginBottom: 12,
  },
  introTipIconWrap: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: Colors.surface2,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },
  introTipText: { color: Colors.text, fontSize: 13.5, lineHeight: 19, flex: 1 },
  introCheckRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginTop: 14, marginBottom: 18,
  },
  introCheckbox: {
    width: 20, height: 20, borderRadius: 5,
    borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  introCheckboxActive: {
    backgroundColor: Colors.primary, borderColor: Colors.primary,
  },
  introCheckLabel: { color: Colors.textSecondary, fontSize: 13.5, fontWeight: '600' },
  introBtn: {
    backgroundColor: Colors.primary, borderRadius: 12,
    padding: 16, alignItems: 'center',
  },
  introBtnText: { color: '#000', fontWeight: '800', fontSize: 16 },
});
