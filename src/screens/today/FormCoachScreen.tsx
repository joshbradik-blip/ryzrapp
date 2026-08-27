import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ScrollView,
  ActivityIndicator,
  Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TodayStackParamList } from '../../types';
import { Colors } from '../../constants/theme';
import { haptic } from '../../lib/feedback';
import { useSettingsStore } from '../../store/settingsStore';
import * as Speech from 'expo-speech';
import { speak, stopSpeaking } from '../../lib/voice';
import { Camera, useCameraDevice, useCameraFormat } from 'react-native-vision-camera';
import { analyzePoseSnapshot, summarizeSetForCoach, PoseSnapshot } from '../../lib/anthropic';
import { useFormCoach } from '../../lib/pose/useFormCoach';
import type { SessionSummary } from '../../lib/pose';

type Props = NativeStackScreenProps<TodayStackParamList, 'FormCoach'>;

const INTRO_DISMISSED_KEY = 'formcoach_intro_dismissed_v2';
/** Snapshot-mode capture cadence — only used when on-device pose is missing. */
const CAPTURE_INTERVAL_MS = 2000;
const MIN_SPEAK_INTERVAL_MS = 6_000;

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

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.split(',')[1] ?? '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function FormCoachScreen({ navigation, route }: Props) {
  const { exerciseName } = route.params;

  // Camera
  const [cameraFacing, setCameraFacing] = useState<'back' | 'front'>('back');
  const device = useCameraDevice(cameraFacing);
  const format = useCameraFormat(device, [
    { photoResolution: { width: 1280, height: 720 } },
  ]);
  const cameraRef = useRef<Camera>(null);
  const [cameraPermission, setCameraPermission] = useState<'granted' | 'denied' | 'unknown'>('unknown');
  const [torchOn, setTorchOn] = useState(false);

  // Session state
  const [isActive, setIsActive] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(useSettingsStore.getState().voiceEnabled);
  const [showSummary, setShowSummary] = useState(false);
  const [finalSummary, setFinalSummary] = useState<SessionSummary | null>(null);
  const [coachNote, setCoachNote] = useState<string | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);

  const lastSpokenCueRef = useRef<string | null>(null);
  const lastSpokenAtRef = useRef(0);

  const maybeSpeak = useCallback((text: string) => {
    if (!voiceEnabled) return;
    const now = Date.now();
    if (text === lastSpokenCueRef.current && now - lastSpokenAtRef.current < MIN_SPEAK_INTERVAL_MS) {
      return;
    }
    lastSpokenCueRef.current = text;
    lastSpokenAtRef.current = now;
    speak(text);
  }, [voiceEnabled]);

  const handleRep = useCallback((index: number) => {
    haptic.impact('medium');
    if (useSettingsStore.getState().voiceEnabled) {
      // Rep counts stay on-device TTS: they must fire instantly, and a network
      // round-trip per rep would lag the count behind the movement.
      stopSpeaking();
      Speech.speak(String(index), { rate: 1.0, pitch: 1.05 });
    }
  }, []);

  // ── On-device pose pipeline ─────────────────────────────────────────────
  const coach = useFormCoach({
    exerciseName,
    active: isActive,
    onRep: handleRep,
    onCue: maybeSpeak,
  });

  const poseMode = coach.poseAvailable;

  // ── Snapshot fallback (older builds without the pose plugin) ────────────
  const [snapReps, setSnapReps] = useState(0);
  const [snapScore, setSnapScore] = useState(0);
  const [snapStatus, setSnapStatus] = useState('');
  const [snapIssue, setSnapIssue] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const snapRepsRef = useRef(0);
  const snapScoresRef = useRef<number[]>([]);
  const snapIssuesRef = useRef<string[]>([]);
  const analyzingRef = useRef(false);
  const isActiveRef = useRef(false);
  const lastPositionRef = useRef<PoseSnapshot['position']>('ready');

  const cueAnim = useRef(new Animated.Value(0)).current;
  const [visibleCue, setVisibleCue] = useState<string | null>(null);

  // Surface whichever cue is current, from either pipeline.
  const cueId = coach.state.cue?.id ?? null;
  useEffect(() => {
    const text = coach.state.cue?.text;
    if (!text) return;
    setVisibleCue(text);
    cueAnim.setValue(0);
    Animated.sequence([
      Animated.timing(cueAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.delay(4200),
      Animated.timing(cueAnim, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start();
  }, [cueId, cueAnim]);

  useEffect(() => {
    Camera.requestCameraPermission().then(status => {
      setCameraPermission(status === 'granted' ? 'granted' : 'denied');
    });
    return () => { stopSpeaking(); };
  }, []);

  // Positioning tutorial
  const [introVisible, setIntroVisible] = useState(false);
  const [introChecked, setIntroChecked] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(INTRO_DISMISSED_KEY).then((v) => {
      if (v !== 'true') setIntroVisible(true);
      setIntroChecked(true);
    });
  }, []);

  const dismissIntro = useCallback(() => {
    if (dontShowAgain) {
      AsyncStorage.setItem(INTRO_DISMISSED_KEY, 'true').catch(() => {});
    }
    setIntroVisible(false);
  }, [dontShowAgain]);

  const captureAndAnalyze = useCallback(async () => {
    if (!cameraRef.current || analyzingRef.current || !isActiveRef.current) return;
    analyzingRef.current = true;
    setIsAnalyzing(true);
    try {
      const photo = await cameraRef.current.takePhoto({ flash: 'off', enableShutterSound: false });
      const filePath = photo.path.startsWith('file://') ? photo.path : `file://${photo.path}`;
      const response = await fetch(filePath);
      const blob = await response.blob();
      const base64 = await blobToBase64(blob);

      const result = await analyzePoseSnapshot(exerciseName, base64);
      if (!isActiveRef.current) return;

      setSnapScore(result.score);
      if (!result.visible || result.position === 'unknown') {
        setSnapStatus("Can't see you clearly");
        setSnapIssue(null);
        return;
      }
      setSnapStatus(result.position.toUpperCase());
      setSnapIssue(result.formIssue);
      if (result.formIssue) maybeSpeak(result.formIssue);

      const prev = lastPositionRef.current;
      const curr = result.position;
      if (prev === 'contracted' && (curr === 'ready' || curr === 'mid')) {
        const next = snapRepsRef.current + 1;
        snapRepsRef.current = next;
        setSnapReps(next);
        snapScoresRef.current.push(result.score);
        if (result.formIssue) snapIssuesRef.current.push(result.formIssue);
        handleRep(next);
      }
      lastPositionRef.current = curr;
    } catch (e: any) {
      console.warn('[FormCoach] snapshot analyze failed:', e?.message ?? e);
    } finally {
      analyzingRef.current = false;
      setIsAnalyzing(false);
    }
  }, [exerciseName, maybeSpeak, handleRep]);

  useEffect(() => {
    if (!isActive || poseMode) return;
    const interval = setInterval(() => { captureAndAnalyze(); }, CAPTURE_INTERVAL_MS);
    captureAndAnalyze();
    return () => clearInterval(interval);
  }, [isActive, poseMode, captureAndAnalyze]);

  const startSession = () => {
    coach.reset();
    snapRepsRef.current = 0;
    snapScoresRef.current = [];
    snapIssuesRef.current = [];
    lastPositionRef.current = 'ready';
    analyzingRef.current = false;
    isActiveRef.current = true;
    lastSpokenCueRef.current = null;
    lastSpokenAtRef.current = 0;
    setSnapReps(0);
    setSnapScore(0);
    setSnapStatus('Warming up…');
    setSnapIssue(null);
    setVisibleCue(null);
    setCoachNote(null);
    setIsActive(true);
  };

  const endSet = async () => {
    isActiveRef.current = false;
    setIsActive(false);
    stopSpeaking();

    const summary: SessionSummary = poseMode
      ? coach.summary() ?? emptySummary(exerciseName)
      : snapshotSummary(exerciseName, snapRepsRef.current, snapScoresRef.current, snapIssuesRef.current);

    setFinalSummary(summary);
    setShowSummary(true);
    setTorchOn(false);

    if (voiceEnabled) {
      setTimeout(() => speak(rnd(SET_COMPLETE_PHRASES)), 400);
    }

    if (summary.reps > 0) {
      setCoachLoading(true);
      try {
        const note = await summarizeSetForCoach(summary);
        setCoachNote(note);
      } catch (e) {
        console.warn('[FormCoach] coach summary failed:', e);
      } finally {
        setCoachLoading(false);
      }
    }
  };

  const reps = poseMode ? coach.state.reps : snapReps;
  const score = poseMode ? coach.state.score : (snapScore || null);
  const framing = coach.state.framing;

  // ── Permission gate ──
  if (cameraPermission === 'unknown') {
    return <View style={{ flex: 1, backgroundColor: Colors.background }} />;
  }

  if (cameraPermission === 'denied') {
    return (
      <View style={styles.centered}>
        <Ionicons name="camera-outline" size={48} color={Colors.primary} style={{ marginBottom: 20 }} />
        <Text style={styles.permTitle}>Camera access needed</Text>
        <Text style={styles.permBody}>
          Form Coach watches your movement in real time — no video is stored or uploaded.
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
        <Text style={styles.permTitle}>No camera found</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 16 }}>
          <Text style={{ color: Colors.muted, fontSize: 15 }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Summary ──
  if (showSummary && finalSummary) {
    const s = finalSummary;
    return (
      <ScrollView style={{ flex: 1, backgroundColor: Colors.background }} contentContainerStyle={{ padding: 32, paddingBottom: 60 }}>
        <Text style={styles.kicker}>SET COMPLETE</Text>
        <Text style={{ color: Colors.text, fontSize: 28, fontWeight: '900', marginBottom: 4 }}>{exerciseName}</Text>
        <Text style={{ color: Colors.textSecondary, fontSize: 16, marginBottom: 28 }}>
          {s.reps} rep{s.reps !== 1 ? 's' : ''}
        </Text>

        <View style={[styles.scoreCard, { borderColor: scoreColor(s.averageScore) + '55' }]}>
          <Text style={styles.kicker}>AVERAGE FORM SCORE</Text>
          <Text style={{ color: scoreColor(s.averageScore), fontSize: 64, fontWeight: '900', lineHeight: 70 }}>
            {s.averageScore}
          </Text>
          {s.repScores.length > 1 && (
            <View style={styles.sparkRow}>
              {s.repScores.map((v, i) => (
                <View
                  key={i}
                  style={{
                    width: 6,
                    height: Math.max(4, (v / 100) * 34),
                    borderRadius: 3,
                    backgroundColor: scoreColor(v),
                  }}
                />
              ))}
            </View>
          )}
          <Text style={{ color: Colors.textSecondary, fontSize: 14, marginTop: 10, textAlign: 'center' }}>
            {s.averageScore >= 80 ? 'Excellent form — keep it up'
              : s.averageScore >= 60 ? 'Good effort — a few things to tighten'
              : 'Focus on technique before adding load'}
          </Text>
        </View>

        {s.trackingQuality > 0 && s.trackingQuality < 0.5 && (
          <View style={[styles.issueRow, { borderLeftColor: Colors.info, marginBottom: 20 }]}>
            <Ionicons name="information-circle-outline" size={18} color={Colors.info} />
            <Text style={styles.issueText}>
              Tracking was patchy this set ({Math.round(s.trackingQuality * 100)}% confidence), so
              treat these numbers as rough.
            </Text>
          </View>
        )}

        {(coachLoading || coachNote) && (
          <View style={styles.coachCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Ionicons name="chatbubble-ellipses-outline" size={16} color={Colors.primary} />
              <Text style={styles.kicker}>YOUR COACH</Text>
            </View>
            {coachLoading
              ? <ActivityIndicator size="small" color={Colors.primary} style={{ alignSelf: 'flex-start' }} />
              : <Text style={{ color: Colors.text, fontSize: 15, lineHeight: 22 }}>{coachNote}</Text>}
          </View>
        )}

        {s.reps > 0 && (
          <View style={styles.metricRow}>
            <Metric label="AVG REP" value={`${(s.averageRepMs / 1000).toFixed(1)}s`} />
            <Metric label="LOWERING" value={`${(s.averageEccentricMs / 1000).toFixed(1)}s`} />
            <Metric label="DEPTH" value={`${Math.round(s.averagePeakDepth * 100)}%`} />
          </View>
        )}

        {s.topIssues.length > 0 && (
          <>
            <Text style={{ color: Colors.text, fontSize: 17, fontWeight: '800', marginBottom: 12 }}>
              Key corrections
            </Text>
            <View style={{ gap: 10, marginBottom: 32 }}>
              {s.topIssues.map((issue, i) => (
                <View key={i} style={[styles.issueRow, { borderLeftColor: i === 0 ? Colors.warning : Colors.info }]}>
                  <Ionicons name={i === 0 ? 'warning-outline' : 'bulb-outline'} size={18} color={i === 0 ? Colors.warning : Colors.info} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.issueText}>{issue.cue}</Text>
                    {issue.count > 1 && (
                      <Text style={{ color: Colors.muted, fontSize: 12, marginTop: 2 }}>
                        on {issue.count} of {s.reps} reps
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {s.topIssues.length === 0 && s.reps > 0 && (
          <View style={[styles.issueRow, { borderLeftColor: Colors.primary, marginBottom: 32 }]}>
            <Ionicons name="checkmark-circle-outline" size={18} color={Colors.primary} />
            <Text style={styles.issueText}>Clean session — no major form issues detected.</Text>
          </View>
        )}

        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.doneBtn}>
          <Text style={styles.doneBtnText}>Back to Workout</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── Live camera ──
  const blocking = isActive && poseMode && framing && framing.severity === 'blocking';

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
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
              {poseMode
                ? `For ${exerciseName.toLowerCase()}: ${coach.profile.framingTip} I'll tell you if I need you to move.`
                : 'Prop your phone where it can see you, and I\'ll tell you if I need anything different.'}
            </Text>

            <View style={{ marginTop: 18, marginBottom: 4 }}>
              <IntroTip icon="phone-portrait-outline" text={coach.profile.framingTip} />
              <IntroTip
                icon="resize-outline"
                text="Anywhere from about three feet to across the room works — you don't need a set distance."
              />
              <IntroTip
                icon="bulb-outline"
                text="Normal room light is fine. If it's too dark to track, I'll say so and offer the torch."
              />
              <IntroTip
                icon="lock-closed-outline"
                text="Everything runs on your phone. No video leaves the device."
              />
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
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        format={format}
        isActive={true}
        photo={!poseMode}
        torch={torchOn && device.hasTorch ? 'on' : 'off'}
        frameProcessor={coach.frameProcessor}
        outputOrientation="preview"
      />

      <View style={styles.topScrim} />
      <View style={styles.bottomScrim} />

      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => { stopSpeaking(); navigation.goBack(); }}
          style={styles.closeBtn}
        >
          <Ionicons name="close" size={18} color={Colors.text} />
          <Text style={{ color: Colors.text, fontSize: 15, fontWeight: '700' }}>Close</Text>
        </TouchableOpacity>

        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: Colors.text, fontSize: 15, fontWeight: '800' }}>{exerciseName}</Text>
          {isActive && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
              <View style={{
                width: 6, height: 6, borderRadius: 3,
                backgroundColor: blocking ? Colors.warning : Colors.primary,
              }} />
              <Text style={{
                color: blocking ? Colors.warning : Colors.primary,
                fontSize: 11, fontWeight: '700',
              }}>
                {blocking ? 'PAUSED' : 'LIVE'}
              </Text>
            </View>
          )}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          {device.hasTorch && (
            <TouchableOpacity onPress={() => setTorchOn(v => !v)} style={{ opacity: torchOn ? 1 : 0.45 }}>
              <Ionicons name="flashlight-outline" size={22} color={Colors.text} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => setCameraFacing(f => f === 'back' ? 'front' : 'back')}>
            <Ionicons name="sync-outline" size={24} color={Colors.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setVoiceEnabled(v => !v)} style={{ opacity: voiceEnabled ? 1 : 0.4 }}>
            <Ionicons name={voiceEnabled ? 'volume-high' : 'volume-mute'} size={22} color={Colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Form score badge */}
      {isActive && (
        <View style={[styles.badge, { top: 100, right: 20, borderColor: scoreColor(score ?? 0) }]}>
          <Text style={{ color: scoreColor(score ?? 0), fontSize: 20, fontWeight: '900', lineHeight: 22 }}>
            {score ?? '—'}
          </Text>
          <Text style={{ color: Colors.muted, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 }}>FORM</Text>
        </View>
      )}

      {/* Tracking status */}
      {isActive && (
        <View style={styles.statusPill}>
          {poseMode ? (
            <>
              <View style={{
                width: 7, height: 7, borderRadius: 4,
                backgroundColor: qualityColor(framing?.quality ?? 0),
              }} />
              <Text style={styles.statusText}>
                {framing?.severity === 'ok' ? 'TRACKING' : (framing?.code ?? 'STARTING').replace(/_/g, ' ').toUpperCase()}
              </Text>
            </>
          ) : (
            <>
              {isAnalyzing && <ActivityIndicator size="small" color={Colors.primary} />}
              <Text style={styles.statusText}>{snapStatus}</Text>
            </>
          )}
        </View>
      )}

      {/* Depth meter — shows the rep trajectory the counter is actually using */}
      {isActive && poseMode && !blocking && (
        <View style={styles.depthTrack}>
          <View style={[styles.depthFill, {
            height: `${Math.max(0, Math.min(100, coach.state.depth * 100))}%`,
          }]} />
        </View>
      )}

      {/* Framing coach — the blocking case gets the whole screen's attention */}
      {isActive && poseMode && blocking && framing && (
        <View style={styles.framingCard}>
          <Ionicons name="scan-outline" size={26} color={Colors.warning} />
          <Text style={styles.framingText}>{framing.message}</Text>
          {framing.suggestTorch && device.hasTorch && !torchOn && (
            <TouchableOpacity onPress={() => setTorchOn(true)} style={styles.torchBtn}>
              <Ionicons name="flashlight" size={16} color="#000" />
              <Text style={styles.torchBtnText}>Turn on torch</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Coaching cue bubble */}
      {!blocking && (
        <Animated.View style={[
          styles.cueBubble,
          {
            opacity: cueAnim,
            transform: [{ translateY: cueAnim.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }],
          },
        ]}>
          {visibleCue && (
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <Ionicons name="flash" size={16} color={Colors.primary} style={{ marginTop: 2 }} />
              <Text style={{ color: Colors.text, fontSize: 15, fontWeight: '600', lineHeight: 21, flex: 1 }}>
                {visibleCue}
              </Text>
            </View>
          )}
        </Animated.View>
      )}

      {/* Snapshot-mode live issue */}
      {isActive && !poseMode && snapIssue && !visibleCue && (
        <View style={[styles.cueBubble, { borderLeftColor: Colors.warning, opacity: 1 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <Ionicons name="warning-outline" size={16} color={Colors.warning} style={{ marginTop: 2 }} />
            <Text style={{ color: Colors.text, fontSize: 14, fontWeight: '600', lineHeight: 20, flex: 1 }}>
              {snapIssue}
            </Text>
          </View>
        </View>
      )}

      {/* Rep counter */}
      {isActive && (
        <View style={styles.repCenter}>
          <Text style={{ color: Colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: 2 }}>
            REPS
          </Text>
          <Text style={{ color: Colors.text, fontSize: 96, fontWeight: '900', lineHeight: 100 }}>{reps}</Text>
        </View>
      )}

      {/* Bottom controls */}
      <View style={styles.bottomControls}>
        {!isActive ? (
          <>
            {!poseMode && (
              <View style={styles.modeNotice}>
                <Ionicons
                  name={coach.poseStatus === 'loading' ? 'hourglass-outline' : 'information-circle-outline'}
                  size={15}
                  color={Colors.info}
                />
                <Text style={styles.modeNoticeText}>
                  {coach.poseStatus === 'loading'
                    ? 'Warming up on-device tracking…'
                    : coach.poseStatus === 'error'
                      ? `Basic mode — pose model didn't load. ${coach.poseDetail ?? ''}`.trim()
                      : 'Basic mode — update the app for live on-device tracking.'}
                </Text>
              </View>
            )}
            <TouchableOpacity onPress={startSession} style={styles.startBtn}>
              <Ionicons name="body-outline" size={22} color="#000" />
              <Text style={styles.startBtnText}>Start Form Coach</Text>
            </TouchableOpacity>
          </>
        ) : (
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={() => {
                  haptic.impact('light');
                  if (poseMode) coach.adjustReps(-1);
                  else {
                    snapRepsRef.current = Math.max(0, snapRepsRef.current - 1);
                    setSnapReps(snapRepsRef.current);
                  }
                }}
                style={[styles.repBtn, { flex: 1 }]}
              >
                <Text style={{ color: Colors.text, fontSize: 22, fontWeight: '300' }}>−</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  haptic.impact('light');
                  if (poseMode) coach.adjustReps(1);
                  else {
                    snapRepsRef.current += 1;
                    setSnapReps(snapRepsRef.current);
                    snapScoresRef.current.push(snapScore || 75);
                  }
                }}
                style={[styles.repBtn, { flex: 2, borderColor: Colors.primary, backgroundColor: Colors.primary + '22' }]}
              >
                <Text style={{ color: Colors.primary, fontSize: 15, fontWeight: '800' }}>+ Rep</Text>
              </TouchableOpacity>
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

// ── Small pieces ──────────────────────────────────────────────────────────

function IntroTip({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.introTipRow}>
      <View style={styles.introTipIconWrap}>
        <Ionicons name={icon} size={18} color={Colors.primary} />
      </View>
      <Text style={styles.introTipText}>{text}</Text>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricTile}>
      <Text style={{ color: Colors.text, fontSize: 20, fontWeight: '900' }}>{value}</Text>
      <Text style={{ color: Colors.muted, fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginTop: 2 }}>
        {label}
      </Text>
    </View>
  );
}

function qualityColor(q: number) {
  if (q >= 0.6) return Colors.primary;
  if (q >= 0.3) return Colors.warning;
  return Colors.danger;
}

function emptySummary(exerciseName: string): SessionSummary {
  return {
    exerciseName,
    profileId: 'generic',
    reps: 0,
    averageScore: 0,
    topIssues: [],
    averageRepMs: 0,
    averageEccentricMs: 0,
    averagePeakDepth: 0,
    trackingQuality: 0,
    repScores: [],
  };
}

/** Shape the legacy snapshot path's numbers like a pose summary. */
function snapshotSummary(
  exerciseName: string,
  reps: number,
  scores: number[],
  issues: string[]
): SessionSummary {
  const counts = new Map<string, number>();
  for (const issue of issues) counts.set(issue, (counts.get(issue) ?? 0) + 1);
  return {
    exerciseName,
    profileId: 'snapshot',
    reps,
    averageScore: scores.length
      ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length)
      : 0,
    topIssues: [...counts.entries()]
      .map(([cue, count]) => ({ cue, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3),
    averageRepMs: 0,
    averageEccentricMs: 0,
    averagePeakDepth: 0,
    // Snapshot mode has no keypoint confidence to report.
    trackingQuality: 0,
    repScores: [...scores],
  };
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

  kicker: { color: Colors.muted, fontSize: 12, fontWeight: '600', letterSpacing: 1, marginBottom: 8 },

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
  statusPill: {
    position: 'absolute', top: 100, left: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6,
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  statusText: { color: Colors.primary, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },

  depthTrack: {
    position: 'absolute', left: 20, top: 150, bottom: 240,
    width: 5, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.14)',
    justifyContent: 'flex-start',
  },
  depthFill: {
    width: 5, borderRadius: 3, backgroundColor: Colors.primary,
  },

  framingCard: {
    position: 'absolute', top: 160, left: 24, right: 24,
    backgroundColor: 'rgba(10,10,10,0.94)',
    borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: Colors.warning + '66',
    alignItems: 'center', gap: 10,
  },
  framingText: {
    color: Colors.text, fontSize: 16, fontWeight: '700',
    textAlign: 'center', lineHeight: 22,
  },
  torchBtn: {
    marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.primary, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 9,
  },
  torchBtnText: { color: '#000', fontWeight: '800', fontSize: 14 },

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
  modeNotice: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 9, marginBottom: 12,
  },
  modeNoticeText: { color: Colors.textSecondary, fontSize: 12, flex: 1 },
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
  sparkRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 3,
    marginTop: 14, height: 34,
  },
  coachCard: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: Colors.primary + '33', marginBottom: 24,
  },
  metricRow: { flexDirection: 'row', gap: 10, marginBottom: 28 },
  metricTile: {
    flex: 1, backgroundColor: Colors.surface2, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  issueRow: {
    backgroundColor: Colors.surface2, borderRadius: 12,
    padding: 14, borderLeftWidth: 3,
    flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 8,
  },
  issueText: { color: Colors.text, fontSize: 14, flex: 1, lineHeight: 20 },
  doneBtn:    { backgroundColor: Colors.primary, borderRadius: 14, padding: 18, alignItems: 'center' },
  doneBtnText: { color: '#000', fontWeight: '800', fontSize: 16 },

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
