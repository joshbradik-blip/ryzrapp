import React, { useState } from 'react';
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/theme';
import { useSubscriptionStore } from '../../store/subscriptionStore';
import { useProfileStore } from '../../store/profileStore';
import { startBodyScan } from '../../modules/PrismModule';

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

const MEASUREMENT_ROWS: { label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { label: 'Waist',     icon: 'resize-outline' },
  { label: 'Hips',      icon: 'ellipse-outline' },
  { label: 'Chest',     icon: 'body-outline' },
  { label: 'Shoulders', icon: 'trending-up-outline' },
  { label: 'Body Fat',  icon: 'water-outline' },
  { label: 'Lean Mass', icon: 'barbell-outline' },
];

export function ProgressScreen() {
  const { isPremium } = useSubscriptionStore();
  const { profile } = useProfileStore();
  const [activeChart, setActiveChart] = useState('Back Squat');
  const [scanning, setScanning] = useState(false);

  const handleScan = async () => {
    if (!isPremium) {
      Alert.alert('Premium Feature', 'Upgrade to RYZR Premium to use Body Scan.');
      return;
    }
    if (Platform.OS !== 'android') {
      Alert.alert('Coming Soon', 'Body Scan on iOS is coming soon. Stay tuned!');
      return;
    }
    setScanning(true);
    try {
      const completed = await startBodyScan();
      if (completed) {
        Alert.alert('Scan Complete!', 'Your body measurements are being processed. Results will appear here shortly.');
      }
    } catch {
      Alert.alert('Error', 'Could not start body scan. Make sure you have a development build installed.');
    } finally {
      setScanning(false);
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

        {/* PRs */}
        <View style={{ marginHorizontal: 24, marginBottom: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Text style={{ color: Colors.text, fontSize: 18, fontWeight: '800' }}>Personal Records</Text>
            <Ionicons name="trophy" size={20} color={Colors.primary} />
          </View>
          <View style={{ backgroundColor: Colors.surface, borderRadius: 14, padding: 24, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' }}>
            <Ionicons name="trophy-outline" size={32} color={Colors.muted} style={{ marginBottom: 8 }} />
            <Text style={{ color: Colors.textSecondary, fontSize: 14, textAlign: 'center' }}>No PRs yet — complete workouts to set your first records</Text>
          </View>
        </View>

        {/* Body weight log */}
        <View style={{ marginHorizontal: 24, marginBottom: 24 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ color: Colors.text, fontSize: 18, fontWeight: '800' }}>Body Weight</Text>
            <TouchableOpacity style={{ backgroundColor: Colors.surface2, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: Colors.border }}>
              <Text style={{ color: Colors.primary, fontWeight: '700', fontSize: 13 }}>+ Log</Text>
            </TouchableOpacity>
          </View>
          <View style={{ backgroundColor: Colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' }}>
            {profile?.weight_kg ? (
              <>
                <Text style={{ color: Colors.text, fontSize: 32, fontWeight: '900' }}>{profile.weight_kg} <Text style={{ fontSize: 18, color: Colors.textSecondary }}>kg</Text></Text>
                <Text style={{ color: Colors.muted, fontSize: 13 }}>Starting weight — log entries to track change</Text>
              </>
            ) : (
              <Text style={{ color: Colors.muted, fontSize: 14 }}>No weight logged yet</Text>
            )}
          </View>
        </View>

        {/* Body Scan */}
        <View style={{ marginHorizontal: 24, marginBottom: 8 }}>
          <Text style={{ color: Colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 12 }}>BODY COMPOSITION</Text>

          {/* Scan CTA card */}
          <TouchableOpacity
            onPress={handleScan}
            disabled={scanning}
            activeOpacity={0.85}
            style={{
              backgroundColor: Colors.surface,
              borderRadius: 16,
              borderWidth: 1.5,
              borderColor: isPremium ? Colors.primary + '66' : Colors.border,
              overflow: 'hidden',
              marginBottom: 12,
            }}
          >
            {/* Green gradient bar */}
            <View style={{ height: 3, backgroundColor: Colors.primary, opacity: isPremium ? 1 : 0.3 }} />

            <View style={{ padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <View style={{
                width: 56, height: 56, borderRadius: 28,
                backgroundColor: isPremium ? Colors.primary + '22' : Colors.surface2,
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 1.5,
                borderColor: isPremium ? Colors.primary + '55' : Colors.border,
              }}>
                <Ionicons name="scan-outline" size={28} color={isPremium ? Colors.primary : Colors.muted} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <Text style={{ color: Colors.text, fontSize: 17, fontWeight: '800' }}>Body Scan</Text>
                  <View style={{ backgroundColor: Colors.primary + '22', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: Colors.primary + '55' }}>
                    <Text style={{ color: Colors.primary, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 }}>PRISM</Text>
                  </View>
                </View>
                <Text style={{ color: Colors.textSecondary, fontSize: 13, lineHeight: 18 }}>
                  {scanning ? 'Starting scan…' : 'Full-body measurements in 60 seconds'}
                </Text>
                <Text style={{ color: Colors.muted, fontSize: 12, marginTop: 4 }}>
                  Last scan: Never
                </Text>
              </View>
              <View style={{
                backgroundColor: isPremium ? Colors.primary : Colors.surface2,
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderWidth: 1,
                borderColor: isPremium ? Colors.primary : Colors.border,
              }}>
                <Text style={{ color: isPremium ? Colors.background : Colors.muted, fontSize: 13, fontWeight: '800' }}>
                  {scanning ? '…' : 'SCAN'}
                </Text>
              </View>
            </View>
          </TouchableOpacity>

          {/* Measurements placeholder */}
          <View style={{
            backgroundColor: Colors.surface,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: Colors.border,
            overflow: 'hidden',
          }}>
            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: Colors.text, fontSize: 15, fontWeight: '700' }}>Measurements</Text>
              <Text style={{ color: Colors.muted, fontSize: 12 }}>No scan yet</Text>
            </View>
            <View style={{ padding: 4 }}>
              {MEASUREMENT_ROWS.map((row, i) => (
                <View
                  key={row.label}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 12,
                    paddingVertical: 13,
                    borderBottomWidth: i < MEASUREMENT_ROWS.length - 1 ? 1 : 0,
                    borderBottomColor: Colors.border,
                    gap: 12,
                  }}
                >
                  <Ionicons name={row.icon} size={18} color={Colors.muted} />
                  <Text style={{ color: Colors.textSecondary, fontSize: 14, flex: 1 }}>{row.label}</Text>
                  <View style={{ width: 48, height: 12, backgroundColor: Colors.surface3, borderRadius: 6, opacity: 0.6 }} />
                  <Text style={{ color: Colors.muted, fontSize: 14, width: 32, textAlign: 'right' }}>—</Text>
                </View>
              ))}
            </View>

            {/* Overlay nudge */}
            <View style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              paddingVertical: 14, paddingHorizontal: 16,
              backgroundColor: Colors.background + 'DD',
              alignItems: 'center',
              borderTopWidth: 1, borderTopColor: Colors.border,
            }}>
              <Text style={{ color: Colors.textSecondary, fontSize: 13 }}>
                Complete a scan to see your measurements
              </Text>
            </View>
          </View>

          {/* Powered by */}
          <Text style={{ color: Colors.muted, fontSize: 11, textAlign: 'center', marginTop: 12 }}>
            3D body mapping powered by Prism Labs
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
