import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Colors } from '../../constants/theme';

interface Props {
  consumed: number;
  target: number;
  size?: number;
}

/**
 * Circular calorie gauge: consumed vs derived target. The arc fills toward
 * the target and turns to the warning colour once the day goes over.
 */
export function CalorieRing({ consumed, target, size = 168 }: Props) {
  const stroke = 14;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = target > 0 ? consumed / target : 0;
  const over = pct > 1;
  const dash = Math.min(pct, 1) * circ;
  const remaining = Math.round(target - consumed);
  const arcColor = over ? Colors.warning : Colors.primary;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={Colors.surface3} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={arcColor}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center' }}>
        <Text style={{ color: Colors.text, fontSize: 34, fontWeight: '900' }}>{Math.round(consumed)}</Text>
        <Text style={{ color: Colors.textSecondary, fontSize: 13 }}>of {Math.round(target)} kcal</Text>
        <Text style={{ color: over ? Colors.warning : Colors.muted, fontSize: 12, fontWeight: '700', marginTop: 2 }}>
          {over ? `${Math.abs(remaining)} over` : `${remaining} left`}
        </Text>
      </View>
    </View>
  );
}
