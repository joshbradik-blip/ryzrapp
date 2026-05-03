import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TodayStackParamList } from '../../types';
import { Colors } from '../../constants/theme';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { analyzeFormFromImage, FormAnalysis } from '../../lib/anthropic';

type Props = NativeStackScreenProps<TodayStackParamList, 'FormCoach'>;

const MID_SET_PHRASES = [
  'Nice set! Keep that form tight.',
  'You have one more rep in you — push it.',
  'Looking strong, stay controlled.',
  'That's it — own every rep.',
  'Breathe and grind.',
  'Strong work, keep the tension.',
  'You're not done yet — finish it.',
  'This is where champions are made.',
];

const SET_COMPLETE_PHRASES = [
  'Great set — rest up and come back stronger.',
  'That\'s a wrap. Solid work.',
  'Set complete. You earned that rest.',
  'Good grind. Recovery starts now.',
  'Done. Log it and lock it in.',
];

function randomPhrase(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

const ANALYSIS_INTERVAL_MS = 6000; // analyze every 6 seconds — balances feedback vs API cost

function scoreColor(score: number): string {
  if (score >= 80) return Colors.primary;
  if (score >= 60) return Colors.warning;
  return Colors.danger;
}

export function FormCoachScreen({ navigation, route }: Props) {
  const { exerciseName } = route.params;
  const [permission, requestPermission] = useCameraPermissions();

  // Session state
  const [isActive, setIsActive] = useState(false);
  const [repCount, setRepCount] = useState(0);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [showSummary, setShowSummary] = useState(false);

  // Analysis state
  const [analyzing, setAnalyzing] = useState(false);
  const [latestAnalysis, setLatestAnalysis] = useState<FormAnalysis | null>(null);
  const [sessionFeedback, setSessionFeedback] = useState<FormAnalysis[]>([]);
  const [analysisError, setAnalysisError] = useState(false);

  const cameraRef = useRef<CameraView>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const feedbackAnim = useRef(new Animated.Value(0)).current;
  const isAnalyzing = useRef(false); // guard against overlapping requests

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      Speech.stop();
    };
  }, []);

  const runAnalysis = useCallback(async (reps: number) => {
    if (isAnalyzing.current || !cameraRef.current) return;
    isAnalyzing.current = true;
    setAnalyzing(true);
    setAnalysisError(false);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.2,
        skipProcessing: true,
      });

      if (!photo?.base64) throw new Error('No image captured');

      const result = await analyzeFormFromImage(exerciseName, photo.base64, reps);
      setLatestAnalysis(result);
      setSessionFeedback((prev) => [...prev, result]);

      // Animate feedback bubble in
      Animated.sequence([
        Animated.timing(feedbackAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.delay(4500),
        Animated.timing(feedbackAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();

      // Speak the cue
      if (voiceEnabled) {
        Speech.stop();
        Speech.speak(result.cue, { rate: 0.88, pitch: 1.0 });
      }

      Haptics.impactAsync(
        result.isGoodForm
          ? Haptics.ImpactFeedbackStyle.Light
          : Haptics.ImpactFeedbackStyle.Medium
      );
    } catch {
      setAnalysisError(true);
    } finally {
      setAnalyzing(false);
      isAnalyzing.current = false;
    }
  }, [exerciseName, voiceEnabled, feedbackAnim]);

  const startCoaching = () => {
    setIsActive(true);
    // First analysis immediately, then every ANALYSIS_INTERVAL_MS
    runAnalysis(0);
    intervalRef.current = setInterval(() => {
      setRepCount((r) => {
        runAnalysis(r);
        return r;
      });
    }, ANALYSIS_INTERVAL_MS);
  };

  const endSet = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    Speech.stop();
    setIsActive(false);
    setShowSummary(true);
    if (voiceEnabled) {
      setTimeout(() => Speech.speak(randomPhrase(SET_COMPLETE_PHRASES), { rate: 0.88 }), 300);
    }
  };

  const avgScore = sessionFeedback.length > 0
    ? Math.round(sessionFeedback.reduce((sum, f) => sum + f.score, 0) / sessionFeedback.length)
    : 0;

  // ── Permission gate ────────────────────────────────────────────────────────
  if (!permission) return <View style={{ flex: 1, backgroundColor: Colors.background }} />;

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Ionicons name="camera-outline" size={48} color={Colors.primary} style={{ marginBottom: 20 }} />
        <Text style={styles.permTitle}>Camera access needed</Text>
        <Text style={styles.permBody}>
          Form Coach uses your camera to analyze technique in real time. Video never leaves your device — only still frames are sent for analysis.
        </Text>
        <TouchableOpacity onPress={requestPermission} style={styles.permBtn}>
          <Text style={styles.permBtnText}>Allow Camera</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 16 }}>
          <Text style={{ color: Colors.muted, fontSize: 15 }}>Not now</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Summary screen ─────────────────────────────────────────────────────────
  if (showSummary) {
    const issues = sessionFeedback
      .filter((f) => f.primaryIssue)
      .map((f) => f.primaryIssue as string)
      .filter((v, i, arr) => arr.indexOf(v) === i) // deduplicate
      .slice(0, 3);

    return (
      <ScrollView style={{ flex: 1, backgroundColor: Colors.background }} contentContainerStyle={{ padding: 32, paddingBottom: 60 }}>
        <Text style={{ color: Colors.muted, fontSize: 12, fontWeight: '600', letterSpacing: 1, marginBottom: 8 }}>SET COMPLETE</Text>
        <Text style={{ color: Colors.text, fontSize: 28, fontWeight: '900', marginBottom: 4 }}>{exerciseName}</Text>
        <Text style={{ color: Colors.textSecondary, fontSize: 16, marginBottom: 32 }}>
          {repCount} rep{repCount !== 1 ? 's' : ''} · {sessionFeedback.length} form check{sessionFeedback.length !== 1 ? 's' : ''}
        </Text>

        {/* Score ring */}
        <View style={[styles.scoreCard, { borderColor: scoreColor(avgScore) + '55' }]}>
          <Text style={{ color: Colors.muted, fontSize: 12, fontWeight: '600', letterSpacing: 0.5, marginBottom: 8 }}>AVERAGE FORM SCORE</Text>
          <Text style={{ color: scoreColor(avgScore), fontSize: 64, fontWeight: '900', lineHeight: 70 }}>{avgScore}</Text>
          <Text style={{ color: Colors.textSecondary, fontSize: 14, marginTop: 4 }}>
            {avgScore >= 80 ? 'Excellent form — keep it up' : avgScore >= 60 ? 'Good effort — a few things to tighten up' : 'Focus on technique before adding load'}
          </Text>
        </View>

        {/* Issues */}
        {issues.length > 0 && (
          <>
            <Text style={{ color: Colors.text, fontSize: 17, fontWeight: '800', marginBottom: 12, marginTop: 8 }}>
              Key corrections
            </Text>
            <View style={{ gap: 10, marginBottom: 32 }}>
              {issues.map((issue, i) => (
                <View key={i} style={[styles.issueRow, { borderLeftColor: i === 0 ? Colors.warning : Colors.info }]}>
                  <Ionicons name={i === 0 ? 'warning-outline' : 'bulb-outline'} size={18} color={i === 0 ? Colors.warning : Colors.info} />
                  <Text style={{ color: Colors.text, fontSize: 14, flex: 1, lineHeight: 20 }}>{issue}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {issues.length === 0 && sessionFeedback.length > 0 && (
          <View style={[styles.issueRow, { borderLeftColor: Colors.primary, marginBottom: 32 }]}>
            <Ionicons name="checkmark-circle-outline" size={18} color={Colors.primary} />
            <Text style={{ color: Colors.text, fontSize: 14, flex: 1, lineHeight: 20 }}>
              Solid session — no major form issues detected.
            </Text>
          </View>
        )}

        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.doneBtn}>
          <Text style={styles.doneBtnText}>Back to Workout</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── Main camera screen ─────────────────────────────────────────────────────
  const currentScore = latestAnalysis?.score ?? null;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="front">

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

          <TouchableOpacity onPress={() => setVoiceEnabled((v) => !v)} style={{ opacity: voiceEnabled ? 1 : 0.4 }}>
            <Ionicons name={voiceEnabled ? 'volume-high' : 'volume-mute'} size={22} color={Colors.text} />
          </TouchableOpacity>
        </View>

        {/* Score badge — top right when active */}
        {currentScore !== null && (
          <View style={[styles.scoreBadge, { borderColor: scoreColor(currentScore) }]}>
            <Text style={{ color: scoreColor(currentScore), fontSize: 22, fontWeight: '900', lineHeight: 24 }}>
              {currentScore}
            </Text>
            <Text style={{ color: Colors.muted, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 }}>FORM</Text>
          </View>
        )}

        {/* Analyzing indicator */}
        {analyzing && (
          <View style={styles.analyzingBadge}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={{ color: Colors.primary, fontSize: 12, fontWeight: '700' }}>Analyzing…</Text>
          </View>
        )}

        {/* Feedback bubble */}
        <Animated.View style={[
          styles.feedbackBubble,
          {
            opacity: feedbackAnim,
            transform: [{ translateY: feedbackAnim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }],
          },
        ]}>
          {latestAnalysis && (
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <Ionicons
                name={latestAnalysis.isGoodForm ? 'checkmark-circle' : 'flash'}
                size={16}
                color={latestAnalysis.isGoodForm ? Colors.primary : Colors.warning}
                style={{ marginTop: 2 }}
              />
              <Text style={{ color: Colors.text, fontSize: 15, fontWeight: '600', lineHeight: 20, flex: 1 }}>
                {latestAnalysis.cue}
              </Text>
            </View>
          )}
        </Animated.View>

        {/* Rep counter — center */}
        {isActive && (
          <View style={styles.repCenter}>
            <Text style={{ color: Colors.muted, fontSize: 12, fontWeight: '600', letterSpacing: 1, marginBottom: 4 }}>REPS</Text>
            <Text style={{ color: Colors.text, fontSize: 88, fontWeight: '900', lineHeight: 90 }}>{repCount}</Text>
          </View>
        )}

        {/* Bottom controls */}
        <View style={styles.bottomControls}>
          {!isActive ? (
            <TouchableOpacity onPress={startCoaching} style={styles.startBtn}>
              <Ionicons name="videocam" size={20} color="#000" />
              <Text style={styles.startBtnText}>Start Set</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ gap: 12 }}>
              {/* Rep +/- */}
              <View style={styles.repRow}>
                <TouchableOpacity
                  onPress={() => setRepCount((r) => Math.max(0, r - 1))}
                  style={styles.repBtn}
                >
                  <Text style={{ color: Colors.text, fontSize: 26, fontWeight: '300' }}>−</Text>
                </TouchableOpacity>
                <Text style={{ color: Colors.text, fontSize: 15, fontWeight: '700', flex: 1, textAlign: 'center' }}>
                  Tap to count reps
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setRepCount((r) => {
                      const next = r + 1;
                      if (voiceEnabled && next > 0 && next % 5 === 0) {
                        Speech.stop();
                        Speech.speak(randomPhrase(MID_SET_PHRASES), { rate: 0.88 });
                      }
                      return next;
                    });
                  }}
                  style={[styles.repBtn, { backgroundColor: Colors.primary + '33', borderColor: Colors.primary }]}
                >
                  <Text style={{ color: Colors.primary, fontSize: 26, fontWeight: '300' }}>+</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity onPress={endSet} style={styles.endBtn}>
                <Text style={styles.endBtnText}>End Set — View Summary</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1, backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center', padding: 32,
  },
  permTitle: { color: Colors.text, fontSize: 22, fontWeight: '900', textAlign: 'center', marginBottom: 12 },
  permBody: { color: Colors.textSecondary, fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  permBtn: { backgroundColor: Colors.primary, paddingHorizontal: 32, paddingVertical: 16, borderRadius: 12 },
  permBtnText: { color: '#000', fontWeight: '800', fontSize: 16 },
  topScrim: { position: 'absolute', top: 0, left: 0, right: 0, height: 120, backgroundColor: 'rgba(0,0,0,0.65)' },
  bottomScrim: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 200, backgroundColor: 'rgba(0,0,0,0.72)' },
  header: {
    position: 'absolute', top: 0, left: 0, right: 0,
    padding: 20, paddingTop: 52,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  closeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
  },
  scoreBadge: {
    position: 'absolute', top: 100, right: 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 12, borderWidth: 1.5,
    paddingHorizontal: 12, paddingVertical: 8,
    alignItems: 'center',
  },
  analyzingBadge: {
    position: 'absolute', top: 100, left: 20,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6,
  },
  feedbackBubble: {
    position: 'absolute', top: 155, left: 20, right: 20,
    backgroundColor: 'rgba(10,10,10,0.88)',
    borderRadius: 14, padding: 14,
    borderLeftWidth: 3, borderLeftColor: Colors.warning,
  },
  repCenter: {
    position: 'absolute', top: 0, bottom: 200, left: 0, right: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  bottomControls: { position: 'absolute', bottom: 44, left: 24, right: 24 },
  startBtn: {
    backgroundColor: Colors.primary, borderRadius: 14,
    padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  startBtnText: { color: '#000', fontWeight: '900', fontSize: 18 },
  repRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  repBtn: {
    width: 52, height: 52, borderRadius: 14,
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
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
  },
  doneBtn: { backgroundColor: Colors.primary, borderRadius: 14, padding: 18, alignItems: 'center' },
  doneBtnText: { color: '#000', fontWeight: '800', fontSize: 16 },
});
