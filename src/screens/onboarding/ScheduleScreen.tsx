import React, { useState } from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OnboardingStackParamList } from '../../types';
import { Button } from '../../components/ui/Button';
import { useProfileStore } from '../../store/profileStore';
import { Colors } from '../../constants/theme';

type Props = {
  navigation: NativeStackNavigationProp<OnboardingStackParamList, 'Schedule'>;
};

const SESSION_LENGTHS = [15, 30, 45, 60, 90];
const TIMES = ['morning', 'lunch', 'evening', 'flexible'] as const;

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <View style={{ marginBottom: 32 }}>
      <Text style={{ color: Colors.muted, fontSize: 12, fontWeight: '600', marginBottom: 8 }}>STEP {step} OF {total}</Text>
      <View style={{ height: 4, backgroundColor: Colors.surface3, borderRadius: 2 }}>
        <View style={{ height: 4, width: `${(step / total) * 100}%`, backgroundColor: Colors.primary, borderRadius: 2 }} />
      </View>
    </View>
  );
}

export function ScheduleScreen({ navigation }: Props) {
  const { setSchedulePrefs } = useProfileStore();
  const [daysPerWeek, setDaysPerWeek] = useState(4);
  const [minutesPerSession, setMinutesPerSession] = useState(45);
  const [preferredTime, setPreferredTime] = useState<typeof TIMES[number]>('morning');

  const handleNext = () => {
    setSchedulePrefs({ days_per_week: daysPerWeek, minutes_per_session: minutesPerSession, preferred_time: preferredTime });
    navigation.navigate('Equipment');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24 }}>
        <ProgressBar step={3} total={5} />

        <Text style={{ fontSize: 28, fontWeight: '900', color: Colors.text, marginBottom: 8 }}>Your schedule</Text>
        <Text style={{ color: Colors.textSecondary, fontSize: 16, marginBottom: 40 }}>
          We'll fit your training into your life — not the other way around.
        </Text>

        {/* Days per week */}
        <Text style={{ color: Colors.textSecondary, fontSize: 13, fontWeight: '600', letterSpacing: 0.5, marginBottom: 12 }}>
          DAYS PER WEEK
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 32 }}>
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <TouchableOpacity
              key={d}
              onPress={() => setDaysPerWeek(d)}
              style={{
                flex: 1,
                aspectRatio: 1,
                borderRadius: 10,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: daysPerWeek === d ? Colors.primary : Colors.surface2,
                borderWidth: 1,
                borderColor: daysPerWeek === d ? Colors.primary : Colors.border,
              }}
            >
              <Text style={{ color: daysPerWeek === d ? '#000' : Colors.text, fontWeight: '800', fontSize: 16 }}>{d}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Session length */}
        <Text style={{ color: Colors.textSecondary, fontSize: 13, fontWeight: '600', letterSpacing: 0.5, marginBottom: 12 }}>
          MINUTES PER SESSION
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 32, flexWrap: 'wrap' }}>
          {SESSION_LENGTHS.map((m) => (
            <TouchableOpacity
              key={m}
              onPress={() => setMinutesPerSession(m)}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: 20,
                backgroundColor: minutesPerSession === m ? Colors.primary + '22' : Colors.surface2,
                borderWidth: 1.5,
                borderColor: minutesPerSession === m ? Colors.primary : Colors.border,
              }}
            >
              <Text style={{ color: minutesPerSession === m ? Colors.primary : Colors.text, fontWeight: '700' }}>{m} min</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Preferred time */}
        <Text style={{ color: Colors.textSecondary, fontSize: 13, fontWeight: '600', letterSpacing: 0.5, marginBottom: 12 }}>
          PREFERRED TIME
        </Text>
        <View style={{ gap: 8, marginBottom: 40 }}>
          {TIMES.map((t) => {
            const timeIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
              morning: 'sunny-outline',
              lunch: 'partly-sunny-outline',
              evening: 'moon-outline',
              flexible: 'time-outline',
            };
            const isSelected = preferredTime === t;
            return (
              <TouchableOpacity
                key={t}
                onPress={() => setPreferredTime(t)}
                style={{
                  padding: 14,
                  borderRadius: 12,
                  backgroundColor: isSelected ? Colors.primary + '22' : Colors.surface2,
                  borderWidth: 1.5,
                  borderColor: isSelected ? Colors.primary : Colors.border,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <Ionicons name={timeIcons[t]} size={22} color={isSelected ? Colors.primary : Colors.textSecondary} />
                <Text style={{ color: Colors.text, fontWeight: '700', fontSize: 15, textTransform: 'capitalize', flex: 1 }}>{t}</Text>
                {isSelected && <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />}
              </TouchableOpacity>
            );
          })}
        </View>

        <Button title="Next" onPress={handleNext} size="lg" />
      </ScrollView>
    </SafeAreaView>
  );
}
