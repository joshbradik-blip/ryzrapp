import React from 'react';
import { Text, TouchableOpacity, ViewStyle, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Gradients, BorderRadius } from '../../constants/theme';

interface Props {
  title: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

export function GradientButton({ title, onPress, icon, disabled, loading, style }: Props) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      style={style}
    >
      <LinearGradient
        colors={[...Gradients.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          borderRadius: BorderRadius.lg,
          paddingVertical: 16,
          minHeight: 52,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {loading ? (
          <ActivityIndicator color={Colors.onPrimary} />
        ) : (
          <>
            <Text style={{ color: Colors.onPrimary, fontSize: 17, fontWeight: '800' }}>{title}</Text>
            {icon && <Ionicons name={icon} size={18} color={Colors.onPrimary} />}
          </>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}
