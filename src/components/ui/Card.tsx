import React from 'react';
import { View, ViewStyle } from 'react-native';
import { Colors, BorderRadius, Spacing } from '../../constants/theme';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  padding?: number;
}

export function Card({ children, style, padding = Spacing.md }: CardProps) {
  return (
    <View
      style={[
        {
          backgroundColor: Colors.surface,
          borderRadius: BorderRadius.md,
          borderWidth: 1,
          borderColor: Colors.border,
          padding,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
