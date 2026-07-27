import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/theme';
import { EnergyBalance } from '../../lib/nutrition';
import { SectionLabel } from '../ui/SectionLabel';

interface Props {
  balance: EnergyBalance;
  goalCategory?: string;
}

function Bar({ label, value, color, pct }: { label: string; value: number; color: string; pct: number }) {
  return (
    <View style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={{ color: Colors.textSecondary, fontSize: 12, fontWeight: '700' }}>{label}</Text>
        <Text style={{ color: Colors.text, fontSize: 12, fontWeight: '800' }}>{value.toLocaleString()} kcal</Text>
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: Colors.surface3, overflow: 'hidden' }}>
        <View style={{ width: `${Math.max(2, pct)}%`, height: 8, borderRadius: 4, backgroundColor: color }} />
      </View>
    </View>
  );
}

/**
 * "In vs Out" for the day: food logged against real calories burned (BMR +
 * wearable active calories, or an estimate when no wearable is connected).
 * The deficit/surplus read-out is framed against the user's goal.
 */
export function EnergyBalanceCard({ balance, goalCategory }: Props) {
  const { caloriesIn, caloriesOut, net, bmr, activeCalories, usedWearable } = balance;
  const max = Math.max(caloriesIn, caloriesOut, 1);
  const deficit = net < 0;
  const magnitude = Math.abs(net);
  const nearMaintenance = magnitude < 100;

  // Goal-aware, non-judgemental descriptor.
  let descriptor = deficit ? 'Calorie deficit' : 'Calorie surplus';
  let tone = deficit ? Colors.success : Colors.info;
  if (nearMaintenance) {
    descriptor = 'Around maintenance';
    tone = Colors.textSecondary;
  } else if (goalCategory === 'lose_fat') {
    descriptor = deficit ? 'On track for fat loss' : 'Over your burn today';
    tone = deficit ? Colors.success : Colors.warning;
  } else if (goalCategory === 'build_muscle') {
    descriptor = deficit ? 'Under your burn — fuel up to build' : 'Fueling muscle growth';
    tone = deficit ? Colors.warning : Colors.success;
  }

  return (
    <View style={{ marginHorizontal: 24, marginTop: 16, backgroundColor: Colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <SectionLabel>Energy Balance</SectionLabel>
        <Ionicons name="swap-vertical" size={13} color={Colors.primary} />
      </View>

      <Bar label="In (food)" value={caloriesIn} color={Colors.primary} pct={(caloriesIn / max) * 100} />
      <Bar label="Out (burn)" value={caloriesOut} color={Colors.info} pct={(caloriesOut / max) * 100} />

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name={deficit ? 'trending-down' : 'trending-up'} size={16} color={tone} />
          <Text style={{ color: tone, fontSize: 14, fontWeight: '800' }}>{descriptor}</Text>
        </View>
        <Text style={{ color: Colors.text, fontSize: 16, fontWeight: '900' }}>
          {net > 0 ? '+' : ''}{net.toLocaleString()} kcal
        </Text>
      </View>

      <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 12, lineHeight: 16 }}>
        {usedWearable
          ? `Burn = ${bmr.toLocaleString()} resting + ${(activeCalories ?? 0).toLocaleString()} active from your wearable.`
          : `Burn is estimated from your profile — connect a wearable in Profile → Wearables for your real active calories.`}
      </Text>
    </View>
  );
}
