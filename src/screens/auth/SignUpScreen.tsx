import React, { useState } from 'react';
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../types';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useAuthStore } from '../../store/authStore';
import { Colors } from '../../constants/theme';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'SignUp'>;
};

export function SignUpScreen({ navigation }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { signUp, loading } = useAuthStore();

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Name is required';
    if (!email.trim() || !email.includes('@')) errs.email = 'Valid email required';
    if (password.length < 8) errs.password = 'Password must be at least 8 characters';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSignUp = async () => {
    if (!validate()) return;
    try {
      await signUp(email.trim(), password, name.trim());
    } catch (e: any) {
      Alert.alert('Sign Up Failed', e.message ?? 'Please try again.');
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
            Create account
          </Text>
          <Text style={{ color: Colors.textSecondary, fontSize: 16, marginBottom: 40 }}>
            Start your personalized training journey.
          </Text>

          <Input
            label="Your name"
            value={name}
            onChangeText={setName}
            placeholder="John Doe"
            autoCapitalize="words"
            error={errors.name}
          />
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
            placeholder="8+ characters"
            secureToggle
            error={errors.password}
          />

          <View style={{ marginTop: 8 }}>
            <Button
              title="Create Account"
              onPress={handleSignUp}
              loading={loading}
              size="lg"
            />
          </View>

          <Text
            style={{
              color: Colors.muted,
              fontSize: 12,
              textAlign: 'center',
              marginTop: 16,
              lineHeight: 18,
            }}
          >
            By signing up you agree to our Terms of Service and Privacy Policy.
          </Text>

          <View style={{ flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 24, marginTop: 32 }}>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={{ color: Colors.textSecondary, fontSize: 15 }}>
                Already have an account?{' '}
                <Text style={{ color: Colors.primary, fontWeight: '700' }}>Log in</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
