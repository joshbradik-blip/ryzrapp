import React, { useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { Colors } from '../../constants/theme';
import { Button } from '../ui/Button';
import { GradientButton } from '../ui/GradientButton';
import { elapsedSeconds } from '../../lib/timedExercise';
import { haptic } from '../../lib/feedback';

export function HoldTimer({ target, disabled, onComplete, isHold = true }: { isHold?: boolean; target: number; disabled: boolean; onComplete: (seconds: number) => void }) {
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const accumulatedMilliseconds = useRef(0);
  const startedAt = useRef(0);
  const announced = useRef(false);
  const saved = useRef(false);
  const read = () => elapsedSeconds(startedAt.current, accumulatedMilliseconds.current, Date.now());

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const value = read();
      setSeconds(value);
      if (value >= target && !announced.current) {
        announced.current = true;
        haptic.success();
      }
    };
    const interval = setInterval(tick, 250);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') tick(); });
    return () => { clearInterval(interval); subscription.remove(); };
  }, [running, target]);

  const pause = () => {
    accumulatedMilliseconds.current += Math.max(0, Date.now() - startedAt.current);
    setSeconds(Math.floor(accumulatedMilliseconds.current / 1000));
    setRunning(false);
  };
  return (
    <View style={{ gap: 12, marginBottom: 16, padding: 20, borderRadius: 16, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border }}>
      <Text style={{ color: Colors.primary, textAlign: 'center', fontWeight: '800' }}>{isHold ? 'HOLD' : 'INTERVAL'} TIMER · TARGET {target}s</Text>
      <Text accessibilityRole="timer" style={{ color: Colors.text, textAlign: 'center', fontSize: 52, fontWeight: '900', fontVariant: ['tabular-nums'] }}>
        {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
      </Text>
      <GradientButton title={running ? 'Pause Timer' : seconds ? 'Resume Timer' : 'Start Timer'} icon="timer-outline" disabled={disabled} onPress={() => {
        if (running) pause();
        else { startedAt.current = Date.now(); setRunning(true); }
      }} />
      <Button title={isHold ? "Complete Hold" : "Complete Interval"} disabled={disabled || seconds < 1} onPress={() => {
        if (saved.current) return;
        saved.current = true;
        const duration = running ? read() : seconds;
        setRunning(false);
        onComplete(duration);
      }} />
      <Button title="Reset Timer" variant="secondary" disabled={disabled || (!seconds && !running)} onPress={() => {
        setRunning(false); setSeconds(0); accumulatedMilliseconds.current = 0; announced.current = false;
      }} />
    </View>
  );
}
