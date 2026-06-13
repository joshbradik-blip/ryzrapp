import React, { useState } from 'react';
import { Text, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { Input } from '../../components/ui/Input';
import { GradientButton } from '../../components/ui/GradientButton';
import { Colors } from '../../constants/theme';

export function ResetPasswordScreen() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const { setPasswordRecovery } = useAuthStore();

  const submit = async () => {
    if (password.length < 8) {
      Alert.alert('Too short', 'Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      Alert.alert('No match', 'Passwords do not match.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      Alert.alert(
        'Could not update password',
        'The reset link may have expired. Request a new one from the login screen.'
      );
      return;
    }
    setPasswordRecovery(false);
    Alert.alert('Password updated', 'You are now signed in.');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'center', padding: 24 }}
      >
        <Text style={{ color: Colors.text, fontSize: 28, fontWeight: '900', marginBottom: 8 }}>
          Set a new password
        </Text>
        <Text style={{ color: Colors.textSecondary, fontSize: 15, marginBottom: 24 }}>
          Choose a new password — at least 8 characters.
        </Text>
        <Input label="New password" value={password} onChangeText={setPassword} secureToggle placeholder="Your new password" />
        <Input label="Confirm password" value={confirm} onChangeText={setConfirm} secureToggle placeholder="Re-enter password" />
        <GradientButton title="Update password" onPress={submit} loading={saving} style={{ marginTop: 16 }} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
