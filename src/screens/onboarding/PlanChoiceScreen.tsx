import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OnboardingStackParamList } from '../../types';
import { SectionLabel } from '../../components/ui/SectionLabel';
import { PremiumModal } from '../../components/ui/PremiumModal';
import { useProfileStore } from '../../store/profileStore';
import { useSubscriptionStore } from '../../store/subscriptionStore';
import { useAuthStore } from '../../store/authStore';
import { Colors } from '../../constants/theme';
import { logFunnelStep } from '../../lib/funnel';

type Props = {
  navigation: NativeStackNavigationProp<OnboardingStackParamList, 'PlanChoice'>;
};

type PlanChoice = 'full_gym' | 'bodyweight' | 'custom';

const CARDS: {
  choice: PlanChoice;
  title: string;
  desc: string;
  icon: keyof typeof Ionicons.glyphMap;
  premium?: boolean;
}[] = [
  {
    choice: 'full_gym',
    title: 'Full Gym',
    desc: 'Barbell, dumbbells, machines — a complete 4-week program, ready now.',
    icon: 'barbell-outline',
  },
  {
    choice: 'bodyweight',
    title: 'Bodyweight',
    desc: 'No equipment needed — a complete 4-week program, ready now.',
    icon: 'body-outline',
  },
  {
    choice: 'custom',
    title: 'Custom Workout',
    desc: 'Answer a few questions and get an AI-built plan tailored to your goals, injuries, and equipment.',
    icon: 'sparkles-outline',
    premium: true,
  },
];

export function PlanChoiceScreen({ navigation }: Props) {
  const { applyStaticPlan } = useProfileStore();
  const { isPremium } = useSubscriptionStore();
  const userId = useAuthStore((s) => s.session?.user?.id);
  const [premiumOpen, setPremiumOpen] = useState(false);

  useEffect(() => {
    logFunnelStep('plan_choice_viewed');
  }, []);

  const handleChoice = (choice: PlanChoice) => {
    logFunnelStep('plan_choice_selected', { choice });

    if (choice === 'full_gym' || choice === 'bodyweight') {
      applyStaticPlan(choice, userId);
      navigation.navigate('PlanReady', { choice });
      return;
    }

    // Custom Workout — premium trigger point
    if (isPremium) {
      navigation.navigate('ProfileBasics');
    } else {
      setPremiumOpen(true);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, justifyContent: 'center' }}>
        <View style={{ marginBottom: 32 }}>
          <SectionLabel>Get started</SectionLabel>
          <Text style={{ fontSize: 28, fontWeight: '900', color: Colors.text, marginTop: 8 }}>
            Pick your plan
          </Text>
          <Text style={{ color: Colors.textSecondary, fontSize: 16, marginTop: 8, lineHeight: 22 }}>
            Start training in seconds, or build something tailored to you.
          </Text>
        </View>

        <View style={{ gap: 14 }}>
          {CARDS.map((card) => (
            <TouchableOpacity
              key={card.choice}
              onPress={() => handleChoice(card.choice)}
              activeOpacity={0.85}
              style={{
                backgroundColor: Colors.surface,
                borderRadius: 18,
                padding: 20,
                borderWidth: 1.5,
                borderColor: card.premium ? Colors.primary + '55' : Colors.border,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 16,
              }}
            >
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  backgroundColor: Colors.primary + '22',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name={card.icon} size={26} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ color: Colors.text, fontWeight: '800', fontSize: 17 }}>{card.title}</Text>
                  {card.premium && !isPremium && (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 3,
                        backgroundColor: Colors.primary + '33',
                        borderRadius: 6,
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                      }}
                    >
                      <Ionicons name="lock-closed" size={10} color={Colors.primary} />
                      <Text style={{ color: Colors.primary, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 }}>
                        PREMIUM
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={{ color: Colors.textSecondary, fontSize: 13, marginTop: 4, lineHeight: 18 }}>
                  {card.desc}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.muted} />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <PremiumModal
        visible={premiumOpen}
        onClose={() => setPremiumOpen(false)}
        featureTitle="Custom AI Workout Plans"
      />
    </SafeAreaView>
  );
}
