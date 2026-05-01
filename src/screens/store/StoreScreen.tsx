import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/theme';
import { useSubscriptionStore } from '../../store/subscriptionStore';

const PROGRAMS: { id: string; name: string; icon: keyof typeof Ionicons.glyphMap; description: string; price: number; tag: string | null; tagColor: string | null; weeks: number; sessions: number }[] = [
  {
    id: 'surf-prep',
    name: '12-Week Surf Prep',
    icon: 'water-outline',
    description: 'Explosive hips, rotational core, single-leg balance. Paddle strength and pop-up power.',
    price: 12.99,
    tag: 'Most popular',
    tagColor: Colors.primary,
    weeks: 12,
    sessions: 36,
  },
  {
    id: 'beginner-recomp',
    name: 'Beginner Recomp',
    icon: 'barbell-outline',
    description: 'Build muscle and lose fat simultaneously. Perfect for newcomers with 3 days/week.',
    price: 9.99,
    tag: null,
    tagColor: null,
    weeks: 8,
    sessions: 24,
  },
  {
    id: 'powerlifting',
    name: 'Powerlifting Foundation',
    icon: 'barbell-outline',
    description: 'Squat, bench, deadlift. Linear progression with technique coaching built in.',
    price: 14.99,
    tag: 'Advanced',
    tagColor: Colors.warning,
    weeks: 12,
    sessions: 48,
  },
  {
    id: 'marathon',
    name: 'Marathon Ready — 16 Weeks',
    icon: 'walk-outline',
    description: 'Strength-first approach to marathon training. Less injury, faster times.',
    price: 12.99,
    tag: null,
    tagColor: null,
    weeks: 16,
    sessions: 64,
  },
  {
    id: 'handstand',
    name: 'Handstand in 90 Days',
    icon: 'body-outline',
    description: 'Progressive wrist prep, shoulder strength, and balance drills. Freestanding handstand guaranteed.',
    price: 9.99,
    tag: 'New',
    tagColor: Colors.info,
    weeks: 13,
    sessions: 39,
  },
];

const PREMIUM_FEATURES: { icon: keyof typeof Ionicons.glyphMap; title: string; desc: string }[] = [
  { icon: 'hardware-chip-outline', title: 'AI Workout Generation',       desc: 'Personalized plans rebuilt weekly around your progress' },
  { icon: 'camera-outline',        title: 'Form Coach',                  desc: 'Real-time camera analysis with rep counting and cues' },
  { icon: 'trending-up-outline',   title: 'Advanced Analytics',          desc: 'Strength curves, volume trends, and goal projections' },
  { icon: 'refresh-outline',       title: 'Unlimited Plan Regeneration', desc: 'Update your goals anytime, new plan in 10 seconds' },
  { icon: 'flash-outline',         title: 'Priority Support',            desc: 'Direct access to the RYZR coaching team' },
];

