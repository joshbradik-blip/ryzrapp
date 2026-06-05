import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/theme';
import {
  useSubscriptionStore,
  PRICE_MONTHLY,
  PRICE_ANNUAL,
  PRICE_LIFETIME,
  LIFETIME_SLOTS_TOTAL,
} from '../../store/subscriptionStore';

const FEATURES = [
  { icon: 'hardware-chip-outline' as const, text: 'AI plans: 4, 8, and 12-week' },
  { icon: 'refresh-outline' as const,       text: 'Unlimited plan regeneration' },
  { icon: 'camera-outline' as const,        text: 'Form Coach — real-time camera analysis' },
  { icon: 'chatbubble-ellipses-outline' as const, text: 'AI Coach chat (Ask me anything)' },
  { icon: 'trending-up-outline' as const,   text: 'Advanced analytics & charts' },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Optional headline shown above features, e.g. "Form Coach is Premium" */
  featureTitle?: string;
}

export function PremiumModal({ visible, onClose, featureTitle }: Props) {
  const { lifetimeSlotsRemaining, loading, purchasePackage, purchaseLifetime, packages, restorePurchases } =
    useSubscriptionStore();

  const slotsGone = lifetimeSlotsRemaining <= 0;

  const handleMonthly = async () => {
    const pkg = packages.find((p) => p.packageType === 'MONTHLY');
    if (!pkg) {
      Alert.alert('Unable to load products', 'Please check your connection and try again.');
      return;
    }
    const ok = await purchasePackage(pkg);
    if (ok) { Alert.alert('Welcome to RYZR Premium! 🎉'); onClose(); }
  };

  const handleAnnual = async () => {
    const pkg = packages.find((p) => p.packageType === 'ANNUAL');
    if (!pkg) {
      Alert.alert('Unable to load products', 'Please check your connection and try again.');
      return;
    }
    const ok = await purchasePackage(pkg);
    if (ok) { Alert.alert('Welcome to RYZR Premium! 🎉'); onClose(); }
  };

  const handleLifetime = async () => {
    if (slotsGone) return;
    const ok = await purchaseLifetime();
    if (ok) { Alert.alert('You\'re a RYZR Founding Member! 🏆', 'Lifetime access is yours.'); onClose(); }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' }}>
        <View style={{
          backgroundColor: Colors.surface,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          maxHeight: '90%',
        }}>
          <ScrollView
            contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Handle */}
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 20 }} />

            {/* Close */}
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={{ position: 'absolute', top: 16, right: 16 }}
            >
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>

            {/* Lifetime counter — shown only when slots remain */}
            {!slotsGone && (
              <View style={{
                backgroundColor: Colors.primary + '15',
                borderRadius: 16,
                padding: 14,
                borderWidth: 1,
                borderColor: Colors.primary + '55',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                marginBottom: 20,
              }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primary + '25', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 22 }}>🔥</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: Colors.primary, fontWeight: '900', fontSize: 15 }}>
                    {lifetimeSlotsRemaining} of {LIFETIME_SLOTS_TOTAL} founding spots left
                  </Text>
                  <Text style={{ color: Colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                    $100 lifetime — first 100 subscribers only
                  </Text>
                </View>
              </View>
            )}

            {/* Icon + title */}
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <View style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: Colors.primary + '22', borderWidth: 2, borderColor: Colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <Ionicons name="flash" size={34} color={Colors.primary} />
              </View>
              {featureTitle ? (
                <>
                  <Text style={{ color: Colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 4 }}>PREMIUM FEATURE</Text>
                  <Text style={{ color: Colors.text, fontSize: 22, fontWeight: '900', textAlign: 'center' }}>{featureTitle}</Text>
                </>
              ) : (
                <Text style={{ color: Colors.text, fontSize: 22, fontWeight: '900' }}>Upgrade to Premium</Text>
              )}
            </View>

            {/* Feature list */}
            <View style={{ gap: 10, marginBottom: 24 }}>
              {FEATURES.map((f) => (
                <View key={f.text} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Ionicons name={f.icon} size={18} color={Colors.primary} />
                  <Text style={{ color: Colors.text, fontSize: 14, flex: 1 }}>{f.text}</Text>
                </View>
              ))}
            </View>

            {/* Pricing buttons */}
            <View style={{ gap: 10 }}>
              {/* Lifetime — highlighted when available */}
              {!slotsGone && (
                <TouchableOpacity
                  onPress={handleLifetime}
                  disabled={loading}
                  style={{
                    backgroundColor: Colors.primary,
                    borderRadius: 14,
                    padding: 16,
                    alignItems: 'center',
                  }}
                >
                  {loading ? (
                    <ActivityIndicator color="#000" />
                  ) : (
                    <>
                      <Text style={{ color: '#000', fontWeight: '900', fontSize: 16 }}>
                        Founding Member — $100 Lifetime
                      </Text>
                      <Text style={{ color: '#00000088', fontSize: 12, marginTop: 2 }}>
                        {lifetimeSlotsRemaining} spots remaining · Pay once, keep forever
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
                  backgroundColor: slotsGone ? Colors.primary : Colors.surface2,
                  borderRadius: 14,
                  padding: 16,
                  alignItems: 'center',
                  borderWidth: slotsGone ? 2 : 1,
                  borderColor: slotsGone ? Colors.primary : Colors.border,
                }}
              >
                <Text style={{ color: slotsGone ? '#000' : Colors.text, fontWeight: '800', fontSize: 15 }}>
                  Annual — ${PRICE_ANNUAL}/yr
                </Text>
                <Text style={{ color: slotsGone ? '#00000099' : Colors.muted, fontSize: 12, marginTop: 2 }}>
                  ${(PRICE_ANNUAL / 12).toFixed(2)}/mo · Save 50%
                </Text>
              </TouchableOpacity>

              {/* Monthly */}
              <TouchableOpacity
                onPress={handleMonthly}
                disabled={loading}
                style={{
                  backgroundColor: Colors.surface2,
                  borderRadius: 14,
                  padding: 16,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: Colors.border,
                }}
              >
                <Text style={{ color: Colors.text, fontWeight: '800', fontSize: 15 }}>
                  Monthly — ${PRICE_MONTHLY}/mo
                </Text>
                <Text style={{ color: Colors.muted, fontSize: 12, marginTop: 2 }}>Cancel anytime</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={restorePurchases} style={{ alignItems: 'center', paddingVertical: 14 }}>
              <Text style={{ color: Colors.muted, fontSize: 13 }}>Restore purchases</Text>
            </TouchableOpacity>

            <Text style={{ color: Colors.muted, fontSize: 11, textAlign: 'center', lineHeight: 16 }}>
              Subscriptions auto-renew. Cancel anytime in your App Store or Google Play settings.
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
