import React from 'react';
import { Text, TextStyle } from 'react-native';
import { Colors } from '../../constants/theme';

export function SectionLabel({ children, style }: { children: string; style?: TextStyle }) {
  return (
    <Text style={[{ color: Colors.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1.2 }, style]}>
      {children.toUpperCase()}
    </Text>
  );
}
