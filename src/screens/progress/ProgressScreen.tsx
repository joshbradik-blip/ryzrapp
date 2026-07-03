import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Dimensions,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/theme';
import { useSubscriptionStore } from '../../store/subscriptionStore';
import { useProfileStore } from '../../store/profileStore';
import { useHistoryStore } from '../../store/historyStore';
import { useAuthStore } from '../../store/authStore';
import { useBodyStore } from '../../store/bodyStore';
import { useWearablesStore } from '../../store/wearablesStore';
import { Health } from '../../lib/health';
import { kgToDisplay, displayToKg, weightLabel } from '../../lib/units';
import { navyBodyFat, cmToIn, inToCm } from '../../lib/bodyComposition';
import { SectionLabel } from '../../components/ui/SectionLabel';
import { MuscleHeatmap } from '../../components/progress/MuscleHeatmap';
import { GradientButton } from '../../components/ui/GradientButton';

const { width } = Dimensions.get('window');

const HEATMAP_DATA = Array.from({ length: 91 }, (_, i) => ({ index: i, count: 0 }));


function HeatmapCalendar() {
  const cellSize = Math.floor((width - 64) / 13) - 2;
  const weeks = Array.from({ length: 13 }, (_, weekIdx) =>
    HEATMAP_DATA.slice(weekIdx * 7, weekIdx * 7 + 7)
  );

  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {weeks.map((week, wi) => (
        <View key={wi} style={{ gap: 2 }}>
          {week.map((day) => (
            <View
              key={day.index}
              style={{
                width: cellSize,
                height: cellSize,
                borderRadius: 2,
                backgroundColor:
                  day.count === 0
                    ? Colors.surface3
                    : day.count === 1
                    ? Colors.primary + '55'
                    : day.count === 2
                    ? Colors.primary + 'AA'
                    : Colors.primary,
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

function shortDate(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatSleep(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${m}m`;
}

export function ProgressScreen() {
  const { isPremium } = useSubscriptionStore();
  const { profile } = useProfileStore();
  const userId = useAuthStore((s) => s.session?.user?.id);
  const { volumeByWeek, muscleHeatMap, bestWeights, fetchHistory } = useHistoryStore();
  const { latest, previous, fetchMeasurements, logMeasurement } = useBodyStore();
  const wearableRecords = useWearablesStore((s) => s.records);
  const wearablesConnected = useWearablesStore((s) => s.connected);
  const [activeChart, setActiveChart] = useState('Back Squat');
  const [logOpen, setLogOpen] = useState(false);
  const [mNeck, setMNeck] = useState('');
  const [mWaist, setMWaist] = useState('');
  const [mHip, setMHip] = useState('');
  const [mWeight, setMWeight] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (userId) {
      fetchHistory(userId);
      fetchMeasurements(userId);
      // Wearable records: always load synced history; silently re-sync fresh
      // data when the OS health hub is connected in this build.
      useWearablesStore.getState().loadHistory(userId);
      if (Health.isAvailable() && wearablesConnected.length > 0) {
        useWearablesStore.getState().sync(userId);
      }
    }
  }, [userId]);

  const unit = profile?.weight_unit ?? 'kg';
  const totalVolumeKg = volumeByWeek.reduce((sum, w) => sum + w.volumeKg, 0);
  const totalVolumeDisplay = Math.round(kgToDisplay(totalVolumeKg, unit));
  const last4 = volumeByWeek.slice(4).reduce((s, w) => s + w.volumeKg, 0);
  const prior4 = volumeByWeek.slice(0, 4).reduce((s, w) => s + w.volumeKg, 0);
  const volumeDeltaPct = prior4 > 0 ? Math.round(((last4 - prior4) / prior4) * 100) : null;
  const maxWeekVolume = Math.max(1, ...volumeByWeek.map((w) => w.volumeKg));

  const lengthUnit: 'in' | 'cm' = profile?.weight_unit === 'lbs' ? 'in' : 'cm';
  const isFemale = profile?.sex === 'female';
  const bfDelta = latest?.body_fat_pct != null && previous?.body_fat_pct != null
    ? Math.round((latest.body_fat_pct - previous.body_fat_pct) * 10) / 10
    : null;

  const dispLen = (cm: number | null) =>
    cm == null ? '—' : `${lengthUnit === 'in' ? cmToIn(cm) : cm} ${lengthUnit}`;

  // Strength PRs — heaviest set ever logged per exercise, top 5 by weight.
  const strengthPRs = Object.values(bestWeights)
    .sort((a, b) => b.weight_kg - a.weight_kg)
    .slice(0, 5);

  // Wearable activity records — best days from synced health data.
  const distanceUnit = unit === 'lbs' ? 'mi' : 'km';
  const dispDistance = (m: number) =>
    unit === 'lbs' ? (m / 1609.34).toFixed(1) : (m / 1000).toFixed(1);
  const activityRecords: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; date: string }[] = [];
  if (wearableRecords.bestSteps)
    activityRecords.push({ icon: 'footsteps', label: 'Best step day', value: wearableRecords.bestSteps.value.toLocaleString(), date: wearableRecords.bestSteps.date });
  if (wearableRecords.bestActiveCalories)
    activityRecords.push({ icon: 'flame', label: 'Most active calories', value: `${wearableRecords.bestActiveCalories.value.toLocaleString()} kcal`, date: wearableRecords.bestActiveCalories.date });
  if (wearableRecords.bestDistanceMeters)
    activityRecords.push({ icon: 'walk', label: 'Longest distance day', value: `${dispDistance(wearableRecords.bestDistanceMeters.value)} ${distanceUnit}`, date: wearableRecords.bestDistanceMeters.date });
  if (wearableRecords.longestSleepMinutes)
    activityRecords.push({ icon: 'moon', label: 'Longest sleep', value: formatSleep(wearableRecords.longestSleepMinutes.value), date: wearableRecords.longestSleepMinutes.date });
  if (wearableRecords.lowestRestingHr)
    activityRecords.push({ icon: 'heart', label: 'Lowest resting HR', value: `${wearableRecords.lowestRestingHr.value} bpm`, date: wearableRecords.lowestRestingHr.date });

  const handleSaveMeasurement = async () => {
    if (!userId || !profile) return;
    const toCm = (v: string) => {
      const n = parseFloat(v);
      if (!n) return null;
      return lengthUnit === 'in' ? inToCm(n) : n;
    };
    const neck_cm = toCm(mNeck);
    const waist_cm = toCm(mWaist);
    const hip_cm = isFemale ? toCm(mHip) : null;
    const weight_kg = mWeight ? displayToKg(parseFloat(mWeight), profile.weight_unit ?? 'kg') : null;
    if (!neck_cm || !waist_cm || (isFemale && !hip_cm)) {
      Alert.alert('Missing measurements', `Enter your neck, waist${isFemale ? ', and hips' : ''} to estimate body fat.`);
      return;
    }
    const body_fat_pct = navyBodyFat({
      sex: profile.sex,
      heightCm: profile.height_cm,
      neckCm: neck_cm,
      waistCm: waist_cm,
      hipCm: hip_cm,
    });
    setSaving(true);
    const ok = await logMeasurement(userId, { weight_kg, neck_cm, waist_cm, hip_cm, body_fat_pct });
    setSaving(false);
    if (ok) {
      setLogOpen(false);
      setMNeck(''); setMWaist(''); setMHip(''); setMWeight('');
    } else {
      Alert.alert('Could not save', 'Please try again.');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Header */}
        <View style={{ padding: 24, paddingBottom: 8 }}>
          <Text style={{ color: Colors.text, fontSize: 26, fontWeight: '900' }}>Progress</Text>
          <Text style={{ color: Colors.textSecondary, fontSize: 14, marginTop: 2 }}>
            Last 90 days
          </Text>
        </View>

        {/* Training volume */}
        <View style={{ marginHorizontal: 24, marginBottom: 24, backgroundColor: Colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border }}>
          <SectionLabel style={{ marginBottom: 8 }}>Training Volume</SectionLabel>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 16 }}>
            <Text style={{ color: Colors.text, fontSize: 30, fontWeight: '900' }}>
              {totalVolumeDisplay.toLocaleString()} <Text style={{ fontSize: 16, color: Colors.textSecondary }}>{weightLabel(unit)}</Text>
            </Text>
            {volumeDeltaPct !== null && (
              <Text style={{ color: volumeDeltaPct >= 0 ? Colors.primary : Colors.muted, fontSize: 13, fontWeight: '700', marginBottom: 6 }}>
                {volumeDeltaPct >= 0 ? '+' : ''}{volumeDeltaPct}% vs last 4 weeks
              </Text>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 100 }}>
            {volumeByWeek.map((w, i) => {
              const isLatest = i === volumeByWeek.length - 1;
              return (
                <View key={i} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                  <View style={{
                    width: '62%',
                    height: Math.max(2, Math.round(80 * (w.volumeKg / maxWeekVolume))),
                    backgroundColor: isLatest ? Colors.primary : Colors.primary + '99',
                    borderRadius: 3,
                  }} />
                  <Text style={{ color: Colors.muted, fontSize: 9 }}>{w.label}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Muscle groups heatmap */}
        <View style={{ marginHorizontal: 24, marginBottom: 24, backgroundColor: Colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border }}>
          <SectionLabel style={{ marginBottom: 12 }}>Muscle Groups</SectionLabel>
          <MuscleHeatmap heat={muscleHeatMap} />
        </View>

        {/* Streak calendar heatmap */}
        <View style={{ marginHorizontal: 24, marginBottom: 24, backgroundColor: Colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border }}>
          <Text style={{ color: Colors.muted, fontSize: 12, fontWeight: '600', letterSpacing: 0.5, marginBottom: 12 }}>TRAINING HEATMAP</Text>
          <HeatmapCalendar />
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 12 }}>
            <Text style={{ color: Colors.muted, fontSize: 11 }}>Less</Text>
            {[Colors.surface3, Colors.primary + '55', Colors.primary + 'AA', Colors.primary].map((c, i) => (
              <View key={i} style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: c }} />
            ))}
            <Text style={{ color: Colors.muted, fontSize: 11 }}>More</Text>
          </View>
        </View>

        {/* Strength charts */}
        <View style={{ marginHorizontal: 24, marginBottom: 24, backgroundColor: Colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border }}>
          <Text style={{ color: Colors.muted, fontSize: 12, fontWeight: '600', letterSpacing: 0.5, marginBottom: 12 }}>STRENGTH PROGRESSION</Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            {['Back Squat', 'Bench Press', 'Deadlift', 'Pull-Up'].map((ex) => (
              <TouchableOpacity
                key={ex}
                onPress={() => setActiveChart(ex)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 16,
                  marginRight: 8,
                  backgroundColor: activeChart === ex ? Colors.primary + '22' : Colors.surface2,
                  borderWidth: 1,
                  borderColor: activeChart === ex ? Colors.primary : Colors.border,
                }}
              >
                <Text style={{ color: activeChart === ex ? Colors.primary : Colors.text, fontWeight: '600', fontSize: 13 }}>{ex}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={{ height: 100, backgroundColor: Colors.surface2, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 12, borderWidth: 1, borderColor: Colors.border }}>
            <Ionicons name="barbell-outline" size={24} color={Colors.muted} style={{ marginBottom: 6 }} />
            <Text style={{ color: Colors.textSecondary, fontSize: 13, fontWeight: '600' }}>No data yet — log sets to track progress</Text>
          </View>
        </View>

        {/* PRs — strength records from logged sets + activity records from wearables */}
        <View style={{ marginHorizontal: 24, marginBottom: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Text style={{ color: Colors.text, fontSize: 18, fontWeight: '800' }}>Personal Records</Text>
            <Ionicons name="trophy" size={20} color={Colors.primary} />
          </View>

          {strengthPRs.length === 0 && activityRecords.length === 0 ? (
            <View style={{ backgroundColor: Colors.surface, borderRadius: 14, padding: 24, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' }}>
              <Ionicons name="trophy-outline" size={32} color={Colors.muted} style={{ marginBottom: 8 }} />
              <Text style={{ color: Colors.textSecondary, fontSize: 14, textAlign: 'center' }}>
                No PRs yet — complete workouts to set your first records, or connect a wearable in Profile → Wearables
              </Text>
            </View>
          ) : (
            <View style={{ backgroundColor: Colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.border }}>
              {strengthPRs.length > 0 && (
                <>
                  <SectionLabel style={{ marginBottom: 4 }}>Strength</SectionLabel>
                  {strengthPRs.map((pr, i) => (
                    <View key={pr.name + pr.at} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11, borderBottomWidth: i < strengthPRs.length - 1 || activityRecords.length > 0 ? 1 : 0, borderBottomColor: Colors.border }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                        <Ionicons name="barbell" size={16} color={Colors.primary} />
                        <Text style={{ color: Colors.text, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{pr.name}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ color: Colors.text, fontSize: 15, fontWeight: '800' }}>
                          {kgToDisplay(pr.weight_kg, unit)} {weightLabel(unit)} × {pr.reps}
                        </Text>
                        <Text style={{ color: Colors.muted, fontSize: 11 }}>{shortDate(pr.at)}</Text>
                      </View>
                    </View>
                  ))}
                </>
              )}

              {activityRecords.length > 0 && (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: strengthPRs.length > 0 ? 14 : 0, marginBottom: 4 }}>
                    <SectionLabel>Activity</SectionLabel>
                    <Ionicons name="watch-outline" size={13} color={Colors.primary} />
                  </View>
                  {activityRecords.map((rec, i) => (
                    <View key={rec.label} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11, borderBottomWidth: i < activityRecords.length - 1 ? 1 : 0, borderBottomColor: Colors.border }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                        <Ionicons name={rec.icon} size={16} color={Colors.primary} />
                        <Text style={{ color: Colors.text, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{rec.label}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ color: Colors.text, fontSize: 15, fontWeight: '800' }}>{rec.value}</Text>
                        <Text style={{ color: Colors.muted, fontSize: 11 }}>{shortDate(rec.date)}</Text>
                      </View>
                    </View>
                  ))}
                </>
              )}
            </View>
          )}
        </View>

        {/* Body weight log */}
        <View style={{ marginHorizontal: 24, marginBottom: 24 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ color: Colors.text, fontSize: 18, fontWeight: '800' }}>Body Weight</Text>
            <TouchableOpacity onPress={() => Alert.alert('Coming soon', 'Body weight logging coming in a future update.')} style={{ backgroundColor: Colors.surface2, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: Colors.border }}>
              <Text style={{ color: Colors.primary, fontWeight: '700', fontSize: 13 }}>+ Log</Text>
            </TouchableOpacity>
          </View>
          <View style={{ backgroundColor: Colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' }}>
            {profile?.weight_kg ? (
              <>
                <Text style={{ color: Colors.text, fontSize: 32, fontWeight: '900' }}>{kgToDisplay(profile.weight_kg, profile.weight_unit ?? 'kg')} <Text style={{ fontSize: 18, color: Colors.textSecondary }}>{weightLabel(profile.weight_unit ?? 'kg')}</Text></Text>
                <Text style={{ color: Colors.muted, fontSize: 13 }}>Starting weight — log entries to track change</Text>
              </>
            ) : (
              <Text style={{ color: Colors.muted, fontSize: 14 }}>No weight logged yet</Text>
            )}
          </View>
        </View>

        {/* Body composition (free — US Navy tape-measure method) */}
        <View style={{ marginHorizontal: 24, marginBottom: 8, backgroundColor: Colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <SectionLabel>Body Composition</SectionLabel>
            <TouchableOpacity onPress={() => setLogOpen(true)} style={{ backgroundColor: Colors.surface2, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: Colors.border }}>
              <Text style={{ color: Colors.primary, fontWeight: '700', fontSize: 13 }}>+ Log</Text>
            </TouchableOpacity>
          </View>

          {latest?.body_fat_pct != null ? (
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginBottom: 12 }}>
              <Text style={{ color: Colors.text, fontSize: 34, fontWeight: '900' }}>{latest.body_fat_pct}%</Text>
              <Text style={{ color: Colors.textSecondary, fontSize: 13, marginBottom: 8 }}>body fat</Text>
              {bfDelta !== null && (
                <Text style={{ color: Colors.muted, fontSize: 13, fontWeight: '700', marginBottom: 8 }}>
                  {bfDelta > 0 ? '+' : ''}{bfDelta}% since last
                </Text>
              )}
            </View>
          ) : (
            <Text style={{ color: Colors.textSecondary, fontSize: 14, marginBottom: 12, lineHeight: 20 }}>
              Log a few tape measurements and we'll estimate your body fat with the US Navy method — free, no scanner needed.
            </Text>
          )}

          {latest && (
            <View>
              {([
                ...(latest.lean_mass_kg != null
                  ? [['Lean mass', `${kgToDisplay(latest.lean_mass_kg, unit)} ${weightLabel(unit)}`] as [string, string]]
                  : []),
                ['Neck', dispLen(latest.neck_cm)],
                ['Waist', dispLen(latest.waist_cm)],
                ...(isFemale ? [['Hips', dispLen(latest.hip_cm)] as [string, string]] : []),
              ] as [string, string][]).map(([label, value], i, arr) => (
                <View key={label} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: Colors.border }}>
                  <Text style={{ color: Colors.textSecondary, fontSize: 14 }}>{label}</Text>
                  <Text style={{ color: Colors.text, fontSize: 14, fontWeight: '600' }}>{value}</Text>
                </View>
              ))}
            </View>
          )}

          <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 12 }}>
            {latest?.source && latest.source !== 'manual'
              ? 'Latest reading synced from your smart scale via your health app.'
              : 'Estimate via the US Navy tape-measure method.'}
          </Text>
        </View>

        {/* Log measurement modal */}
        <Modal visible={logOpen} animationType="slide" transparent onRequestClose={() => setLogOpen(false)}>
          <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#0A0A0Acc' }}>
            <View style={{ backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36, borderWidth: 1, borderColor: Colors.border }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ color: Colors.text, fontSize: 20, fontWeight: '900' }}>Log measurements</Text>
                <TouchableOpacity onPress={() => setLogOpen(false)}>
                  <Ionicons name="close" size={24} color={Colors.muted} />
                </TouchableOpacity>
              </View>
              <Text style={{ color: Colors.textSecondary, fontSize: 13, marginBottom: 16 }}>
                Measure in {lengthUnit === 'in' ? 'inches' : 'centimeters'}. We use these to estimate your body fat.
              </Text>

              {([
                ['Neck', mNeck, setMNeck],
                ['Waist', mWaist, setMWaist],
                ...(isFemale ? [['Hips', mHip, setMHip] as [string, string, (v: string) => void]] : []),
              ] as [string, string, (v: string) => void][]).map(([label, val, setter]) => (
                <View key={label} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                  <Text style={{ color: Colors.textSecondary, fontSize: 15, width: 70 }}>{label}</Text>
                  <TextInput
                    value={val}
                    onChangeText={setter}
                    keyboardType="decimal-pad"
                    placeholder={`0 ${lengthUnit}`}
                    placeholderTextColor={Colors.muted}
                    style={{ flex: 1, backgroundColor: Colors.surface2, borderRadius: 10, padding: 12, color: Colors.text, fontSize: 16, fontWeight: '700', borderWidth: 1, borderColor: Colors.border }}
                  />
                </View>
              ))}

              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
                <Text style={{ color: Colors.textSecondary, fontSize: 15, width: 70 }}>Weight</Text>
                <TextInput
                  value={mWeight}
                  onChangeText={setMWeight}
                  keyboardType="decimal-pad"
                  placeholder={`optional ${weightLabel(profile?.weight_unit ?? 'kg')}`}
                  placeholderTextColor={Colors.muted}
                  style={{ flex: 1, backgroundColor: Colors.surface2, borderRadius: 10, padding: 12, color: Colors.text, fontSize: 16, fontWeight: '700', borderWidth: 1, borderColor: Colors.border }}
                />
              </View>

              <GradientButton title="Save measurements" onPress={handleSaveMeasurement} loading={saving} />
            </View>
          </View>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}