export function StoreScreen() {
  const { isPremium, packages, fetchOfferings, purchasePackage, restorePurchases, loading } = useSubscriptionStore();
  const [activeTab, setActiveTab] = useState<'premium' | 'programs'>('premium');

  useEffect(() => {
    fetchOfferings();
  }, []);

  const handleSubscribe = async (type: 'monthly' | 'annual') => {
    const pkg = packages.find((p) =>
      type === 'monthly' ? p.packageType === 'MONTHLY' : p.packageType === 'ANNUAL'
    );
    if (!pkg) {
      Alert.alert(
        type === 'monthly' ? 'RYZR Premium — $9.99/mo' : 'RYZR Premium — $59.99/yr',
        'RevenueCat setup required. Add your iOS/Android API keys in src/store/subscriptionStore.ts to enable purchases.',
        [{ text: 'Got it' }]
      );
      return;
    }
    const success = await purchasePackage(pkg);
    if (success) Alert.alert('Welcome to Premium!', 'You now have access to all RYZR features.');
  };

  const handleBuyProgram = (program: typeof PROGRAMS[number]) => {
    Alert.alert(
      program.name,
      `$${program.price} one-time purchase.\n\nThis will be available as an in-app purchase via RevenueCat once configured.`,
      [{ text: 'OK' }]
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Header */}
        <View style={{ padding: 24, paddingBottom: 0 }}>
          <Text style={{ color: Colors.text, fontSize: 26, fontWeight: '900' }}>Store</Text>
          <Text style={{ color: Colors.textSecondary, fontSize: 14, marginTop: 2, marginBottom: 16 }}>
            Unlock your full potential
          </Text>

          {/* Tab switch */}
          <View style={{ flexDirection: 'row', backgroundColor: Colors.surface2, borderRadius: 12, padding: 4, borderWidth: 1, borderColor: Colors.border }}>
            {(['premium', 'programs'] as const).map((tab) => (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={{
                  flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center',
                  flexDirection: 'row', justifyContent: 'center', gap: 6,
                  backgroundColor: activeTab === tab ? Colors.surface3 : 'transparent',
                }}
              >
                <Ionicons
                  name={tab === 'premium' ? 'flash-outline' : 'library-outline'}
                  size={16}
                  color={activeTab === tab ? Colors.text : Colors.muted}
                />
                <Text style={{ color: activeTab === tab ? Colors.text : Colors.muted, fontWeight: '700' }}>
                  {tab === 'premium' ? 'Premium' : 'Programs'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {activeTab === 'premium' ? (
          <View style={{ padding: 24 }}>
            {isPremium ? (
              <View style={{ backgroundColor: Colors.primary + '11', borderRadius: 20, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: Colors.primary + '44' }}>
                <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.primary + '22', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.primary, marginBottom: 12 }}>
                  <Ionicons name="flash" size={40} color={Colors.primary} />
                </View>
                <Text style={{ color: Colors.primary, fontSize: 22, fontWeight: '900' }}>You're Premium!</Text>
                <Text style={{ color: Colors.textSecondary, fontSize: 15, textAlign: 'center', marginTop: 8 }}>
                  All features are unlocked. Keep training.
                </Text>
              </View>
            ) : (
              <>
                {/* Hero */}
                <View style={{ alignItems: 'center', marginBottom: 28 }}>
                  <View style={{
                    width: 80, height: 80, borderRadius: 40,
                    backgroundColor: Colors.primary + '22',
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: 2, borderColor: Colors.primary,
                    marginBottom: 16,
                  }}>
                    <Ionicons name="flash" size={40} color={Colors.primary} />
                  </View>
                  <Text style={{ color: Colors.text, fontSize: 26, fontWeight: '900', textAlign: 'center' }}>RYZR Premium</Text>
                  <Text style={{ color: Colors.textSecondary, fontSize: 15, textAlign: 'center', marginTop: 6, maxWidth: 280, lineHeight: 22 }}>
                    The full AI coaching experience. Personalized plans, form analysis, and data-driven progress.
                  </Text>
                </View>

                {/* Features list */}
                <View style={{ gap: 12, marginBottom: 28 }}>
                  {PREMIUM_FEATURES.map((f) => (
                    <View key={f.title} style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
                      <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.primary + '22', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Ionicons name={f.icon} size={22} color={Colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: Colors.text, fontWeight: '700', fontSize: 15 }}>{f.title}</Text>
                        <Text style={{ color: Colors.textSecondary, fontSize: 13, marginTop: 2, lineHeight: 18 }}>{f.desc}</Text>
                      </View>
                    </View>
                  ))}
                </View>

                {/* Pricing cards */}
                <View style={{ gap: 12, marginBottom: 16 }}>
                  {/* Annual — best value */}
                  <TouchableOpacity
                    onPress={() => handleSubscribe('annual')}
                    style={{
                      backgroundColor: Colors.primary + '11',
                      borderRadius: 16,
                      padding: 20,
                      borderWidth: 2,
                      borderColor: Colors.primary,
                      position: 'relative',
                    }}
                  >
                    <View style={{ position: 'absolute', top: -12, right: 16, backgroundColor: Colors.primary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                      <Text style={{ color: '#000', fontSize: 11, fontWeight: '800' }}>BEST VALUE — SAVE 50%</Text>
                    </View>
                    <Text style={{ color: Colors.text, fontSize: 20, fontWeight: '900' }}>Annual Plan</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                      <Text style={{ color: Colors.primary, fontSize: 32, fontWeight: '900' }}>$59.99</Text>
                      <Text style={{ color: Colors.textSecondary, fontSize: 14 }}>/ year</Text>
                    </View>
                    <Text style={{ color: Colors.muted, fontSize: 13, marginTop: 2 }}>$5/month billed annually</Text>
                  </TouchableOpacity>

                  {/* Monthly */}
                  <TouchableOpacity
                    onPress={() => handleSubscribe('monthly')}
                    style={{
                      backgroundColor: Colors.surface,
                      borderRadius: 16,
                      padding: 20,
                      borderWidth: 1,
                      borderColor: Colors.border,
                    }}
                  >
                    <Text style={{ color: Colors.text, fontSize: 20, fontWeight: '900' }}>Monthly Plan</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                      <Text style={{ color: Colors.text, fontSize: 32, fontWeight: '900' }}>$9.99</Text>
                      <Text style={{ color: Colors.textSecondary, fontSize: 14 }}>/ month</Text>
                    </View>
                    <Text style={{ color: Colors.muted, fontSize: 13, marginTop: 2 }}>Cancel anytime</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity onPress={restorePurchases} style={{ alignItems: 'center', paddingVertical: 10 }}>
                  <Text style={{ color: Colors.muted, fontSize: 13 }}>Restore purchases</Text>
                </TouchableOpacity>

                <Text style={{ color: Colors.muted, fontSize: 11, textAlign: 'center', lineHeight: 16, marginTop: 4 }}>
                  Subscriptions auto-renew. Cancel anytime in your App Store or Google Play account settings.
                </Text>
              </>
            )}
          </View>
        ) : (
          <View style={{ padding: 24 }}>
            <Text style={{ color: Colors.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: 20 }}>
              One-time purchases. AI-generated plans for specific goals, built by the RYZR team and refined with real athletes.
            </Text>

            <View style={{ gap: 14 }}>
              {PROGRAMS.map((program) => (
                <View key={program.id} style={{
                  backgroundColor: Colors.surface,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: Colors.border,
                  overflow: 'hidden',
                }}>
                  {program.tag && (
                    <View style={{ backgroundColor: (program.tagColor ?? Colors.primary) + '22', paddingHorizontal: 16, paddingVertical: 6, flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: program.tagColor ?? Colors.primary }} />
                      <Text style={{ color: program.tagColor ?? Colors.primary, fontSize: 12, fontWeight: '700' }}>{program.tag}</Text>
                    </View>
                  )}
                  <View style={{ padding: 16 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 10 }}>
                      <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: Colors.primary + '22', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name={program.icon} size={26} color={Colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: Colors.text, fontSize: 17, fontWeight: '800' }}>{program.name}</Text>
                        <Text style={{ color: Colors.textSecondary, fontSize: 13, marginTop: 4, lineHeight: 18 }}>
                          {program.description}
                        </Text>
                      </View>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 16, marginBottom: 14, alignItems: 'center' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="calendar-outline" size={13} color={Colors.muted} />
                        <Text style={{ color: Colors.muted, fontSize: 13 }}>{program.weeks} weeks</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="flash-outline" size={13} color={Colors.muted} />
                        <Text style={{ color: Colors.muted, fontSize: 13 }}>{program.sessions} sessions</Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      onPress={() => handleBuyProgram(program)}
                      style={{
                        backgroundColor: Colors.surface2,
                        borderRadius: 10,
                        padding: 14,
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        borderWidth: 1,
                        borderColor: Colors.border,
                      }}
                    >
                      <Text style={{ color: Colors.text, fontWeight: '700', fontSize: 15 }}>
                        ${program.price.toFixed(2)}
                        <Text style={{ color: Colors.muted, fontSize: 13, fontWeight: '400' }}> one-time</Text>
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={{ color: Colors.primary, fontWeight: '700', fontSize: 14 }}>Get it</Text>
                        <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
                      </View>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
