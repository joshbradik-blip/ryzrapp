import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../types';
import { GradientButton } from '../../components/ui/GradientButton';
import { Input } from '../../components/ui/Input';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/theme';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Login'>;
};

export function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { signIn, loading } = useAuthStore();

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      Alert.alert('Enter your email', 'Please enter your email address first.');
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: 'ryzr://reset-password',
    });
    if (error) {
      Alert.alert('Something went wrong', 'Could not send the reset email. Check your connection and try again.');
      return;
    }
    Alert.alert('Check your email', `If an account exists for ${email.trim()}, a password reset link is on its way.`);
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!email.trim()) errs.email = 'Email is required';
    if (!password) errs.password = 'Password is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleLogin = async () => {
    if (!validate()) return;
    try {
      await signIn(email.trim(), password);
    } catch (e: any) {
      Alert.alert('Login Failed', e.message ?? 'Invalid email or password.');
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, padding: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginBottom: 32 }}>
            <Text style={{ color: Colors.textSecondary, fontSize: 16 }}>← Back</Text>
          </TouchableOpacity>

          <Text style={{ fontSize: 32, fontWeight: '900', color: Colors.text, marginBottom: 8 }}>
            Welcome back
          </Text>
          <Text style={{ color: Colors.textSecondary, fontSize: 16, marginBottom: 40 }}>
            Log in to continue your training.
          </Text>

          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
            error={errors.email}
          />
          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            secureToggle
            error={errors.password}
          />

          <TouchableOpacity
            onPress={handleForgotPassword}
            style={{ alignSelf: 'flex-end', marginTop: 4, marginBottom: 8 }}
          >
            <Text style={{ color: Colors.primary, fontSize: 14, fontWeight: '600' }}>Forgot password?</Text>
          </TouchableOpacity>

          <View style={{ marginTop: 8 }}>
            <GradientButton title="Log In" onPress={handleLogin} loading={loading} />
          </View>

          <View style={{ flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 24, marginTop: 40 }}>
            <TouchableOpacity onPress={() => navigation.navigate('SignUp')}>
              <Text style={{ color: Colors.textSecondary, fontSize: 15 }}>
                Don't have an account?{' '}
                <Text style={{ color: Colors.primary, fontWeight: '700' }}>Sign up</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
