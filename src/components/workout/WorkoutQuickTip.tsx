import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/theme';
import { useAuthStore } from '../../store/authStore';
import { SectionLabel } from '../ui/SectionLabel';

export function useWorkoutQuickTip(kind: 'log-set' | 'swap' | 'ask-coach' | 'hold-timer') {
  const userId = useAuthStore((state) => state.session?.user.id);
  const storageKey = userId ? `ryzr-workout-tip:v1:${userId}:${kind}` : null;
  const [visibleKey, setVisibleKey] = useState<string | null>(null);
  const dismissedKeys = useRef(new Set<string>());

  useEffect(() => {
    if (!storageKey || dismissedKeys.current.has(storageKey)) return;
    let cancelled = false;
    AsyncStorage.getItem(storageKey).then((seen) => {
      // The user may try the feature before storage has loaded.
      if (!cancelled && seen === null && !dismissedKeys.current.has(storageKey)) {
        setVisibleKey(storageKey);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [storageKey]);

  const dismiss = useCallback(() => {
    if (!storageKey || dismissedKeys.current.has(storageKey)) return;
    dismissedKeys.current.add(storageKey);
    setVisibleKey(null);
    void AsyncStorage.setItem(storageKey, '1').catch(() => {});
  }, [storageKey]);

  return { show: storageKey !== null && visibleKey === storageKey, dismiss };
}

export function WorkoutQuickTip({ message, onDismiss }: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: Colors.surface,
      borderColor: Colors.primary + '44',
      borderWidth: 1,
      borderRadius: 12,
      padding: 10,
      marginBottom: 12,
    }}>
      <Ionicons name="bulb-outline" size={18} color={Colors.primary} />
      <View style={{ flex: 1, gap: 2 }}>
        <SectionLabel>Quick tip</SectionLabel>
        <Text style={{ color: Colors.textSecondary, fontSize: 13, lineHeight: 18 }}>{message}</Text>
      </View>
      <TouchableOpacity
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Got it, dismiss quick tip"
        style={{ minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 }}
      >
        <Text style={{ color: Colors.primary, fontSize: 13, fontWeight: '700' }}>Got it</Text>
      </TouchableOpacity>
    </View>
  );
}
