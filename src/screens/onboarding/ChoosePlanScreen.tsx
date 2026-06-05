import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OnboardingStackParamList } from '../../types';
import { Colors } from '../../constants/theme';
import {
  useSubscriptionStore,
  PRICE_MONTHLY,
  PRICE_ANNUAL,
  PRICE_LIFETIME,
  LIFETIME_SLOTS_TOTAL,
} from '../../store/subscriptionStore';

type Props = {
  navigation: NativeStackNavigationProp<OnboardingStackParamList, 'ChoosePlan'>;
};

const FREE_FEATURES = [
  'AI-generated 4-week plan',
  'Manual workout logging',
  'Exercise library',
  'Basic progress & streaks',
  'New plan every 4 weeks',
];

const PREMIUM_FEATURES = [
  '4, 8, and 12-week AI plans',
  'Unlimited plan regeneration',
  'Form Coach (real-time camera)',
  'AI Coach chat — ask anything',
  'Advanced charts & analytics',
];

export function ChoosePlanScreen({ navigation }: Props) {
  const {
    lifetimeSlotsRemaining,
    loading,
    purchasePackage,
    purchaseLifetime,
    packages,
    fetchOfferings,
  } = useSubscriptionStore();

  const slotsGone = lifetimeSlotsRemaining <= 0;

  const monthlyPkg = packages.find((p) => p.packageType === 'MONTHLY');
  const annualPkg = packages.find((p) => p.packageType === 'ANNUAL');

  const offeringsLoading = loading && packages.length === 0;

  React.useEffect(() => {
    if (packages.length === 0) fetchOfferings();
  }, []);

  const proceed = () => navigation.navigate('GeneratingPlan');

  const handleMonthly = async () => {
    if (!monthlyPkg) return;
    const ok = await purchasePackage(monthlyPkg);
    if (ok) proceed();
  };

  const handleAnnual = async () => {
    if (!annualPkg) return;
    const ok = await purchasePackage(annualPkg);
    if (ok) proceed();
  };

  const handleLifetime = async () => {
    if (slotsGone) return;
    const ok = await purchaseLifetime();
    if (ok) {
      Alert.alert('You\'re a RYZR Founding Member! 🏆', 'Lifetime access is yours. Let\'s build your plan.', [
        { text: 'Let\'s go!', onPress: proceed },
      ]);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={{ alignItems: 'center', marginBottom: 28 }}>
          <View style={{
            width: 72, height: 72, borderRadius: 36,
            backgroundColor: Colors.primary + '22',
            borderWidth: 2, borderColor: Colors.primary,
            alignItems: 'center', justifyContent: 'center',
            marginBottom: 16,
          }}>
            <Ionicons name="flash" size={36} color={Colors.primary} />
          </View>
          <Text style={{ color: Colors.text, fontSize: 26, fontWeight: '900', textAlign: 'center' }}>
            Choose your plan
          </Text>
          <Text style={{ color: Colors.textSecondary, fontSize: 15, textAlign: 'center', marginTop: 6, lineHeight: 22 }}>
            Your first workout plan is on us. Upgrade anytime to unlock everything.
          </Text>
        </View>

        {/* Lifetime promo banner */}
        {!slotsGone && (
          <View style={{
            backgroundColor: Colors.primary + '15',
            borderRadius: 18,
            padding: 16,
            borderWidth: 1.5,
            borderColor: Colors.primary + '55',
            marginBottom: 24,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
          }}>
            <Text style={{ fontSize: 28 }}>🔥</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: Colors.primary, fontWeight: '900', fontSize: 15, lineHeight: 20 }}>
                {lifetimeSlotsRemaining} of {LIFETIME_SLOTS_TOTAL} founding spots remaining
              </Text>
              <Text style={{ color: Colors.textSecondary, fontSize: 13, marginTop: 3 }}>
                First 100 subscribers get lifetime access for $100
              </Text>
            </View>
          </View>
        )}

        {/* Feature comparison */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 28 }}>
          {/* Free */}
          <View style={{
            flex: 1, backgroundColor: Colors.surface, borderRadius: 16, padding: 16,
            borderWidth: 1, borderColor: Colors.border,
          }}>
            <Text style={{ color: Colors.text, fontWeight: '800', fontSize: 15, marginBottom: 12 }}>Free</Text>
            {FREE_FEATURES.map((f) => (
              <View key={f} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                <Ionicons name="checkmark" size={14} color={Colors.textSecondary} style={{ marginTop: 2 }} />
                <Text style={{ color: Colors.textSecondary, fontSize: 12, flex: 1, lineHeight: 17 }}>{f}</Text>
              </View>
            ))}
          </View>

          {/* Premium */}
          <View style={{
            flex: 1, backgroundColor: Colors.primary + '0D', borderRadius: 16, padding: 16,
            borderWidth: 1.5, borderColor: Colors.primary + '55',
          }}>
            <Text style={{ color: Colors.primary, fontWeight: '800', fontSize: 15, marginBottom: 12 }}>Premium</Text>
            {PREMIUM_FEATURES.map((f) => (
              <View key={f} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                <Ionicons name="checkmark-circle" size={14} color={Colors.primary} style={{ marginTop: 2 }} />
                <Text style={{ color: Colors.text, fontSize: 12, flex: 1, lineHeight: 17 }}>{f}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Purchase buttons */}
        {offeringsLoading ? (
          <View style={{ paddingVertical: 32, alignItems: 'center', marginBottom: 16 }}>
            <ActivityIndicator color={Colors.primary} size="large" />
            <Text style={{ color: Colors.muted, fontSize: 13, marginTop: 12 }}>Loading plans…</Text>
          </View>
        ) : (
          <View style={{ gap: 10, marginBottom: 16 }}>
            {/* Lifetime */}
            {!slotsGone && (
              <TouchableOpacity
                onPress={handleLifetime}
                disabled={loading}
                style={{
                  backgroundColor: Colors.primary,
                  borderRadius: 16,
                  padding: 18,
                  alignItems: 'center',
                }}
              >
                {loading ? <ActivityIndicator color="#000" /> : (
                  <>
                    <Text style={{ color: '#000', fontWeight: '900', fontSize: 17 }}>
                      🏆 Founding Member — $100 Lifetime
                    </Text>
                    <Text style={{ color: '#00000077', fontSize: 12, marginTop: 3 }}>
                      Pay once · {lifetimeSlotsRemaining} spots left
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {/* Annual */}
            <TouchableOpacity
              onPress={handleAnnual}
              disabled={loading}
              style={{
                backgroundColor: slotsGone ? Colors.primary : Colors.surface,
                borderRadius: 16,
                padding: 16,
                alignItems: 'center',
                borderWidth: slotsGone ? 2 : 1,
                borderColor: slotsGone ? Colors.primary : Colors.border,
              }}
            >
              <Text style={{ color: slotsGone ? '#000' : Colors.text, fontWeight: '800', fontSize: 16 }}>
                Annual — ${PRICE_ANNUAL}/yr
              </Text>
              <Text style={{ color: slotsGone ? '#00000088' : Colors.muted, fontSize: 12, marginTop: 2 }}>
                ${(PRICE_ANNUAL / 12).toFixed(2)}/mo · Best value
              </Text>
            </TouchableOpacity>

            {/* Monthly */}
            <TouchableOpacity
              onPress={handleMonthly}
              disabled={loading}
              style={{
                backgroundColor: Colors.surface,
                borderRadius: 16,
                padding: 16,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: Colors.border,
              }}
            >
              <Text style={{ color: Colors.text, fontWeight: '800', fontSize: 16 }}>
                Monthly — ${PRICE_MONTHLY}/mo
              </Text>
              <Text style={{ color: Colors.muted, fontSize: 12, marginTop: 2 }}>Cancel anytime</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Start free */}
        <TouchableOpacity
          onPress={proceed}
          disabled={loading}
          style={{ alignItems: 'center', paddingVertical: 14 }}
        >
          <Text style={{ color: Colors.muted, fontSize: 14, fontWeight: '600' }}>
            Start free — upgrade anytime
          </Text>
        </TouchableOpacity>

        <Text style={{ color: Colors.muted, fontSize: 11, textAlign: 'center', lineHeight: 16 }}>
          Subscriptions auto-renew. Cancel anytime in your App Store account settings.{'\n'}
          <Text style={{ color: Colors.muted, fontSize: 11, textDecorationLine: 'underline' }} onPress={() => Linking.openURL('https://joshbradik-blip.github.io/ryzr-privacy/privacy-policy.html')}>Privacy Policy</Text>
          {'  '}
          <Text style={{ color: Colors.muted, fontSize: 11, textDecorationLine: 'underline' }} onPress={() => Linking.openURL('https://joshbradik-blip.github.io/ryzr-privacy/terms-of-service.html')}>Terms of Service</Text>
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
