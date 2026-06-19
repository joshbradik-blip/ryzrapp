import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/theme';
import { useWearablesStore } from '../../store/wearablesStore';
import { useBodyStore } from '../../store/bodyStore';
import { useProfileStore } from '../../store/profileStore';
import { useAuthStore } from '../../store/authStore';
import { kgToDisplay, weightLabel } from '../../lib/units';
import { Health, WeightSample } from '../../lib/health';

type Brand = {
  id: string;
  name: string;
  desc: string;
  icon: keyof typeof Ionicons.glyphMap;
};

// The OS health hub — the primary, real integration point.
const HUB = Platform.OS === 'ios'
  ? { id: 'apple_health', name: 'Apple Health', icon: 'heart-outline' as const,
      sub: 'Sync steps, weight & heart rate from iPhone and Apple Watch' }
  : { id: 'health_connect', name: 'Health Connect', icon: 'fitness-outline' as const,
      sub: 'Sync steps, weight & activity from your Android health apps' };

// Brands that feed the hub. Linking is a preference today; data flows via the hub.
const BRANDS: Brand[] = [
  ...(Platform.OS === 'ios'
    ? [{ id: 'apple_watch', name: 'Apple Watch', desc: 'Live heart rate & workout tracking', icon: 'watch-outline' as const }]
    : []),
  { id: 'fitbit', name: 'Fitbit',    desc: 'Steps, heart rate, sleep & recovery', icon: 'watch-outline' },
  { id: 'garmin', name: 'Garmin',    desc: 'Training load, HR & sleep',          icon: 'watch-outline' },
  { id: 'whoop',  name: 'WHOOP',     desc: 'Recovery, strain & sleep coaching',  icon: 'pulse-outline' },
  { id: 'oura',   name: 'Oura Ring', desc: 'Readiness, sleep & HRV',             icon: 'ellipse-outline' },
];

