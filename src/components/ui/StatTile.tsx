import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, BorderRadius, Spacing } from '../../constants/theme';

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
        minHeight: 116,
        backgroundColor: Colors.surface,
        borderRadius: BorderRadius.lg,
        borderWidth: 1,
        borderColor: Colors.border,
        padding: Spacing.md,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: Colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textAlign: 'center' }}>
        {label.toUpperCase()}
      </Text>
      {/* Three of these share one row, so the widest value ("10/14") has only
          ~70px of content width on a small phone. Shrink-to-fit keeps the
          number big without ever wrapping or clipping. */}
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        style={{ color: Colors.text, fontSize: 32, fontWeight: '900', marginTop: 6, textAlign: 'center' }}
      >
        {value}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
        {sub ? <Text style={{ color: Colors.textSecondary, fontSize: 12 }}>{sub}</Text> : null}
        {icon ? <Ionicons name={icon} size={13} color={iconColor} /> : null}
      </View>
    </View>
  );
}
