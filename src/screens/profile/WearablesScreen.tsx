import React, { useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/theme';
import { useWearablesStore } from '../../store/wearablesStore';
import { useBodyStore } from '../../store/bodyStore';
import { useProfileStore } from '../../store/profileStore';
import { useAuthStore } from '../../store/authStore';
import { kgToDisplay, weightLabel } from '../../lib/units';
import { Health } from '../../lib/health';

type Brand = {
  id: string;
  name: string;
  desc: string;
  icon: keyof typeof Ionicons.glyphMap;
};

// The OS health hub — the primary, real integration point. Watches, rings,
// scales, and apps like Strava all publish into it; RYZR reads from it.
const HUB = Platform.OS === 'ios'
  ? { id: 'apple_health', name: 'Apple Health', icon: 'heart-outline' as const,
      sub: 'Sync steps, activity, sleep, heart rate & body composition from iPhone and Apple Watch' }
  : { id: 'health_connect', name: 'Health Connect', icon: 'fitness-outline' as const,
      sub: 'Sync steps, activity, sleep, heart rate & body composition from your Android health apps' };

// Brands that feed the hub. Linking is a preference today; data flows via the hub.
const BRANDS: Brand[] = [
  ...(Platform.OS === 'ios'
    ? [{ id: 'apple_watch', name: 'Apple Watch', desc: 'Activity rings, workouts, heart rate & sleep', icon: 'watch-outline' as const }]
    : [{ id: 'galaxy_watch', name: 'Samsung Galaxy Watch', desc: 'Syncs via Samsung Health → Health Connect', icon: 'watch-outline' as const }]),
  { id: 'fitbit', name: 'Fitbit',    desc: 'Steps, heart rate, sleep & recovery',        icon: 'watch-outline' },
  { id: 'garmin', name: 'Garmin',    desc: 'Training load, HR, sleep & body battery',    icon: 'watch-outline' },
  { id: 'whoop',  name: 'WHOOP',     desc: 'Recovery, strain & sleep coaching',          icon: 'pulse-outline' },
  { id: 'oura',   name: 'Oura Ring', desc: 'Readiness, sleep & HRV',                     icon: 'ellipse-outline' },
  { id: 'strava', name: 'Strava',    desc: 'Runs, rides & outdoor workouts',             icon: 'map-outline' },
  { id: 'polar',  name: 'Polar',     desc: 'HR training, running & recovery',            icon: 'watch-outline' },
];

function fmtSleep(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${m}m`;
}

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function WearablesScreen() {
  const { connected, toggle, disconnect, today, bodyComp, lastSyncedAt, syncing, sync, clearLive } = useWearablesStore();
  const profile = useProfileStore((s) => s.profile);
  const userId = useAuthStore((s) => s.session?.user?.id);
  const latestBody = useBodyStore((s) => s.latest);

  const available = Health.isAvailable();
  const hubConnected = connected.includes(HUB.id);

  const unit = profile?.weight_unit ?? 'kg';

  useEffect(() => {
    if (userId) {
      useBodyStore.getState().fetchMeasurements(userId);
      if (available && hubConnected) sync(userId);
    }
  }, [userId]);

  const connectHub = async () => {
    const ok = await Health.requestPermissions();
    if (ok) {
      if (!connected.includes(HUB.id)) toggle(HUB.id);
      if (userId) sync(userId);
    } else {
      Alert.alert('Permission needed', `Allow RYZR to read your data in the ${HUB.name} permission screen to enable sync.`);
    }
  };

  const disconnectHub = () => {
    Alert.alert(`Disconnect ${HUB.name}?`, 'RYZR will stop syncing your health data.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Disconnect', style: 'destructive', onPress: () => { disconnect(HUB.id); clearLive(); } },
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

  const weightKg = latestBody?.weight_kg ?? profile?.weight_kg ?? null;
  const tiles: { label: string; value: string }[] = [
    { label: 'STEPS TODAY', value: today?.steps != null ? today.steps.toLocaleString() : '—' },
    { label: 'ACTIVE KCAL', value: today?.activeCalories != null ? today.activeCalories.toLocaleString() : '—' },
    { label: 'RESTING HR', value: today?.restingHr != null ? `${today.restingHr} bpm` : '—' },
    { label: 'SLEEP', value: today?.sleepMinutes != null ? fmtSleep(today.sleepMinutes) : '—' },
    { label: 'WEIGHT', value: weightKg != null ? `${kgToDisplay(weightKg, unit)} ${weightLabel(unit)}` : '—' },
    { label: 'BODY FAT', value: bodyComp?.bodyFatPct != null ? `${bodyComp.bodyFatPct.value}%` : '—' },
  ];

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
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 }}>
                {tiles.map((t) => (
                  <View key={t.label} style={{ flexBasis: '30%', flexGrow: 1, backgroundColor: Colors.surface2, borderRadius: 12, padding: 12 }}>
                    <Text style={{ color: Colors.muted, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 }}>{t.label}</Text>
                    <Text style={{ color: Colors.text, fontSize: 18, fontWeight: '900', marginTop: 4 }} numberOfLines={1} adjustsFontSizeToFit>
                      {t.value}
                    </Text>
                  </View>
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <TouchableOpacity onPress={() => userId && sync(userId)} disabled={syncing}
                  style={{ flex: 1, flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.primary, borderRadius: 10, paddingVertical: 11 }}>
                  {syncing ? <ActivityIndicator size="small" color="#000" /> : <Ionicons name="sync" size={16} color="#000" />}
                  <Text style={{ color: '#000', fontWeight: '800', fontSize: 13 }}>{syncing ? 'Syncing…' : 'Sync now'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={disconnectHub}
                  style={{ paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.surface2, borderRadius: 10 }}>
                  <Text style={{ color: Colors.textSecondary, fontWeight: '700', fontSize: 13 }}>Disconnect</Text>
                </TouchableOpacity>
              </View>
              {lastSyncedAt && (
                <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 10, textAlign: 'center' }}>
                  Last synced {timeAgo(lastSyncedAt)} · records update on Progress
                </Text>
              )}
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
          DEVICES & APPS
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
          Devices and apps sync to RYZR through {HUB.name} — make sure they're set to
          share data with it. We use your activity, heart-rate, sleep, and body-composition
          data to tailor your training — disconnect anytime.
        </Text>
      </ScrollView>
    </View>
  );
}
