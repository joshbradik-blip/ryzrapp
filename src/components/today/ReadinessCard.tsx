import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/theme';
import { SectionLabel } from '../ui/SectionLabel';
import { ReadinessResult } from '../../lib/readiness';

const LEVEL_META = {
  high: { color: Colors.success, word: 'Primed', line: 'Great day to push — go earn it.' },
  moderate: { color: Colors.warning, word: 'Steady', line: 'Train as planned, progress smart.' },
  low: { color: Colors.danger, word: 'Run down', line: 'Go lighter today — recovery is training too.' },
} as const;

const FACTOR_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  hrv: 'pulse',
  resting_hr: 'heart',
  sleep: 'moon',
};

interface Props {
  readiness: ReadinessResult;
  isPremium: boolean;
}

export function ReadinessCard({ readiness, isPremium }: Props) {
  const meta = LEVEL_META[readiness.level];

  return (
    <View style={{
      marginHorizontal: 24,
      marginTop: 16,
      backgroundColor: Colors.surface,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: Colors.border,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <SectionLabel>Recovery Readiness</SectionLabel>
        <Ionicons name="watch-outline" size={14} color={Colors.muted} />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        {/* Score ring */}
        <View style={{
          width: 72, height: 72, borderRadius: 36,
          borderWidth: 5, borderColor: meta.color,
          alignItems: 'center', justifyContent: 'center',
          backgroundColor: meta.color + '11',
        }}>
          <Text style={{ color: Colors.text, fontSize: 24, fontWeight: '900' }}>{readiness.score}</Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text style={{ color: meta.color, fontSize: 17, fontWeight: '900' }}>{meta.word}</Text>
          <Text style={{ color: Colors.textSecondary, fontSize: 13, marginTop: 2, lineHeight: 18 }}>
            {meta.line}
          </Text>
        </View>
      </View>

      {/* Factors */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
        {readiness.factors.map((f) => (
          <View key={f.metric} style={{
            flexDirection: 'row', alignItems: 'center', gap: 6,
            backgroundColor: Colors.surface2, borderRadius: 10,
            paddingHorizontal: 10, paddingVertical: 7,
          }}>
            <Ionicons
              name={FACTOR_ICONS[f.metric] ?? 'ellipse'}
              size={13}
              color={f.positive ? Colors.success : Colors.warning}
            />
            <Text style={{ color: Colors.textSecondary, fontSize: 12, fontWeight: '600' }}>
              {f.label} {f.detail}
            </Text>
          </View>
        ))}
      </View>

      <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 12, lineHeight: 15 }}>
        {isPremium
          ? 'Your AI coach adjusts today\'s plan and challenges to this.'
          : 'Premium: your AI coach adapts workouts to your recovery.'}
      </Text>
    </View>
  );
}
