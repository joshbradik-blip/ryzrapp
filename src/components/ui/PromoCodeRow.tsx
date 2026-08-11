// In-app promo / offer code redemption, so users don't have to leave for the
// App Store or Play Store to use a code like RYZR30.
//
// iOS gets StoreKit's real in-app redemption sheet. Android has no equivalent
// API — the Play Store redeem page is the only path Google offers — so we take
// the code here and deep-link it pre-filled. Either way the purchase lands in
// RevenueCat, so we re-check entitlements when the app comes back to the front.

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Platform, Alert, AppState } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/theme';
import { useSubscriptionStore } from '../../store/subscriptionStore';

export function PromoCodeRow() {
  const { redeemCode, checkPremium, restorePurchases } = useSubscriptionStore();
  const [expanded, setExpanded] = useState(false);
  const [code, setCode] = useState('');
  const awaiting = useRef(false);

  // Neither store reports the outcome back to us, so the only reliable signal
  // that a code was redeemed is the app returning to the foreground.
  //
  // iOS redeems in-app, so RevenueCat's transaction listener already saw the
  // purchase and getCustomerInfo() reflects it. Android redeems in the Play
  // Store — a subscription bought outside the app that getCustomerInfo()'s
  // cache doesn't know about yet — so it needs a real sync, not a cache read.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && awaiting.current) {
        awaiting.current = false;
        (Platform.OS === 'android' ? restorePurchases() : checkPremium()).catch(() => {});
      }
    });
    return () => sub.remove();
  }, [checkPremium, restorePurchases]);

  const redeem = async (value?: string) => {
    try {
      awaiting.current = true;
      await redeemCode(value);
      setExpanded(false);
      setCode('');
    } catch {
      awaiting.current = false;
      Alert.alert(
        'Could not open redemption',
        Platform.OS === 'ios'
          ? 'Please try again, or redeem your code in the App Store under your account.'
          : 'Please try again, or redeem your code in the Play Store under Payments & subscriptions.',
      );
    }
  };

  const onPress = () => {
    // iOS opens the native sheet straight away — it can't be pre-filled, so
    // asking for the code here first would just make the user type it twice.
    if (Platform.OS === 'ios') redeem();
    else setExpanded((prev) => !prev);
  };

  return (
    <View style={{ marginTop: 4 }}>
      <TouchableOpacity
        onPress={onPress}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12 }}
      >
        <Ionicons name="pricetag-outline" size={15} color={Colors.primary} />
        <Text style={{ color: Colors.primary, fontSize: 14, fontWeight: '700' }}>Have a promo code?</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
          <TextInput
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase())}
            placeholder="Enter code"
            placeholderTextColor={Colors.muted}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={() => code.trim() && redeem(code)}
            style={{
              flex: 1,
              backgroundColor: Colors.surface,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: Colors.border,
              paddingHorizontal: 16,
              paddingVertical: 13,
              color: Colors.text,
              fontSize: 15,
              fontWeight: '700',
              letterSpacing: 1,
            }}
          />
          <TouchableOpacity
            onPress={() => redeem(code)}
            disabled={!code.trim()}
            style={{
              backgroundColor: code.trim() ? Colors.primary : Colors.surface2,
              borderRadius: 12,
              paddingHorizontal: 22,
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: code.trim() ? '#000' : Colors.muted, fontWeight: '800', fontSize: 14 }}>Redeem</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
