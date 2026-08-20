import React from 'react';
import { View, Text, StyleProp, ViewStyle } from 'react-native';
import { FreeTrial, trialBadgeText } from '../../lib/trial';
import { Colors } from '../../constants/theme';

interface Props {
  trial: FreeTrial;
  /** Ember fill for dark cards; outline for cards already using the ember fill. */
  variant?: 'solid' | 'outline';
  style?: StyleProp<ViewStyle>;
}

/** "3 DAYS FREE" pill. Rendered only where a trial actually exists. */
export function TrialBadge({ trial, variant = 'solid', style }: Props) {
  const solid = variant === 'solid';
  return (
    <View
      style={[
        {
          alignSelf: 'flex-start',
          backgroundColor: solid ? Colors.primary : 'transparent',
          borderWidth: solid ? 0 : 1.5,
          borderColor: '#000000',
          borderRadius: 6,
          paddingHorizontal: 8,
          paddingVertical: 3,
        },
        style,
      ]}
    >
      <Text
        style={{
          color: solid ? Colors.onPrimary : '#000000',
          fontSize: 10,
          fontWeight: '900',
          letterSpacing: 0.8,
        }}
      >
        {trialBadgeText(trial)}
      </Text>
    </View>
  );
}
