import React, { useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { MainTabParamList, TodayStackParamList } from '../../types';
import { useProfileStore } from '../../store/profileStore';
import { useWorkoutStore } from '../../store/workoutStore';
import { useHistoryStore } from '../../store/historyStore';
import { useAuthStore } from '../../store/authStore';
import { Colors, Gradients, BorderRadius, Spacing } from '../../constants/theme';

// The launch screen: one large, legible tile per destination.
//
// Why this exists: the bottom tab bar is the primary navigation and stays
// exactly as it was, but its 28px icons are easy to overlook on first run.
// This screen names every destination in full, at a size that reads at arm's
// length, and deliberately reuses the SAME Ionicons as MainTabNavigator's
// TAB_ICONS — so a tap here teaches which small icon to reach for next time.
// Keep the two icon sets in sync; that pairing is the whole point.
//
// It is the initial route of TodayNavigator rather than a sixth tab, so the
// tab bar stays at five and the hub costs no horizontal room.

type GridItem = {
  tab: keyof MainTabParamList;
  label: string;
  sub: string;
  icon: keyof typeof Ionicons.glyphMap;
};

// Icons mirror MainTabNavigator TAB_ICONS (active variants).
const GRID: GridItem[] = [
  { tab: 'Nutrition', label: 'Nutrition', sub: 'Log meals & calories', icon: 'restaurant' },
  { tab: 'Progress', label: 'Progress', sub: 'Charts, PRs & streaks', icon: 'bar-chart' },
  { tab: 'Store', label: 'Store', sub: 'Premium & gear', icon: 'bag' },
  { tab: 'Profile', label: 'Profile', sub: 'Plan & settings', icon: 'person' },
];

export function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<TodayStackParamList>>();
  const { profile } = useProfileStore();
  const todayWorkout = useWorkoutStore((s) => s.todayWorkout);
  const userId = useAuthStore((s) => s.session?.user?.id);
  const { currentStreak, loaded, fetchHistory } = useHistoryStore();

  // TodayScreen used to be the landing screen and primed history on mount.
  // Home sits in front of it now, so the streak would render 0 until the user
  // tapped through. Same guarded pattern as WorkoutSessionScreen.
  useEffect(() => {
    if (userId && !loaded) fetchHistory(userId);
  }, [userId, loaded]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = profile?.name?.trim().split(' ')[0];

  const openTab = (tab: keyof MainTabParamList) => {
    navigation.getParent<BottomTabNavigationProp<MainTabParamList>>()?.navigate(tab);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }} edges={['top']}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: Colors.textSecondary, fontSize: 14, fontWeight: '600' }}>{greeting}</Text>
            <Text style={{ color: Colors.text, fontSize: 30, fontWeight: '900', marginTop: 2 }}>
              {firstName || 'Welcome back'}
            </Text>
          </View>
          {currentStreak > 0 && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                backgroundColor: Colors.surface,
                borderWidth: 1,
                borderColor: Colors.border,
                borderRadius: BorderRadius.full,
                paddingHorizontal: 14,
                paddingVertical: 8,
              }}
            >
              <Ionicons name="flame" size={17} color={Colors.primary} />
              <Text style={{ color: Colors.primary, fontSize: 18, fontWeight: '900' }}>{currentStreak}</Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => navigation.navigate('TodayHome')}
          style={{ marginTop: Spacing.lg, borderRadius: BorderRadius.xl, overflow: 'hidden' }}
          accessibilityRole="button"
          accessibilityLabel="Daily workout"
        >
          <LinearGradient
            colors={Gradients.ember}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ padding: Spacing.lg, minHeight: 150, justifyContent: 'space-between' }}
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: BorderRadius.lg,
                backgroundColor: 'rgba(0,0,0,0.22)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="flash" size={32} color={Colors.text} />
            </View>
            <View style={{ marginTop: Spacing.md }}>
              <Text style={{ color: Colors.text, fontSize: 26, fontWeight: '900' }}>Daily Workout</Text>
              <Text style={{ color: 'rgba(255,255,255,0.88)', fontSize: 15, fontWeight: '600', marginTop: 3 }}>
                {todayWorkout?.name ?? "Start today's session"}
              </Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>

        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            marginTop: Spacing.md,
            rowGap: Spacing.md,
          }}
        >
          {GRID.map((item) => (
            <TouchableOpacity
              key={item.tab}
              activeOpacity={0.85}
              onPress={() => openTab(item.tab)}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              style={{
                width: '48.5%',
                minHeight: 132,
                backgroundColor: Colors.surface,
                borderWidth: 1,
                borderColor: Colors.border,
                borderRadius: BorderRadius.lg,
                padding: Spacing.md,
                justifyContent: 'space-between',
              }}
            >
              <View
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: BorderRadius.md,
                  backgroundColor: Colors.surface2,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name={item.icon} size={26} color={Colors.primary} />
              </View>
              <View style={{ marginTop: Spacing.sm }}>
                <Text style={{ color: Colors.text, fontSize: 17, fontWeight: '800' }}>{item.label}</Text>
                <Text style={{ color: Colors.muted, fontSize: 12, fontWeight: '600', marginTop: 2 }}>
                  {item.sub}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
