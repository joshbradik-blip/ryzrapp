import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import {
  useSubscriptionStore,
  PRICE_MONTHLY,
  PRICE_ANNUAL,
  PRICE_LIFETIME,
  LIFETIME_SLOTS_TOTAL,
} from '../../store/subscriptionStore';

const PREMIUM_FEATURES: { icon: keyof typeof Ionicons.glyphMap; title: string; desc: string }[] = [
  { icon: 'hardware-chip-outline', title: 'AI Workout Generation',       desc: 'Personalized plans rebuilt weekly around your progress' },
  { icon: 'camera-outline',        title: 'Form Coach',                  desc: 'Real-time camera analysis with rep counting and cues' },
  { icon: 'trending-up-outline',   title: 'Advanced Analytics',          desc: 'Strength curves, volume trends, and goal projections' },
  { icon: 'refresh-outline',       title: 'Unlimited Plan Regeneration', desc: 'Update your goals anytime, new plan in 10 seconds' },
  { icon: 'flash-outline',         title: 'Priority Support',            desc: 'Direct access to the RYZR coaching team' },
];

// ─── Affiliate gear ──────────────────────────────────────────────────────────
// Replace with your real Amazon Associates tracking tag (e.g. "ryzr-20").
// Until then links still open, they just won't earn commission.
const AMAZON_ASSOCIATE_TAG = 'bradikshop-20';

// Products live in the `gear_products` Supabase table — add/edit/remove them in
// the dashboard with no app rebuild. See supabase/migrations/002_gear_products.sql.
type GearRow = {
  section: string;
  name: string;
  description: string;
  asin: string; // Amazon product ID (the "B0..." code in any product URL)
  icon: string; // Ionicons name
};

type GearItem = { asin: string; name: string; desc: string; icon: keyof typeof Ionicons.glyphMap };
type GearSection = { title: string; items: GearItem[] };

// Group flat rows (already sorted by sort_order) into sections, preserving order.
function groupGear(rows: GearRow[]): GearSection[] {
  const sections: GearSection[] = [];
  for (const row of rows) {
    let section = sections.find((s) => s.title === row.section);
    if (!section) {
      section = { title: row.section, items: [] };
      sections.push(section);
    }
    section.items.push({
      asin: row.asin,
      name: row.name,
      desc: row.description,
      icon: row.icon as keyof typeof Ionicons.glyphMap,
    });
  }
  return sections;
}

