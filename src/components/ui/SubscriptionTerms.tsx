import React from 'react';
import { View, Text, TouchableOpacity, Linking, StyleProp, ViewStyle } from 'react-native';
import { Colors } from '../../constants/theme';

// Legal URLs (already live on GitHub Pages). Centralized here so every point of
// purchase links to the same Terms of Use (EULA) and Privacy Policy.
export const TERMS_URL = 'https://joshbradik-blip.github.io/ryzr-privacy/terms-of-service.html';
export const PRIVACY_URL = 'https://joshbradik-blip.github.io/ryzr-privacy/privacy-policy.html';

// Apple App Store Review Guideline 3.1.2 auto-renew disclosure. Required, verbatim,
// at the point of purchase for auto-renewable subscriptions.
export const AUTO_RENEW_DISCLOSURE =
  'Payment will be charged to your Apple Account at confirmation of purchase. ' +
  'Your subscription automatically renews unless it is canceled at least 24 hours ' +
  'before the end of the current period. Your account will be charged for renewal ' +
  'within 24 hours prior to the end of the current period. You can manage or cancel ' +
  'your subscription in your App Store account settings.';

// Required alongside the auto-renew text whenever a free trial is on offer:
// 3.1.2 wants the conversion and its price disclosed at the point of purchase.
// Deliberately does not name a price — each plan card above states its own, and
// a screen offering both monthly and annual would otherwise need to name two.
export const TRIAL_DISCLOSURE =
  'Free trials convert to a paid subscription at the price shown above unless ' +
  'cancelled at least 24 hours before the trial ends. Any unused portion of a ' +
  'trial is forfeited when you purchase a subscription.';

/**
 * Auto-renewal disclosure + Terms/Privacy links shown beneath the subscription
 * purchase buttons on every paywall. Satisfies App Store Guideline 3.1.2.
 * Not shown for the Lifetime one-time purchase (it is a non-consumable).
 *
 * Pass `hasTrial` on any paywall currently offering a free trial.
 */
export function SubscriptionTerms({
  style,
  hasTrial = false,
}: {
  style?: StyleProp<ViewStyle>;
  hasTrial?: boolean;
}) {
  return (
    <View style={[{ marginTop: 4 }, style]}>
      {hasTrial && (
        <Text
          style={{
            color: Colors.muted,
            fontSize: 11,
            textAlign: 'center',
            lineHeight: 16,
            marginBottom: 8,
          }}
        >
          {TRIAL_DISCLOSURE}
        </Text>
      )}
      <Text style={{ color: Colors.muted, fontSize: 11, textAlign: 'center', lineHeight: 16 }}>
        {AUTO_RENEW_DISCLOSURE}
      </Text>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 10 }}>
        <TouchableOpacity onPress={() => Linking.openURL(TERMS_URL)}>
          <Text style={{ color: Colors.muted, fontSize: 11, textDecorationLine: 'underline' }}>Terms of Use</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => Linking.openURL(PRIVACY_URL)}>
          <Text style={{ color: Colors.muted, fontSize: 11, textDecorationLine: 'underline' }}>Privacy Policy</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
