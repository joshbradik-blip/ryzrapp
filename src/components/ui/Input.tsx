import React, { useState } from 'react';
import { View, TextInput, Text, TouchableOpacity, TextInputProps } from 'react-native';
import { Colors } from '../../constants/theme';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  secureToggle?: boolean;
}

export function Input({ label, error, secureToggle, style, ...props }: InputProps) {
  const [secure, setSecure] = useState(secureToggle ?? false);

  return (
    <View style={{ marginBottom: 16 }}>
      {label && (
        <Text style={{ color: Colors.textSecondary, fontSize: 13, marginBottom: 6, fontWeight: '600', letterSpacing: 0.5 }}>
          {label.toUpperCase()}
        </Text>
      )}
      <View style={{ position: 'relative' }}>
        <TextInput
          {...props}
          secureTextEntry={secure}
          placeholderTextColor={Colors.muted}
          style={[
            {
              backgroundColor: Colors.surface2,
              borderWidth: 1,
              borderColor: error ? Colors.danger : Colors.border,
              borderRadius: 12,
              paddingHorizontal: 16,
              paddingVertical: 14,
              color: Colors.text,
              fontSize: 16,
              paddingRight: secureToggle ? 48 : 16,
            },
            style,
          ]}
        />
        {secureToggle && (
          <TouchableOpacity
            onPress={() => setSecure((s) => !s)}
            style={{ position: 'absolute', right: 14, top: 14 }}
          >
            <Text style={{ color: Colors.muted, fontSize: 14 }}>{secure ? 'SHOW' : 'HIDE'}</Text>
          </TouchableOpacity>
        )}
      </View>
      {error && (
        <Text style={{ color: Colors.danger, fontSize: 12, marginTop: 4 }}>{error}</Text>
      )}
    </View>
  );
}
