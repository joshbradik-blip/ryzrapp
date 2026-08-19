import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';
import {
  isAppleSignInAvailable,
  isGoogleSignInConfigured,
  SocialAuthCancelled,
} from '../../lib/socialAuth';
import { Colors, BorderRadius } from '../../constants/theme';
import { logFunnelStep } from '../../lib/funnel';

const BUTTON_HEIGHT = 52;

interface Props {
  /** Drives the Apple button wording and the funnel events. */
  context: 'login' | 'signup';
  /** Disables both buttons while the email/password form is busy. */
  disabled?: boolean;
}

/**
 * "Continue with Apple / Google" block for the auth screens.
 *
 * Renders nothing at all when neither provider is available on this build, so
 * an unconfigured build simply falls back to email + password.
 */
export function SocialAuthButtons({ context, disabled }: Props) {
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [busy, setBusy] = useState<'apple' | 'google' | null>(null);
  const { signInWithApple, signInWithGoogle } = useAuthStore();

  const googleAvailable = isGoogleSignInConfigured();

  useEffect(() => {
    let active = true;
    isAppleSignInAvailable().then((ok) => {
      if (active) setAppleAvailable(ok);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!appleAvailable && !googleAvailable) return null;

  const run = async (provider: 'apple' | 'google') => {
    setBusy(provider);
    logFunnelStep('social_signin_started', { provider, context }, false);
    try {
      if (provider === 'apple') await signInWithApple();
      else await signInWithGoogle();
      logFunnelStep('social_signin_completed', { provider, context }, false);
    } catch (e: any) {
      // Backing out of the provider sheet is a normal action, not an error.
      if (e instanceof SocialAuthCancelled) return;
      Alert.alert(
        provider === 'apple' ? 'Apple Sign-In Failed' : 'Google Sign-In Failed',
        e?.message ?? 'Please try again.',
      );
    } finally {
      setBusy(null);
    }
  };

  const locked = !!busy || !!disabled;

  return (
    <View style={{ marginTop: 24 }}>
      {/* "or" divider */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: Colors.border }} />
        <Text
          style={{
            color: Colors.muted,
            fontSize: 13,
            fontWeight: '600',
            marginHorizontal: 12,
          }}
        >
          or continue with
        </Text>
        <View style={{ flex: 1, height: 1, backgroundColor: Colors.border }} />
      </View>

      {appleAvailable && (
        <View
          pointerEvents={locked ? 'none' : 'auto'}
          style={{ opacity: locked && busy !== 'apple' ? 0.5 : 1, marginBottom: 12 }}
        >
          {busy === 'apple' ? (
            <SocialButtonShell background="#FFFFFF">
              <ActivityIndicator color="#1F1F1F" />
            </SocialButtonShell>
          ) : (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={
                context === 'signup'
                  ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
                  : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
              }
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
              cornerRadius={BorderRadius.lg}
              style={{ height: BUTTON_HEIGHT, width: '100%' }}
              onPress={() => run('apple')}
            />
          )}
        </View>
      )}

      {googleAvailable && (
        <TouchableOpacity
          onPress={() => run('google')}
          disabled={locked}
          activeOpacity={0.85}
          style={{ opacity: locked && busy !== 'google' ? 0.5 : 1 }}
        >
          <SocialButtonShell background="#FFFFFF">
            {busy === 'google' ? (
              <ActivityIndicator color="#1F1F1F" />
            ) : (
              <>
                <Ionicons name="logo-google" size={20} color="#1F1F1F" />
                <Text style={{ color: '#1F1F1F', fontSize: 17, fontWeight: '700' }}>
                  {context === 'signup' ? 'Sign up with Google' : 'Sign in with Google'}
                </Text>
              </>
            )}
          </SocialButtonShell>
        </TouchableOpacity>
      )}
    </View>
  );
}

/** Shared frame so the Google button lines up with Apple's native one. */
function SocialButtonShell({
  background,
  children,
}: {
  background: string;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        height: BUTTON_HEIGHT,
        borderRadius: BorderRadius.lg,
        backgroundColor: background,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
      }}
    >
      {children}
    </View>
  );
}