export function StoreScreen() {
  const {
    isPremium, packages, fetchOfferings, purchasePackage, purchaseLifetime,
    restorePurchases, loading, lifetimeSlotsRemaining,
  } = useSubscriptionStore();

  const slotsGone = lifetimeSlotsRemaining <= 0;

  const [tab, setTab] = useState<'membership' | 'gear'>('membership');

  const [gearSections, setGearSections] = useState<GearSection[]>([]);
  const [gearLoading, setGearLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from('gear_products')
        .select('section, name, description, asin, icon')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (!active) return;
      setGearSections(error || !data ? [] : groupGear(data as GearRow[]));
      setGearLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const openGearLink = (asin: string) => {
    const url = `https://www.amazon.com/dp/${asin}?tag=${AMAZON_ASSOCIATE_TAG}`;
    Linking.openURL(url).catch(() =>
      Alert.alert('Could not open link', 'Please try again in a moment.')
    );
  };

  // Prefer the live, localized price from the loaded RevenueCat package; fall
  // back to the constants only when offerings haven't loaded (or RC isn't
  // configured). Avoids showing a price that differs from what's charged.
  const monthlyPkg = packages.find((p) => p.packageType === 'MONTHLY');
  const annualPkg = packages.find((p) => p.packageType === 'ANNUAL');
  const lifetimePkg = packages.find((p) => p.packageType === 'LIFETIME');

  const monthlyPrice = monthlyPkg?.product.priceString ?? `$${PRICE_MONTHLY}`;
  const annualPrice = annualPkg?.product.priceString ?? `$${PRICE_ANNUAL}`;
  const lifetimePrice = lifetimePkg?.product.priceString ?? `$${PRICE_LIFETIME}`;

  // Per-month equivalent for the annual plan — reuse the annual package's own
  // currency formatting so non-USD locales render correctly.
  const annualPerMonth = annualPkg
    ? annualPkg.product.priceString.replace(/[\d.,]+/, (annualPkg.product.price / 12).toFixed(2))
    : `$${(PRICE_ANNUAL / 12).toFixed(2)}`;

  useEffect(() => {
    fetchOfferings();
  }, []);

  const handleSubscribe = async (type: 'monthly' | 'annual') => {
    const pkg = packages.find((p) =>
      type === 'monthly' ? p.packageType === 'MONTHLY' : p.packageType === 'ANNUAL'
    );
    if (!pkg) {
      Alert.alert('Unavailable', 'Subscriptions are not available right now. Please try again in a moment.');
      return;
    }
    try {
      const success = await purchasePackage(pkg);
      if (success) Alert.alert('Welcome to Premium!', 'You now have access to all RYZR features.');
    } catch {
      Alert.alert('Purchase Failed', 'Something went wrong. Please try again.');
    }
  };

  const handleLifetime = async () => {
    if (slotsGone) return;
    if (!lifetimePkg) {
      Alert.alert('Unavailable', 'Lifetime membership is not available right now. Please try again in a moment.');
      return;
    }
    try {
      const ok = await purchaseLifetime();
      if (ok) Alert.alert("You're a Founding Member!", 'Lifetime access is yours.');
    } catch {
      Alert.alert('Purchase Failed', 'Something went wrong. Please try again.');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Header */}
        <View style={{ padding: 24, paddingBottom: 0 }}>
          <Text style={{ color: Colors.text, fontSize: 26, fontWeight: '900' }}>Store</Text>
          <Text style={{ color: Colors.textSecondary, fontSize: 14, marginTop: 2 }}>
            {tab === 'membership' ? 'Unlock your full potential' : 'Gear we use to train'}
          </Text>
        </View>

        {/* Segmented toggle */}
        <View style={{ flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: 12, padding: 4, marginHorizontal: 24, marginTop: 16, borderWidth: 1, borderColor: Colors.border }}>
          {(['membership', 'gear'] as const).map((t) => (
            <TouchableOpacity
              key={t}
              onPress={() => setTab(t)}
              style={{
                flex: 1,
                paddingVertical: 10,
                borderRadius: 8,
                alignItems: 'center',
                backgroundColor: tab === t ? Colors.primary : 'transparent',
              }}
            >
              <Text style={{ color: tab === t ? '#000' : Colors.textSecondary, fontWeight: '800', fontSize: 14 }}>
                {t === 'membership' ? 'Membership' : 'Gear'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === 'membership' && (
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
                  {/* Lifetime founding member — shown when slots remain */}
                  {!slotsGone && (
                    <TouchableOpacity
                      onPress={handleLifetime}
                      disabled={loading}
                      style={{
                        backgroundColor: Colors.primary,
                        borderRadius: 16,
                        padding: 20,
                        position: 'relative',
                      }}
                    >
                      <View style={{ position: 'absolute', top: -12, right: 16, backgroundColor: '#000', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                        <Text style={{ color: Colors.primary, fontSize: 11, fontWeight: '800' }}>🔥 {lifetimeSlotsRemaining} OF {LIFETIME_SLOTS_TOTAL} LEFT</Text>
                      </View>
                      {loading ? <ActivityIndicator color="#000" /> : (
                        <>
                          <Text style={{ color: '#000', fontSize: 20, fontWeight: '900' }}>Founding Member</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                            <Text style={{ color: '#000', fontSize: 32, fontWeight: '900' }}>{lifetimePrice}</Text>
                            <Text style={{ color: '#00000099', fontSize: 14 }}>one-time</Text>
                          </View>
                          <Text style={{ color: '#00000088', fontSize: 13, marginTop: 2 }}>Pay once · lifetime access · first 100 only</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}

                  {/* Annual — best value */}
                  <TouchableOpacity
                    onPress={() => handleSubscribe('annual')}
                    disabled={loading}
                    style={{
                      backgroundColor: slotsGone ? Colors.primary + '11' : Colors.surface,
                      borderRadius: 16,
                      padding: 20,
                      borderWidth: slotsGone ? 2 : 1,
                      borderColor: slotsGone ? Colors.primary : Colors.border,
                      position: 'relative',
                    }}
                  >
                    {slotsGone && (
                      <View style={{ position: 'absolute', top: -12, right: 16, backgroundColor: Colors.primary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                        <Text style={{ color: '#000', fontSize: 11, fontWeight: '800' }}>BEST VALUE — SAVE 50%</Text>
                      </View>
                    )}
                    <Text style={{ color: Colors.text, fontSize: 20, fontWeight: '900' }}>Annual Plan</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                      <Text style={{ color: slotsGone ? Colors.primary : Colors.text, fontSize: 32, fontWeight: '900' }}>{annualPrice}</Text>
                      <Text style={{ color: Colors.textSecondary, fontSize: 14 }}>/ year</Text>
                    </View>
                    <Text style={{ color: Colors.muted, fontSize: 13, marginTop: 2 }}>{annualPerMonth}/month billed annually</Text>
                  </TouchableOpacity>

                  {/* Monthly */}
                  <TouchableOpacity
                    onPress={() => handleSubscribe('monthly')}
                    disabled={loading}
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
                      <Text style={{ color: Colors.text, fontSize: 32, fontWeight: '900' }}>{monthlyPrice}</Text>
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
        )}

        {tab === 'gear' && (
          <View style={{ padding: 24 }}>
            <Text style={{ color: Colors.text, fontSize: 15, lineHeight: 22, marginBottom: 20 }}>
              Make Form Coach work its best. These are the tripods, lights, and training
              tools we recommend — tap to view on Amazon.
            </Text>

            {gearLoading ? (
              <ActivityIndicator color={Colors.primary} style={{ marginTop: 20 }} />
            ) : gearSections.length === 0 ? (
              <Text style={{ color: Colors.muted, fontSize: 14, textAlign: 'center', marginTop: 20, lineHeight: 20 }}>
                No gear yet — check back soon.
              </Text>
            ) : (
              <>
              {gearSections.map((section) => (
              <View key={section.title} style={{ marginBottom: 24 }}>
                <Text style={{ color: Colors.textSecondary, fontSize: 12, fontWeight: '800', letterSpacing: 1, marginBottom: 12, textTransform: 'uppercase' }}>
                  {section.title}
                </Text>
                <View style={{ gap: 12 }}>
                  {section.items.map((item) => (
                    <View
                      key={item.asin}
                      style={{ flexDirection: 'row', gap: 14, alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border }}
                    >
                      <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: Colors.primary + '22', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Ionicons name={item.icon} size={24} color={Colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: Colors.text, fontWeight: '700', fontSize: 15 }}>{item.name}</Text>
                        <Text style={{ color: Colors.textSecondary, fontSize: 13, marginTop: 2, lineHeight: 18 }}>{item.desc}</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => openGearLink(item.asin)}
                        style={{ backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, flexShrink: 0 }}
                      >
                        <Text style={{ color: '#000', fontWeight: '800', fontSize: 13 }}>View</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </View>
              ))}

              {/* FTC affiliate disclosure — legally required */}
              <Text style={{ color: Colors.muted, fontSize: 11, textAlign: 'center', lineHeight: 16, marginTop: 4 }}>
                RYZR may earn a commission from purchases made through these links, at no
                extra cost to you. As an Amazon Associate we earn from qualifying purchases.
              </Text>
              </>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
