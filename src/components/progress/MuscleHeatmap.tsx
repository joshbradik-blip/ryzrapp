import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Rect, Circle, Ellipse } from 'react-native-svg';
import { HeatLevel } from '../../lib/historyMetrics';
import { Colors } from '../../constants/theme';

interface Props {
  heat: Record<string, HeatLevel>;
}

const LEVEL_FILL: Record<HeatLevel, string> = {
  high: '#FF6B22',
  moderate: '#FF6B2288',
  low: '#FF6B2240',
  none: Colors.surface3,
};

const STRUCT = Colors.surface3;

export function MuscleHeatmap({ heat }: Props) {
  const f = (name: string) => LEVEL_FILL[heat[name] ?? 'none'];
  const empty = Object.keys(heat).length === 0;

  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
        {/* FRONT */}
        <View style={{ alignItems: 'center' }}>
          <Svg width={120} height={260} viewBox="0 0 120 260">
            <Circle cx={60} cy={20} r={12} fill={STRUCT} />
            {/* deltoids */}
            <Ellipse cx={34} cy={52} rx={11} ry={13} fill={f('Deltoids')} />
            <Ellipse cx={86} cy={52} rx={11} ry={13} fill={f('Deltoids')} />
            {/* chest */}
            <Rect x={40} y={42} width={40} height={26} rx={6} fill={f('Chest')} />
            {/* biceps */}
            <Rect x={20} y={56} width={13} height={40} rx={6} fill={f('Biceps')} />
            <Rect x={87} y={56} width={13} height={40} rx={6} fill={f('Biceps')} />
            {/* forearms (structural) */}
            <Rect x={18} y={98} width={12} height={36} rx={6} fill={STRUCT} />
            <Rect x={90} y={98} width={12} height={36} rx={6} fill={STRUCT} />
            {/* core */}
            <Rect x={46} y={72} width={28} height={42} rx={6} fill={f('Core')} />
            {/* quads */}
            <Rect x={42} y={120} width={16} height={62} rx={7} fill={f('Quadriceps')} />
            <Rect x={62} y={120} width={16} height={62} rx={7} fill={f('Quadriceps')} />
            {/* calves */}
            <Rect x={44} y={186} width={13} height={46} rx={6} fill={f('Calves')} />
            <Rect x={63} y={186} width={13} height={46} rx={6} fill={f('Calves')} />
          </Svg>
          <Text style={{ color: Colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>FRONT</Text>
        </View>

        {/* BACK */}
        <View style={{ alignItems: 'center' }}>
          <Svg width={120} height={260} viewBox="0 0 120 260">
            <Circle cx={60} cy={20} r={12} fill={STRUCT} />
            {/* traps */}
            <Rect x={42} y={38} width={36} height={16} rx={6} fill={f('Traps')} />
            {/* deltoids (rear) */}
            <Ellipse cx={34} cy={54} rx={11} ry={13} fill={f('Deltoids')} />
            <Ellipse cx={86} cy={54} rx={11} ry={13} fill={f('Deltoids')} />
            {/* lats */}
            <Rect x={38} y={56} width={16} height={34} rx={6} fill={f('Lats')} />
            <Rect x={66} y={56} width={16} height={34} rx={6} fill={f('Lats')} />
            {/* erectors (spine) */}
            <Rect x={54} y={56} width={12} height={48} rx={5} fill={f('Erectors')} />
            {/* triceps */}
            <Rect x={20} y={56} width={13} height={40} rx={6} fill={f('Triceps')} />
            <Rect x={87} y={56} width={13} height={40} rx={6} fill={f('Triceps')} />
            {/* forearms (structural) */}
            <Rect x={18} y={98} width={12} height={36} rx={6} fill={STRUCT} />
            <Rect x={90} y={98} width={12} height={36} rx={6} fill={STRUCT} />
            {/* glutes */}
            <Rect x={42} y={106} width={36} height={22} rx={7} fill={f('Glutes')} />
            {/* hamstrings */}
            <Rect x={42} y={130} width={16} height={52} rx={7} fill={f('Hamstrings')} />
            <Rect x={62} y={130} width={16} height={52} rx={7} fill={f('Hamstrings')} />
            {/* calves */}
            <Rect x={44} y={186} width={13} height={46} rx={6} fill={f('Calves')} />
            <Rect x={63} y={186} width={13} height={46} rx={6} fill={f('Calves')} />
          </Svg>
          <Text style={{ color: Colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>BACK</Text>
        </View>
      </View>

      {/* Legend */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 12 }}>
        {([['High', 'high'], ['Moderate', 'moderate'], ['Low', 'low']] as [string, HeatLevel][]).map(([label, level]) => (
          <View key={level} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: LEVEL_FILL[level] }} />
            <Text style={{ color: Colors.textSecondary, fontSize: 12 }}>{label}</Text>
          </View>
        ))}
      </View>

      {empty && (
        <Text style={{ color: Colors.muted, fontSize: 13, textAlign: 'center', marginTop: 10 }}>
          Log workouts to light this up
        </Text>
      )}
    </View>
  );
}
