import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/theme';
import { useIntroStore } from '../../store/introStore';
import { logFunnelStep, useFunnelStep } from '../../lib/funnel';
import type { RootStackParamList } from '../../types';

// One screen, not a carousel. Four swipes before a signup form is four chances
// to put the phone down, and the deck was mostly restating the same promise.
// Everything worth saying fits here, and the CTA is visible from the first frame.
type Feature = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  body: string;
};

const FEATURES: Feature[] = [
  {
    icon: 'barbell-outline',
    title: 'Custom workouts',
    body: 'A plan built around your goals, equipment, schedule and any injuries — not a template.',
  },
  {
    icon: 'pulse-outline',
    title: 'Knows when to push you',
    body: 'Reads your sleep, recovery, calories and past sessions, then adjusts today’s training to match.',
  },
  {
    icon: 'play-circle-outline',
    title: 'See every exercise',
    body: 'Short demo clips in the app, so you never have to guess what a movement looks like.',
  },
  {
    icon: 'camera-outline',
    title: 'Point your camera at it',
    body: 'Snap gym equipment to learn how to use it safely, or a meal to get its calories and macros.',
  },
  {
    icon: 'chatbubble-ellipses-outline',
    title: 'Ask your coach anything',
    body: 'Swap an exercise, work around a sore shoulder, or ask why today looks the way it does.',
  },
];

type Props = NativeStackScreenProps<RootStackParamList, 'Intro'>;

export default function IntroScreen(_props: Props) {
  const { markSeen } = useIntroStore();

  useFunnelStep('intro_viewed');

  const finish = useCallback(async () => {
    // No slide index to record any more — there is only one screen to leave.
    logFunnelStep('intro_completed');
    await SecureStore.setItemAsync('intro_seen', 'true');
    markSeen();
  }, [markSeen]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={styles.header}>
            <View style={styles.iconRing}>
              <Ionicons name="flash" size={44} color={Colors.primary} />
            </View>
            <Text style={styles.tag}>WELCOME TO RYZR</Text>
            <Text style={styles.title}>Your AI personal trainer</Text>
            <Text style={styles.subtitle}>
              Everything you need to train smarter — in one app.
            </Text>
          </View>

          <View style={styles.features}>
            {FEATURES.map((f) => (
              <View key={f.title} style={styles.feature}>
                <View style={styles.featureIcon}>
                  <Ionicons name={f.icon} size={20} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.featureTitle}>{f.title}</Text>
                  <Text style={styles.featureBody}>{f.body}</Text>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.cta} onPress={finish} activeOpacity={0.85}>
            <Text style={styles.ctaText}>Get Started</Text>
            <Ionicons name="arrow-forward" size={16} color={Colors.background} style={{ marginLeft: 8 }} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.lg },
  header: { alignItems: 'center', marginBottom: Spacing.xl },
  iconRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: Colors.primary + '18',
    borderWidth: 1,
    borderColor: Colors.primary + '55',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  tag: {
    color: Colors.primary,
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 3,
    marginBottom: Spacing.sm,
  },
  title: {
    color: Colors.text,
    fontSize: 30,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 300,
  },
  features: { gap: Spacing.md },
  feature: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.primary + '1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTitle: { color: Colors.text, fontWeight: '800', fontSize: 15, marginBottom: 3 },
  featureBody: { color: Colors.textSecondary, fontSize: 13, lineHeight: 19 },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: 16,
  },
  ctaText: { color: Colors.background, fontSize: 16, fontWeight: '900' },
});
