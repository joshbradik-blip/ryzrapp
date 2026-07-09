import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/theme';
import { SectionLabel } from '../ui/SectionLabel';
import { JointRiskSignal } from '../../lib/injuryRisk';

const LEVEL_META = {
  elevated: { color: Colors.danger, word: 'Elevated risk' },
  moderate: { color: Colors.warning, word: 'Worth watching' },
} as const;

interface Props {
  signals: JointRiskSignal[];
}

export function InjuryRiskCard({ signals }: Props) {
  if (signals.length === 0) return null;
  const top = signals[0];
  const meta = LEVEL_META[top.riskLevel as 'elevated' | 'moderate'];

  return (
    <View style={{
      marginHorizontal: 24,
      marginTop: 16,
      backgroundColor: Colors.surface,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: meta.color + '55',
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <SectionLabel>Injury Risk Watch</SectionLabel>
        <Ionicons name="shield-half-outline" size={14} color={meta.color} />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: meta.color }} />
        <Text style={{ color: meta.color, fontSize: 15, fontWeight: '900' }}>
          {top.label}: {meta.word}
        </Text>
      </View>

      {top.reasons.map((r, i) => (
        <Text key={i} style={{ color: Colors.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: 3 }}>
          • {r}
        </Text>
      ))}

      <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 10, lineHeight: 15 }}>
        A trend from your logged training and recovery, not a diagnosis — ask your coach if you want it to ease off.
      </Text>
    </View>
  );
}
