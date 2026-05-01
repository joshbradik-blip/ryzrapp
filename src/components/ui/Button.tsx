import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, ViewStyle } from 'react-native';
import { Colors } from '../../constants/theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  style,
}: ButtonProps) {
  const baseStyle: ViewStyle = {
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  };

  const sizeStyles: Record<string, ViewStyle> = {
    sm: { paddingVertical: 10, paddingHorizontal: 16 },
    md: { paddingVertical: 14, paddingHorizontal: 24 },
    lg: { paddingVertical: 18, paddingHorizontal: 32 },
  };

  const variantStyles: Record<string, ViewStyle> = {
    primary: { backgroundColor: disabled ? '#2A4A3A' : Colors.primary },
    secondary: { backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border },
    ghost: { backgroundColor: 'transparent' },
    danger: { backgroundColor: disabled ? '#4A2222' : Colors.danger },
  };

  const textColors: Record<string, string> = {
    primary: disabled ? Colors.muted : '#000000',
    secondary: disabled ? Colors.muted : Colors.text,
    ghost: disabled ? Colors.muted : Colors.primary,
    danger: disabled ? Colors.muted : Colors.text,
  };

  const fontSizes: Record<string, number> = { sm: 14, md: 16, lg: 18 };

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={[baseStyle, sizeStyles[size], variantStyles[variant], style]}
      activeOpacity={0.75}
    >
      {loading ? (
        <ActivityIndicator color={textColors[variant]} size="small" />
      ) : (
        <Text
          style={{
            color: textColors[variant],
            fontSize: fontSizes[size],
            fontWeight: '700',
            letterSpacing: 0.3,
          }}
        >
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
}
