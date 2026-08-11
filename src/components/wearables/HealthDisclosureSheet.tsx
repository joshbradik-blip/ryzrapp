// Prominent disclosure shown BEFORE the OS health permission prompt.
//
// Required by Google Play's Health Connect policy (and Apple's health-data
// guidelines): the user must be told which data types are read and what each
// one is used for before the system dialog appears. It also doubles as the
// answer to Play review's "we could not determine how your app uses these
// permissions" — every declared permission maps to a row here.
//
// Keep ROWS in sync with the request list in src/lib/healthProvider.ts and the
// android.permissions array in app.json.

import React from 'react';
import { View, Text, Modal, ScrollView, TouchableOpacity, Linking, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/theme';
import { PRIVACY_URL } from '../ui/SubscriptionTerms';

type Row = {
  icon: keyof typeof Ionicons.glyphMap;
  data: string;
  use: string;
};

const ROWS: Row[] = [
  {
    icon: 'moon-outline',
    data: 'Sleep, resting heart rate & heart-rate variability',
    use: 'Calculates your daily recovery-readiness score, which tells you whether to push hard or back off today and adjusts your workout intensity.',
  },
  {
    icon: 'footsteps-outline',
    data: 'Steps & active calories burned',
    use: 'Shows your daily activity and powers the energy-balance card that compares calories burned against calories eaten.',
  },
  {
    icon: 'body-outline',
    data: 'Body weight & body fat percentage',
    use: 'Tracks your body-composition trend on the Progress tab and drives the Future Self physique projection.',
  },
];

interface Props {
  visible: boolean;
  hubName: string;
  onCancel: () => void;
  onContinue: () => void;
}

export function HealthDisclosureSheet({ visible, hubName, onCancel, onContinue }: Props) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: '#000000CC', justifyContent: 'flex-end' }}>
        <View style={{
          backgroundColor: Colors.background,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          maxHeight: '88%',
          borderTopWidth: 1,
          borderColor: Colors.border,
        }}>
          <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 12 }}>
            <View style={{
              width: 56, height: 56, borderRadius: 28, alignSelf: 'center',
              backgroundColor: Colors.primary + '22', alignItems: 'center', justifyContent: 'center',
              borderWidth: 2, borderColor: Colors.primary, marginBottom: 16,
            }}>
              <Ionicons name="shield-checkmark-outline" size={28} color={Colors.primary} />
            </View>

            <Text style={{ color: Colors.text, fontSize: 22, fontWeight: '900', textAlign: 'center' }}>
              How RYZR uses your health data
            </Text>
            <Text style={{ color: Colors.textSecondary, fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 }}>
              RYZR reads the following from {hubName} to personalize your training. Read-only —
              RYZR never writes to or changes your health records.
            </Text>

            <View style={{ gap: 16, marginTop: 24 }}>
              {ROWS.map((row) => (
                <View key={row.data} style={{
                  flexDirection: 'row', gap: 14, alignItems: 'flex-start',
                  backgroundColor: Colors.surface, borderRadius: 14, padding: 16,
                  borderWidth: 1, borderColor: Colors.border,
                }}>
                  <View style={{
                    width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                    backgroundColor: Colors.primary + '22', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Ionicons name={row.icon} size={20} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: Colors.text, fontWeight: '700', fontSize: 14, lineHeight: 19 }}>
                      {row.data}
                    </Text>
                    <Text style={{ color: Colors.textSecondary, fontSize: 13, marginTop: 4, lineHeight: 18 }}>
                      {row.use}
                    </Text>
                  </View>
                </View>
              ))}
            </View>

            <Text style={{ color: Colors.muted, fontSize: 12, lineHeight: 18, marginTop: 20 }}>
              Your health data is stored in your own RYZR account, is never sold, and is never
              shared with advertisers or third parties. You can disconnect {hubName} at any time
              from this screen, and revoke access in {hubName} itself.
            </Text>

            <TouchableOpacity onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})} style={{ paddingVertical: 12 }}>
              <Text style={{ color: Colors.primary, fontSize: 13, fontWeight: '700', textAlign: 'center', textDecorationLine: 'underline' }}>
                Read our Privacy Policy
              </Text>
            </TouchableOpacity>
          </ScrollView>

          <View style={{ padding: 24, paddingTop: 4, gap: 10 }}>
            <TouchableOpacity
              onPress={onContinue}
              style={{ backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 15, alignItems: 'center' }}
            >
              <Text style={{ color: '#000', fontWeight: '800', fontSize: 15 }}>
                Continue to {hubName}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onCancel} style={{ paddingVertical: 12, alignItems: 'center' }}>
              <Text style={{ color: Colors.textSecondary, fontWeight: '700', fontSize: 14 }}>Not now</Text>
            </TouchableOpacity>
            {Platform.OS === 'android' && (
              <Text style={{ color: Colors.muted, fontSize: 11, textAlign: 'center', lineHeight: 16 }}>
                You'll choose exactly which data types to share on the next screen.
              </Text>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}
