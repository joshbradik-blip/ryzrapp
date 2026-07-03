import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import Svg, { Defs, RadialGradient, Stop, Ellipse } from 'react-native-svg';
import { Colors } from '../../constants/theme';
import { fetchReferralStatus, buildInviteMessage, ReferralStatus } from '../../lib/referrals';

const HAIRLINE = 'rgba(255,255,255,0.07)';
const MUTE = 'rgba(255,255,255,0.5)';

const TIERS = [
  { at: 1, reward: '1 month free' },
  { at: 3, reward: '3 months free' },
  { at: 5, reward: 'Lifetime Pro' },
];

const cardStyle = {
  backgroundColor: Colors.surface,
  borderWidth: 1,
  borderColor: HAIRLINE,
  borderRadius: 20,
  padding: 20,
} as const;

function ProgressCard({ conversions }: { conversions: number }) {
  const nextAt = conversions < 1 ? 1 : conversions < 3 ? 3 : 5;
  const nextLabel = conversions < 1 ? '1 month free' : conversions < 3 ? '3 months free' : 'Lifetime Pro';
  const pct = Math.min(100, (conversions / nextAt) * 100);

  const width = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(width, { toValue: pct, duration: 400, useNativeDriver: false }).start();
  }, [pct]);

  return (
    <View style={{ ...cardStyle, marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
        <Text style={{ fontSize: 12, fontWeight: '600', letterSpacing: 1.4, color: MUTE }}>NEXT REWARD</Text>
        <Text style={{ fontSize: 13, color: Colors.primary, fontWeight: '700' }}>{nextLabel}</Text>
      </View>
      <Text style={{ fontSize: 17, marginBottom: 12 }}>
        <Text style={{ color: Colors.primary, fontWeight: '700' }}>{conversions}</Text>
        <Text style={{ color: MUTE, fontWeight: '500' }}> of {nextAt} friends joined</Text>
      </Text>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
        <Animated.View
          style={{
            height: '100%',
            borderRadius: 4,
            backgroundColor: Colors.primary,
            width: width.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
          }}
        />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
        {TIERS.map((tier) => {
          const hit = conversions >= tier.at;
          return (
            <View
              key={tier.at}
              style={{
                flex: 1,
                borderRadius: 12,
                paddingVertical: 10,
                paddingHorizontal: 8,
                alignItems: 'center',
                backgroundColor: hit ? 'rgba(255,107,34,0.1)' : 'rgba(255,255,255,0.03)',
                borderWidth: 1,
                borderColor: hit ? 'rgba(255,107,34,0.45)' : HAIRLINE,
              }}
            >
              <Text style={{ fontSize: 17, fontWeight: '800', color: hit ? Colors.primary : Colors.text }}>{tier.at}</Text>
              <Text style={{ fontSize: 11, color: hit ? Colors.flame : MUTE, marginTop: 3, lineHeight: 14, textAlign: 'center' }}>
                {tier.reward}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function FriendsCard({ invitees }: { invitees: ReferralStatus['invitees'] }) {
  if (invitees.length === 0) return null;
  return (
    <View style={{ ...cardStyle, paddingVertical: 8 }}>
      {invitees.map((f, i) => {
        const done = f.status === 'converted';
        return (
          <View
            key={`${f.name}-${f.joined_at}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
              paddingVertical: 14,
              borderTopWidth: i ? 1 : 0,
              borderTopColor: HAIRLINE,
            }}
          >
            <View
              style={{
                width: 40, height: 40, borderRadius: 20,
                backgroundColor: 'rgba(255,255,255,0.07)',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: '700', color: 'rgba(255,255,255,0.8)' }}>
                {f.name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15.5, fontWeight: '600', color: Colors.text }}>{f.name}</Text>
              <Text style={{ fontSize: 12.5, color: MUTE, marginTop: 2 }}>
                {done ? 'Finished first workout' : 'Signed up · not started'}
              </Text>
            </View>
            <Text style={{ fontSize: 12, fontWeight: '700', color: done ? Colors.primary : MUTE }}>
              {done ? '+1 month' : 'Pending'}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export function ReferralScreen() {
  const navigation = useNavigation();
  const [status, setStatus] = useState<ReferralStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setError(false);
    if (!status) setLoading(true);
    try {
      setStatus(await fetchReferralStatus());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  const handleCopy = async () => {
    if (!status) return;
    await Clipboard.setStringAsync(status.code);
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1600);
  };

  const handleShare = () => {
    if (!status) return;
    Share.share({ message: buildInviteMessage(status.code) });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }} edges={['top']}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14 }}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{
            width: 40, height: 40, borderRadius: 20,
            backgroundColor: 'rgba(255,255,255,0.05)',
            borderWidth: 1, borderColor: HAIRLINE,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Ionicons name="arrow-back" size={18} color="rgba(255,255,255,0.75)" />
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: '700', color: Colors.text }}>Refer a friend</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}>
        {/* Hero */}
        <View style={{ alignItems: 'center', paddingTop: 18, paddingBottom: 26, paddingHorizontal: 8 }}>
          <Svg
            pointerEvents="none"
            style={{ position: 'absolute', top: -40, left: -60, right: -60, height: 280 }}
            width="100%"
            height={280}
          >
            <Defs>
              <RadialGradient id="emberGlow" cx="50%" cy="30%" rx="55%" ry="65%">
                <Stop offset="0" stopColor={Colors.primary} stopOpacity={0.18} />
                <Stop offset="0.7" stopColor={Colors.primary} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Ellipse cx="50%" cy="30%" rx="55%" ry="65%" fill="url(#emberGlow)" />
          </Svg>
          <View
            style={{
              width: 74, height: 74, borderRadius: 37, marginBottom: 18,
              backgroundColor: 'rgba(255,107,34,0.12)',
              borderWidth: 1, borderColor: 'rgba(255,107,34,0.4)',
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Ionicons name="gift-outline" size={34} color={Colors.primary} />
          </View>
          <Text style={{ fontSize: 30, fontWeight: '800', lineHeight: 34, letterSpacing: -0.6, color: Colors.text, textAlign: 'center' }}>
            Give a month,{'\n'}get a month
          </Text>
          <Text style={{ color: MUTE, fontSize: 15.5, lineHeight: 22, marginTop: 12, textAlign: 'center' }}>
            Friends get their first month of RYZR Pro free. You get a free month when they finish their first workout.
          </Text>
        </View>

        {/* Invite code card */}
        <View style={{ ...cardStyle, alignItems: 'center', marginBottom: 14 }}>
          {loading ? (
            <ActivityIndicator color={Colors.primary} style={{ paddingVertical: 40 }} />
          ) : error || !status ? (
            <View style={{ alignItems: 'center', paddingVertical: 12 }}>
              <Text style={{ color: MUTE, fontSize: 14, marginBottom: 14 }}>Couldn't load your invite code.</Text>
              <TouchableOpacity
                onPress={load}
                style={{
                  paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14,
                  backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: HAIRLINE,
                }}
              >
                <Text style={{ color: Colors.text, fontSize: 15.5, fontWeight: '600' }}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={{ fontSize: 12, fontWeight: '600', letterSpacing: 1.4, color: MUTE }}>YOUR INVITE CODE</Text>
              <Text style={{ fontSize: 32, fontWeight: '800', letterSpacing: 4.5, color: Colors.primary, marginTop: 12, marginBottom: 16 }}>
                {status.code}
              </Text>
              <View style={{ flexDirection: 'row', gap: 10, alignSelf: 'stretch' }}>
                <TouchableOpacity
                  onPress={handleCopy}
                  style={{
                    flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center',
                    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: HAIRLINE,
                  }}
                >
                  <Text style={{ color: Colors.text, fontSize: 15.5, fontWeight: '600' }}>
                    {copied ? 'Copied ✓' : 'Copy code'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleShare}
                  style={{
                    flex: 1.4, paddingVertical: 14, borderRadius: 14, alignItems: 'center',
                    backgroundColor: Colors.primary,
                  }}
                >
                  <Text style={{ color: '#000', fontSize: 15.5, fontWeight: '700' }}>Share invite link</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        {status && !error && (
          <>
            <ProgressCard conversions={status.conversions} />
            <FriendsCard invitees={status.invitees} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
