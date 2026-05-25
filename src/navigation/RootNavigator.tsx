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
import { View, ActivityIndicator } from 'react-native';
import { Colors } from '../constants/theme';
import * as SecureStore from 'expo-secure-store';
import IntroScreen from '../screens/intro/IntroScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { session, setSession, setInitialized, initialized } = useAuthStore();
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user?.id) initialize(s.user.id);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Run initialize whenever the signed-in user changes
  useEffect(() => {
    if (session?.user?.id) initialize(session.user.id);
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
