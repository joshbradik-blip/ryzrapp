// Post-workout "Refuel" card: affiliate picks from the Recovery & Fuel section
// of gear_products, rotating through them.
//
// - Each completed workout starts on the next product (persisted counter), so
//   users don't see the same pick every time.
// - While on screen it slowly cross-fades to the next product. Fixed height,
//   so the rest of the screen never shifts. No auto-rotation when the OS
//   "Reduce Motion" setting is on.
// - Renders nothing until products load (or if there are none).

import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { openAmazonProduct, REFUEL_SECTION } from '../../lib/gear';
import { SectionLabel } from '../ui/SectionLabel';

interface RefuelPick {
  name: string;
  description: string;
  asin: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const ROTATION_KEY = 'refuel_rotation_v1';
const ROTATE_EVERY_MS = 7000;
const FADE_MS = 350;
const CARD_HEIGHT = 96;

export function RefuelCard({ style }: { style?: ViewStyle }) {
  const [picks, setPicks] = useState<RefuelPick[]>([]);
  const [index, setIndex] = useState(0);
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('gear_products')
        .select('name, description, asin, icon')
        .eq('section', REFUEL_SECTION)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (!active || !data || data.length === 0) return;
      const count = Number(await AsyncStorage.getItem(ROTATION_KEY).catch(() => null)) || 0;
      AsyncStorage.setItem(ROTATION_KEY, String(count + 1)).catch(() => {});
      if (!active) return;
      setIndex(count % data.length);
      setPicks(data as RefuelPick[]);
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (picks.length < 2) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduceMotion) => {
        if (cancelled || reduceMotion) return;
        timer = setInterval(() => {
          Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(() => {
            setIndex((i) => (i + 1) % picks.length);
            Animated.timing(opacity, { toValue: 1, duration: FADE_MS, useNativeDriver: true }).start();
          });
        }, ROTATE_EVERY_MS);
      });
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [picks.length]);

  const pick = picks[index];
  if (!pick) return null;

  return (
    <View style={[{ width: '100%' }, style]}>
      <SectionLabel style={{ marginBottom: 8 }}>Refuel</SectionLabel>
      <View style={{ height: CARD_HEIGHT, backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' }}>
        <Animated.View style={{ flex: 1, flexDirection: 'row', gap: 14, alignItems: 'center', padding: 16, opacity }}>
          <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: Colors.primary + '22', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Ionicons name={pick.icon} size={24} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ color: Colors.text, fontWeight: '700', fontSize: 15 }}>{pick.name}</Text>
            <Text numberOfLines={2} style={{ color: Colors.textSecondary, fontSize: 13, marginTop: 2, lineHeight: 18 }}>{pick.description}</Text>
          </View>
          <TouchableOpacity
            onPress={() => openAmazonProduct(pick.asin)}
            accessibilityLabel={`View ${pick.name} on Amazon`}
            style={{ backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12, flexShrink: 0 }}
          >
            <Text style={{ color: '#000', fontWeight: '800', fontSize: 13 }}>View</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
      {picks.length > 1 && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 8 }}>
          {picks.map((p, i) => (
            <View
              key={p.asin}
              style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: i === index ? Colors.primary : Colors.border }}
            />
          ))}
        </View>
      )}
      <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 6, textAlign: 'center' }}>
        Affiliate link — as an Amazon Associate RYZR earns from qualifying purchases.
      </Text>
    </View>
  );
}
