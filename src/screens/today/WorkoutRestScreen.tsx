import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GradientButton } from '../../components/ui/GradientButton';
import { SectionLabel } from '../../components/ui/SectionLabel';
import { BorderRadius, Colors, Spacing } from '../../constants/theme';
import { haptic } from '../../lib/feedback';
import { cancelNotification, scheduleRestOverNotification } from '../../lib/notifications';

interface Props {
  durationSeconds: number;
  exerciseName: string;
  nextSet: number;
  effortLabel?: string;
  onDone: () => void;
}

function secondsUntil(deadline: number) {
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}

export function WorkoutRestScreen({ durationSeconds, exerciseName, nextSet, effortLabel = 'Set', onDone }: Props) {
  const [deadline, setDeadline] = useState(() => Date.now() + durationSeconds * 1000);
  const [remaining, setRemaining] = useState(durationSeconds);
  const deadlineRef = useRef(deadline);
  const remainingRef = useRef(durationSeconds);
  const finishedRef = useRef(false);
  const notificationTask = useRef(Promise.resolve());

  const finish = useCallback((expired: boolean) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (expired) haptic.success();
    onDone();
  }, [onDone]);

  useEffect(() => {
    const tick = () => {
      if (finishedRef.current) return;
      const seconds = secondsUntil(deadlineRef.current);
      if (seconds === 0) {
        finish(true);
        return;
      }
      if (seconds <= 4 && seconds < remainingRef.current) haptic.impact('light');
      remainingRef.current = seconds;
      setRemaining(seconds);
    };

    const timer = setInterval(() => {
      if (AppState.currentState === 'active') tick();
    }, 500);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick();
    });

    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [finish]);

  useEffect(() => {
    let active = true;
    let notificationId: string | null = null;
    notificationTask.current = notificationTask.current.then(async () => {
      const seconds = secondsUntil(deadline);
      if (!active || finishedRef.current || seconds === 0) return;
      notificationId = await scheduleRestOverNotification(seconds, exerciseName, nextSet);
    });

    return () => {
      active = false;
      // Wait for any in-flight schedule, then cancel it before scheduling its replacement.
      notificationTask.current = notificationTask.current.then(() => cancelNotification(notificationId));
    };
  }, [deadline, exerciseName, nextSet]);

  const adjust = (seconds: number) => {
    if (finishedRef.current) return;
    const nextDeadline = deadlineRef.current + seconds * 1000;
    const nextRemaining = secondsUntil(nextDeadline);
    if (secondsUntil(deadlineRef.current) === 0 || nextRemaining === 0) {
      finish(true);
      return;
    }
    deadlineRef.current = nextDeadline;
    remainingRef.current = nextRemaining;
    setDeadline(nextDeadline);
    setRemaining(nextRemaining);
  };

  const skip = () => finish(false);
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  return (
    <Modal presentationStyle="fullScreen" animationType="fade" onRequestClose={skip}>
      <SafeAreaView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.timer}>
            <SectionLabel>Rest</SectionLabel>
            <Text
              accessibilityRole="timer"
              accessibilityLabel={`${minutes} minutes and ${seconds} seconds remaining`}
              numberOfLines={1}
              adjustsFontSizeToFit
              style={styles.clock}
            >
              {minutes}:{String(seconds).padStart(2, '0')}
            </Text>
            <View style={styles.adjustments}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Subtract 15 seconds"
                onPress={() => adjust(-15)}
                style={styles.adjustment}
              >
                <Text style={styles.adjustmentText}>−15 sec</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Add 15 seconds"
                onPress={() => adjust(15)}
                style={styles.adjustment}
              >
                <Text style={styles.adjustmentText}>+15 sec</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.footer}>
            <View style={styles.upNext}>
              <SectionLabel>Up next</SectionLabel>
              <Text style={styles.exercise}>{exerciseName}</Text>
              <Text style={styles.set}>{effortLabel} {nextSet}</Text>
            </View>
            <GradientButton title="Skip Rest" icon="arrow-forward" onPress={skip} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { flexGrow: 1, padding: Spacing.lg, gap: Spacing.xl },
  timer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, paddingVertical: Spacing.xl },
  clock: { width: '100%', textAlign: 'center', color: Colors.text, fontSize: 88, fontWeight: '900', fontVariant: ['tabular-nums'] },
  adjustments: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Spacing.sm },
  adjustment: { minHeight: 52, justifyContent: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  adjustmentText: { color: Colors.text, fontSize: 16, fontWeight: '700' },
  footer: { gap: Spacing.lg },
  upNext: { gap: Spacing.xs, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border },
  exercise: { color: Colors.text, fontSize: 24, fontWeight: '800' },
  set: { color: Colors.textSecondary, fontSize: 16 },
});
