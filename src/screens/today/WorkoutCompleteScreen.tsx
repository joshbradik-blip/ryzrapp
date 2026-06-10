import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TodayStackParamList } from '../../types';
import { useWorkoutStore } from '../../store/workoutStore';
import { Colors } from '../../constants/theme';
import * as Haptics from 'expo-haptics';

type Props = NativeStackScreenProps<TodayStackParamList, 'WorkoutComplete'>;

export function WorkoutCompleteScreen({ navigation }: Props) {
  const { activeSession, activeSets, workouts, todayWorkout, reset, advanceWorkout } = useWorkoutStore();
  const scaleAnim = useRef(new Animated.Value(0.3)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  const totalVolume = activeSets.reduce((acc, s) => acc + s.reps * s.weight, 0);
  const totalSets = activeSets.length;
  const duration = activeSession?.started_at
    ? Math.round((Date.now() - new Date(activeSession.started_at).getTime()) / 60000)
    : 0;

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 5 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleDone = () => {
    advanceWorkout();
    reset();
    navigation.navigate('TodayHome');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>

        {/* Trophy animation */}
        <Animated.View style={{ transform: [{ scale: scaleAnim }], marginBottom: 32 }}>
          <View style={{
            width: 120,
            height: 120,
            borderRadius: 60,
            backgroundColor: Colors.primary + '22',
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 3,
            borderColor: Colors.primary,
            shadowColor: Colors.primary,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.6,
            shadowRadius: 30,
            elevation: 12,
          }}>
            <Ionicons name="trophy" size={56} color={Colors.primary} />
          </View>
        </Animated.View>

        <Animated.View style={{ opacity: opacityAnim, alignItems: 'center', width: '100%' }}>
          <Text style={{ color: Colors.primary, fontSize: 14, fontWeight: '700', letterSpacing: 2, marginBottom: 8 }}>
            WORKOUT COMPLETE
          </Text>
          <Text style={{ color: Colors.text, fontSize: 34, fontWeight: '900', textAlign: 'center', marginBottom: 8 }}>
            {todayWorkout?.name ?? 'Great session!'}
          </Text>
          <Text style={{ color: Colors.textSecondary, fontSize: 16, marginBottom: 40, textAlign: 'center' }}>
            You showed up. That's what matters.
          </Text>

          {/* Stats row */}
          <View style={{ flexDirection: 'row', gap: 12, width: '100%', marginBottom: 40 }}>
            {[
              { label: 'Duration', value: `${duration}`, unit: 'min' },
              { label: 'Total sets', value: String(totalSets), unit: 'sets' },
              { label: 'Volume', value: totalVolume > 0 ? String(Math.round(totalVolume)) : '—', unit: totalVolume > 0 ? 'kg' : '' },
            ].map((stat) => (
              <View key={stat.label} style={{
                flex: 1,
                backgroundColor: Colors.surface,
                borderRadius: 14,
                padding: 14,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: Colors.border,
              }}>
                <Text style={{ color: Colors.primary, fontSize: 24, fontWeight: '900' }}>{stat.value}</Text>
                <Text style={{ color: Colors.muted, fontSize: 11, fontWeight: '600' }}>{stat.unit}</Text>
                <Text style={{ color: Colors.textSecondary, fontSize: 11, marginTop: 2 }}>{stat.label}</Text>
              </View>
            ))}
          </View>

          {/* Completion banner */}
          <View style={{
            backgroundColor: Colors.primary + '22',
            borderRadius: 16,
            padding: 16,
            width: '100%',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            marginBottom: 32,
            borderWidth: 1,
            borderColor: Colors.primary + '44',
          }}>
            <Ionicons name="flame" size={36} color={Colors.primary} />
            <View>
              <Text style={{ color: Colors.primary, fontWeight: '900', fontSize: 18 }}>Session complete!</Text>
              <Text style={{ color: Colors.textSecondary, fontSize: 13 }}>Keep it going — train again tomorrow</Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={handleDone}
            style={{ backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 18, width: '100%', alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10 }}
          >
            <Text style={{ color: '#000', fontWeight: '900', fontSize: 18 }}>Done</Text>
            <Ionicons name="checkmark-circle" size={22} color="#000" />
          </TouchableOpacity>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}
