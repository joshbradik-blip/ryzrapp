import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OnboardingStackParamList } from '../../types';
import { Colors } from '../../constants/theme';
import { SubscriptionTerms } from '../../components/ui/SubscriptionTerms';
import { useProfileStore } from '../../store/profileStore';
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
    isPremium,
    lifetimeSlotsRemaining,
    loading,
    purchasePackage,
    purchaseLifetime,
    restorePurchases,
    packages,
    fetchOfferings,
  } = useSubscriptionStore();
  const { completeOnboarding } = useProfileStore();

  const slotsGone = lifetimeSlotsRemaining <= 0;

  const monthlyPkg = packages.find((p) => p.packageType === 'MONTHLY');
  const annualPkg = packages.find((p) => p.packageType === 'ANNUAL');
  const lifetimePkg = packages.find((p) => p.packageType === 'LIFETIME');

  // Prefer the live, localized RevenueCat price so the displayed price always
  // matches what Apple charges; fall back to constants only until offerings load.
  const monthlyPrice = monthlyPkg?.product.priceString ?? `$${PRICE_MONTHLY}`;
  const annualPrice = annualPkg?.product.priceString ?? `$${PRICE_ANNUAL}`;
  const annualPerMonth = annualPkg
    ? annualPkg.product.priceString.replace(/[\d.,]+/, (annualPkg.product.price / 12).toFixed(2))
    : `$${(PRICE_ANNUAL / 12).toFixed(2)}`;
  const lifetimePrice = lifetimePkg?.product.priceString ?? `$${PRICE_LIFETIME}`;

  const offeringsLoading = loading && packages.length === 0;

  React.useEffect(() => {
    if (packages.length === 0) fetchOfferings();
  }, []);

  // Last step of onboarding now — the plan is already generated and waiting, so
  // every exit from this screen (subscribe, restore, or continue free) drops the
  // user into the app.
  const proceed = () => completeOnboarding();

  // Never sell to someone who already owns it. Reinstalling subscribers and
  // comped/beta accounts arrive here already premium; showing them a price
  // sheet reads as being charged twice.
  React.useEffect(() => {
    if (isPremium) proceed();
  }, [isPremium]);

  // A restored subscriber must not be left staring at the paywall they just
  // proved they don't need — carry them straight into the app.
  const handleRestore = async () => {
    const restored = await restorePurchases();
    if (restored) {
      Alert.alert('Purchases restored!', "Your subscription is active — your plan is waiting.", [
        { text: 'Continue', onPress: proceed },
      ]);
    } else {
      Alert.alert('No purchases found', 'No active subscriptions to restore.');
    }
  };

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
      Alert.alert('You\'re a RYZR Founding Member! 🏆', 'Lifetime access is yours. Your plan is waiting.', [
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
            Your plan is ready
          </Text>
          <Text style={{ color: Colors.textSecondary, fontSize: 15, textAlign: 'center', marginTop: 6, lineHeight: 22 }}>
            Your first plan is on us — it's waiting inside. Upgrade anytime to unlock everything.
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
                First {LIFETIME_SLOTS_TOTAL} subscribers get lifetime access for {lifetimePrice}
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
                    <Text style={{ color: '#00000099', fontSize: 10, fontWeight: '800', letterSpacing: 1 }}>ONE-TIME PURCHASE · NO AUTO-RENEWAL</Text>
                    <Text style={{ color: '#000', fontWeight: '900', fontSize: 17, marginTop: 3 }}>
                      🏆 Founding Member — {lifetimePrice} Lifetime
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
              <Text style={{ color: slotsGone ? '#00000099' : Colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1 }}>AUTO-RENEWING SUBSCRIPTION</Text>
              <Text style={{ color: slotsGone ? '#000' : Colors.text, fontWeight: '800', fontSize: 16, marginTop: 3 }}>
                Annual — {annualPrice}/yr
              </Text>
              <Text style={{ color: slotsGone ? '#00000088' : Colors.muted, fontSize: 12, marginTop: 2 }}>
                {annualPerMonth}/mo · billed yearly, auto-renews
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
              <Text style={{ color: Colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1 }}>AUTO-RENEWING SUBSCRIPTION</Text>
              <Text style={{ color: Colors.text, fontWeight: '800', fontSize: 16, marginTop: 3 }}>
                Monthly — {monthlyPrice}/mo
              </Text>
              <Text style={{ color: Colors.muted, fontSize: 12, marginTop: 2 }}>Billed monthly, auto-renews · cancel anytime</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Start free — presented as a full plan option, not a footnote */}
        <TouchableOpacity
          onPress={proceed}
          disabled={loading}
          style={{
            backgroundColor: Colors.surface,
            borderRadius: 16,
            padding: 16,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: Colors.border,
            marginBottom: 16,
          }}
        >
          <Text style={{ color: Colors.text, fontWeight: '800', fontSize: 16 }}>
            Start Free
          </Text>
          <Text style={{ color: Colors.textSecondary, fontSize: 12, marginTop: 2 }}>
            AI plan + logging · upgrade anytime
          </Text>
        </TouchableOpacity>

        {/* Restore purchases */}
        <TouchableOpacity
          onPress={handleRestore}
          disabled={loading}
          style={{ alignItems: 'center', paddingVertical: 10 }}
        >
          <Text style={{ color: Colors.muted, fontSize: 13 }}>Restore purchases</Text>
        </TouchableOpacity>

        <SubscriptionTerms />
      </ScrollView>
    </SafeAreaView>
  );
}
