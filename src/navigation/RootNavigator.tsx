import React, { useEffect } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { AuthNavigator } from './AuthNavigator';
import { OnboardingNavigator } from './OnboardingNavigator';
import { MainTabNavigator } from './MainTabNavigator';
import { useAuthStore } from '../store/authStore';
import { useProfileStore } from '../store/profileStore';
import { useIntroStore } from '../store/introStore';
import { useSubscriptionStore } from '../store/subscriptionStore';
import { supabase } from '../lib/supabase';
import { redeemPendingReferralCode } from '../lib/referrals';
import { View, ActivityIndicator, Linking } from 'react-native';
import { Colors } from '../constants/theme';
import * as SecureStore from 'expo-secure-store';
import IntroScreen from '../screens/intro/IntroScreen';
import { ResetPasswordScreen } from '../screens/auth/ResetPasswordScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { session, setSession, setInitialized, initialized, passwordRecovery } = useAuthStore();
  const { profile } = useProfileStore();
  const { seen: introSeen, initSeen } = useIntroStore();
  const { initialize } = useSubscriptionStore();

  useEffect(() => {
    Promise.all([
      supabase.auth.getSession(),
      SecureStore.getItemAsync('intro_seen'),
    ]).then(([{ data: { session: s } }, introValue]) => {
      setSession(s);
      initSeen(introValue === 'true');
      setInitialized();
    }).catch(() => {
      initSeen(false);
      setInitialized();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') useAuthStore.getState().setPasswordRecovery(true);
    });

    // Handle password-recovery deep links (ryzr://reset-password?code=… or #access_token=…)
    const handleUrl = async (url: string | null) => {
      if (!url || !url.includes('reset-password')) return;
      try {
        const queryStr = url.includes('?') ? url.split('?')[1].split('#')[0] : '';
        const hashStr = url.includes('#') ? url.split('#')[1] : '';
        const query = new URLSearchParams(queryStr);
        const hash = new URLSearchParams(hashStr);
        const code = query.get('code');
        const access_token = hash.get('access_token') ?? query.get('access_token');
        const refresh_token = hash.get('refresh_token') ?? query.get('refresh_token');
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) return;
        } else if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (error) return;
        } else {
          return;
        }
        useAuthStore.getState().setPasswordRecovery(true);
      } catch {
        // invalid/expired link — login screen stays reachable for a resend
      }
    };
    Linking.getInitialURL().then(handleUrl);
    const urlSub = Linking.addEventListener('url', (e) => handleUrl(e.url));

    return () => {
      subscription.unsubscribe();
      urlSub.remove();
    };
  }, []);

  // Run initialize whenever the signed-in user changes
  useEffect(() => {
    if (session?.user?.id) {
      initialize(session.user.id);
      // Attach a sign-up invite code to its referrer (no-op when none pending)
      redeemPendingReferralCode().catch(() => {});
    }
  }, [session?.user?.id]);

  if (!initialized || introSeen === null) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  const showOnboarding = session && (!profile || !profile.onboarding_complete);

  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
      {!introSeen ? (
        <Stack.Screen name="Intro" component={IntroScreen} />
      ) : passwordRecovery && session ? (
        <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
      ) : !session ? (
        <Stack.Screen name="Auth" component={AuthNavigator} />
      ) : showOnboarding ? (
        <Stack.Screen name="Onboarding" component={OnboardingNavigator} />
      ) : (
        <Stack.Screen name="Main" component={MainTabNavigator} />
      )}
    </Stack.Navigator>
  );
}
