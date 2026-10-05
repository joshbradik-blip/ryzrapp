import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OnboardingStackParamList } from '../../types';
import { SectionLabel } from '../../components/ui/SectionLabel';
import { useProfileStore } from '../../store/profileStore';
import { useAuthStore } from '../../store/authStore';
import { Colors } from '../../constants/theme';
import { logFunnelStep } from '../../lib/funnel';

type Props = {
  navigation: NativeStackNavigationProp<OnboardingStackParamList, 'PlanChoice'>;
};

/** Equipment variants behind the single Quick card. */
type QuickKit = 'full_gym' | 'bodyweight';

const KITS: { kit: QuickKit; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { kit: 'full_gym', label: 'Gym', icon: 'barbell-outline' },
  { kit: 'bodyweight', label: 'Bodyweight', icon: 'body-outline' },
];

export function PlanChoiceScreen({ navigation }: Props) {
  const { applyStaticPlan } = useProfileStore();
  const userId = useAuthStore((s) => s.session?.user?.id);
  // Two cards rather than three: equipment is a detail of the quick plan, not a
  // third decision. Keeping it inline means someone with no gym still gets a
  // usable plan without adding a screen to the very flow we are shortening.
  const [kit, setKit] = useState<QuickKit>('full_gym');

  useEffect(() => {
    logFunnelStep('plan_choice_viewed');
  }, []);

  const startQuick = () => {
    // Logged as the specific kit so existing funnel queries keyed on
    // full_gym/bodyweight keep working.
    logFunnelStep('plan_choice_selected', { choice: kit });
    applyStaticPlan(kit, userId);
    navigation.navigate('PlanReady', { choice: kit });
  };

  // Custom goes straight into the questionnaire. Premium is only offered when a
  // premium feature is used (Store → Membership); free users are capped at the
  // 4-week plan in GeneratingPlanScreen.
  const startCustom = () => {
    logFunnelStep('plan_choice_selected', { choice: 'custom' });
    navigation.navigate('ProfileBasics');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, justifyContent: 'center' }}>
        <View style={{ marginBottom: 32 }}>
          <SectionLabel>Get started</SectionLabel>
          <Text style={{ fontSize: 28, fontWeight: '900', color: Colors.text, marginTop: 8 }}>
            How do you want to start?
          </Text>
          <Text style={{ color: Colors.textSecondary, fontSize: 16, marginTop: 8, lineHeight: 22 }}>
            Start training in seconds, or build something tailored to you.
          </Text>
        </View>

        <View style={{ gap: 14 }}>
          {/* ── Quick start ── */}
          <TouchableOpacity
            onPress={startQuick}
            activeOpacity={0.85}
            style={{
              backgroundColor: Colors.surface,
              borderRadius: 18,
              padding: 20,
              borderWidth: 1.5,
              borderColor: Colors.border,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <View style={{
                width: 52, height: 52, borderRadius: 14,
                backgroundColor: Colors.primary + '22',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name="flash-outline" size={26} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: Colors.text, fontWeight: '800', fontSize: 17 }}>Quick Start</Text>
                <Text style={{ color: Colors.textSecondary, fontSize: 13, marginTop: 4, lineHeight: 18 }}>
                  A complete 4-week program, ready right now. No questions.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.muted} />
            </View>

            {/* Equipment toggle — nested touchables capture their own press, so
                tapping a chip switches the kit without starting the plan. */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              {KITS.map((k) => {
                const selected = kit === k.kit;
                return (
                  <TouchableOpacity
                    key={k.kit}
                    onPress={() => setKit(k.kit)}
                    activeOpacity={0.8}
                    style={{
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      paddingVertical: 10,
                      borderRadius: 10,
                      backgroundColor: selected ? Colors.primary + '22' : Colors.surface2,
                      borderWidth: 1.5,
                      borderColor: selected ? Colors.primary : Colors.border,
                    }}
                  >
                    <Ionicons
                      name={k.icon}
                      size={15}
                      color={selected ? Colors.primary : Colors.textSecondary}
                    />
                    <Text style={{
                      color: selected ? Colors.primary : Colors.textSecondary,
                      fontWeight: '700',
                      fontSize: 13,
                    }}>
                      {k.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </TouchableOpacity>

          {/* ── Custom ── */}
          <TouchableOpacity
            onPress={startCustom}
            activeOpacity={0.85}
            style={{
              backgroundColor: Colors.surface,
              borderRadius: 18,
              padding: 20,
              borderWidth: 1.5,
              borderColor: Colors.primary + '55',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <View style={{
              width: 52, height: 52, borderRadius: 14,
              backgroundColor: Colors.primary + '22',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Ionicons name="sparkles-outline" size={26} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: Colors.text, fontWeight: '800', fontSize: 17 }}>Custom Workout</Text>
              </View>
              <Text style={{ color: Colors.textSecondary, fontSize: 13, marginTop: 4, lineHeight: 18 }}>
                Answer a few questions and get an AI-built plan around your goals, injuries and equipment.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.muted} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