export function WearablesScreen() {
  const { connected, toggle, disconnect } = useWearablesStore();
  const profile = useProfileStore((s) => s.profile);
  const userId = useAuthStore((s) => s.session?.user?.id);

  const available = Health.isAvailable();
  const hubConnected = connected.includes(HUB.id);

  const [steps, setSteps] = useState<number | null>(null);
  const [weight, setWeight] = useState<WeightSample | null>(null);
  const [syncing, setSyncing] = useState(false);

  const unit = profile?.weight_unit ?? 'kg';

  // Pull steps + latest weight from the OS hub, and auto-log new weight readings
  // into the existing bodyweight chart.
  const refresh = useCallback(async () => {
    if (!Health.isAvailable()) return;
    setSyncing(true);
    try {
      const [s, w] = await Promise.all([Health.getTodaySteps(), Health.getLatestWeightKg()]);
      setSteps(s);
      setWeight(w);
      if (w && userId) {
        const latest = useBodyStore.getState().latest;
        const changed = !latest || latest.weight_kg == null || Math.abs(latest.weight_kg - w.kg) > 0.1;
        if (changed) {
          await useBodyStore.getState().logMeasurement(userId, {
            weight_kg: parseFloat(w.kg.toFixed(1)),
            neck_cm: null, waist_cm: null, hip_cm: null, body_fat_pct: null,
          });
        }
      }
    } finally {
      setSyncing(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) useBodyStore.getState().fetchMeasurements(userId);
    if (available && hubConnected) refresh();
  }, [userId]);

  const connectHub = async () => {
    const ok = await Health.requestPermissions();
    if (ok) {
      if (!connected.includes(HUB.id)) toggle(HUB.id);
      refresh();
    } else {
      Alert.alert('Permission needed', `Allow RYZR to read your data in the ${HUB.name} permission screen to enable sync.`);
    }
  };

  const disconnectHub = () => {
    Alert.alert(`Disconnect ${HUB.name}?`, 'RYZR will stop syncing your health data.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Disconnect', style: 'destructive', onPress: () => { disconnect(HUB.id); setSteps(null); setWeight(null); } },
    ]);
  };

  const onPressBrand = (brand: Brand) => {
    if (connected.includes(brand.id)) {
      Alert.alert(`Disconnect ${brand.name}?`, 'RYZR will stop using data from this device.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Disconnect', style: 'destructive', onPress: () => disconnect(brand.id) },
      ]);
    } else {
      toggle(brand.id);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
        {/* ── Health hub hero ── */}
        <View style={{
          backgroundColor: Colors.surface, borderRadius: 18, padding: 18,
          borderWidth: 1, borderColor: hubConnected ? Colors.primary : Colors.border, marginBottom: 12,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.primary + '22', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={HUB.icon} size={26} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: Colors.text, fontWeight: '800', fontSize: 16 }}>{HUB.name}</Text>
              <Text style={{ color: Colors.textSecondary, fontSize: 13, marginTop: 2, lineHeight: 18 }}>{HUB.sub}</Text>
            </View>
            {!available && (
              <View style={{ backgroundColor: Colors.surface2, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                <Text style={{ color: Colors.muted, fontSize: 11, fontWeight: '800' }}>SOON</Text>
              </View>
            )}
          </View>

          {/* Live sync panel */}
          {available && hubConnected && (
            <>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                <View style={{ flex: 1, backgroundColor: Colors.surface2, borderRadius: 12, padding: 14 }}>
                  <Text style={{ color: Colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>STEPS TODAY</Text>
                  <Text style={{ color: Colors.text, fontSize: 24, fontWeight: '900', marginTop: 4 }}>
                    {steps != null ? steps.toLocaleString() : '—'}
                  </Text>
                </View>
                <View style={{ flex: 1, backgroundColor: Colors.surface2, borderRadius: 12, padding: 14 }}>
                  <Text style={{ color: Colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>LATEST WEIGHT</Text>
                  <Text style={{ color: Colors.text, fontSize: 24, fontWeight: '900', marginTop: 4 }}>
                    {weight ? `${kgToDisplay(weight.kg, unit)} ${weightLabel(unit)}` : '—'}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <TouchableOpacity onPress={refresh} disabled={syncing}
                  style={{ flex: 1, flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.primary, borderRadius: 10, paddingVertical: 11 }}>
                  {syncing ? <ActivityIndicator size="small" color="#000" /> : <Ionicons name="sync" size={16} color="#000" />}
                  <Text style={{ color: '#000', fontWeight: '800', fontSize: 13 }}>{syncing ? 'Syncing…' : 'Sync now'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={disconnectHub}
                  style={{ paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.surface2, borderRadius: 10 }}>
                  <Text style={{ color: Colors.textSecondary, fontWeight: '700', fontSize: 13 }}>Disconnect</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* Connect button */}
          {available && !hubConnected && (
            <TouchableOpacity onPress={connectHub}
              style={{ marginTop: 16, backgroundColor: Colors.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}>
              <Text style={{ color: '#000', fontWeight: '800', fontSize: 14 }}>Connect {HUB.name}</Text>
            </TouchableOpacity>
          )}

          {/* Guarded build: native sync not in this build yet */}
          {!available && (
            <Text style={{ color: Colors.muted, fontSize: 12, lineHeight: 17, marginTop: 14 }}>
              Live {HUB.name} sync activates in an upcoming RYZR update.
            </Text>
          )}
        </View>

        {/* ── Brands ── */}
        <Text style={{ color: Colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginTop: 16, marginBottom: 10 }}>
          DEVICES
        </Text>
        <View style={{ gap: 12 }}>
          {BRANDS.map((brand) => {
            const isConnected = connected.includes(brand.id);
            return (
              <TouchableOpacity
                key={brand.id}
                onPress={() => onPressBrand(brand)}
                activeOpacity={0.8}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 14,
                  backgroundColor: Colors.surface, borderRadius: 16, padding: 16,
                  borderWidth: 1, borderColor: isConnected ? Colors.primary : Colors.border,
                }}
              >
                <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: Colors.primary + '22', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Ionicons name={brand.icon} size={24} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: Colors.text, fontWeight: '700', fontSize: 15 }}>{brand.name}</Text>
                  <Text style={{ color: Colors.textSecondary, fontSize: 13, marginTop: 2, lineHeight: 18 }}>{brand.desc}</Text>
                </View>
                {isConnected ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.success + '22', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, flexShrink: 0 }}>
                    <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                    <Text style={{ color: Colors.success, fontWeight: '800', fontSize: 13 }}>Linked</Text>
                  </View>
                ) : (
                  <View style={{ backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 9, flexShrink: 0 }}>
                    <Text style={{ color: '#000', fontWeight: '800', fontSize: 13 }}>Link</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={{ color: Colors.muted, fontSize: 12, textAlign: 'center', lineHeight: 18, marginTop: 24 }}>
          Devices sync to RYZR through {HUB.name}. We use your activity, heart-rate,
          and sleep data to tailor your training — disconnect anytime.
        </Text>
      </ScrollView>
    </View>
  );
}
