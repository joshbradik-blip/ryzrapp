import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, BorderRadius } from '../../constants/theme';

interface Props {
  label: string;
  value: string;
  sub?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
}

export function StatTile({ label, value, sub, icon, iconColor = Colors.primary }: Props) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: Colors.surface,
        borderRadius: BorderRadius.lg,
        borderWidth: 1,
        borderColor: Colors.border,
        padding: 14,
        alignItems: 'center',
      }}
    >
      <Text style={{ color: Colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textAlign: 'center' }}>
        {label.toUpperCase()}
      </Text>
      <Text style={{ color: Colors.text, fontSize: 26, fontWeight: '900', marginTop: 4 }}>{value}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
        {sub ? <Text style={{ color: Colors.textSecondary, fontSize: 12 }}>{sub}</Text> : null}
        {icon ? <Ionicons name={icon} size={13} color={iconColor} /> : null}
      </View>
    </View>
  );
}
