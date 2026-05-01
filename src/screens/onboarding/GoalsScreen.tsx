import React, { useState } from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OnboardingStackParamList, GoalCategory } from '../../types';
import { Button } from '../../components/ui/Button';
import { useProfileStore } from '../../store/profileStore';
import { Colors } from '../../constants/theme';

type Props = {
  navigation: NativeStackNavigationProp<OnboardingStackParamList, 'Goals'>;
};

const GOAL_OPTIONS: { value: GoalCategory; label: string; desc: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'build_muscle',       label: 'Get stronger & build muscle',      desc: 'Progressive overload, hypertrophy',        icon: 'barbell-outline' },
  { value: 'lose_fat',           label: 'Lose fat & get leaner',            desc: 'Caloric deficit, body recomp',              icon: 'flame-outline' },
  { value: 'specific_activity',  label: 'Improve at a specific activity',   desc: 'Sport-specific, skill transfer',            icon: 'trophy-outline' },
  { value: 'rehab',              label: 'Rehab / return from injury',        desc: 'Gentle progression, pain-free movement',   icon: 'medkit-outline' },
  { value: 'general_fitness',    label: 'General fitness & feel better',    desc: 'Energy, health, longevity',                 icon: 'leaf-outline' },
];

const ACTIVITIES = [
  'Surfing', 'Rock climbing', 'Running (5K)', 'Running (10K)', 'Half marathon', 'Full marathon',
  'Cycling', 'Skiing / snowboarding', 'Basketball', 'Soccer', 'Tennis', 'Pickleball',
  'Swimming', 'Hiking', 'Martial arts', 'Pull-ups (first one)', 'Handstand', 'Backflip',
];

const TIMEFRAMES = [
  { weeks: 4, label: '4 weeks' },
  { weeks: 8, label: '8 weeks' },
  { weeks: 12, label: '12 weeks' },
  { weeks: 0, label: 'Ongoing' },
];

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

export function GoalsScreen({ navigation }: Props) {
  const { setGoals } = useProfileStore();
  const [category, setCategory] = useState<GoalCategory>('build_muscle');
  const [specificActivity, setSpecificActivity] = useState('');
  const [customActivity, setCustomActivity] = useState('');
  const [targetWeeks, setTargetWeeks] = useState(12);

  const handleNext = () => {
    const goal = {
      id: Math.random().toString(36).slice(2),
      category,
      specific_activity: category === 'specific_activity' ? (specificActivity || customActivity) : undefined,
      target_weeks: targetWeeks,
    };
    setGoals([goal]);
    navigation.navigate('GeneratingPlan');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24 }}>
        <ProgressBar step={5} total={5} />

        <Text style={{ fontSize: 28, fontWeight: '900', color: Colors.text, marginBottom: 8 }}>What's your goal?</Text>
        <Text style={{ color: Colors.textSecondary, fontSize: 16, marginBottom: 32 }}>This is the most important question — take your time.</Text>

        {/* Goal category */}
        <View style={{ gap: 10, marginBottom: 32 }}>
          {GOAL_OPTIONS.map((g) => {
            const isSelected = category === g.value;
            return (
              <TouchableOpacity
                key={g.value}
                onPress={() => setCategory(g.value)}
                style={{
                  padding: 16,
                  borderRadius: 14,
                  backgroundColor: isSelected ? Colors.primary + '22' : Colors.surface2,
                  borderWidth: 1.5,
                  borderColor: isSelected ? Colors.primary : Colors.border,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                }}
              >
                <View style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  backgroundColor: isSelected ? Colors.primary + '33' : Colors.surface3,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Ionicons name={g.icon} size={22} color={isSelected ? Colors.primary : Colors.textSecondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: Colors.text, fontWeight: '700', fontSize: 15 }}>{g.label}</Text>
                  <Text style={{ color: Colors.textSecondary, fontSize: 13, marginTop: 2 }}>{g.desc}</Text>
                </View>
                {isSelected && <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Specific activity picker */}
        {category === 'specific_activity' && (
          <View style={{ marginBottom: 32 }}>
            <Text style={{ color: Colors.textSecondary, fontSize: 13, fontWeight: '600', letterSpacing: 0.5, marginBottom: 12 }}>
              WHAT ACTIVITY?
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {ACTIVITIES.map((a) => (
                <TouchableOpacity
                  key={a}
                  onPress={() => { setSpecificActivity(a); setCustomActivity(''); }}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 20,
                    backgroundColor: specificActivity === a ? Colors.primary + '22' : Colors.surface2,
                    borderWidth: 1.5,
                    borderColor: specificActivity === a ? Colors.primary : Colors.border,
                  }}
                >
                  <Text style={{ color: specificActivity === a ? Colors.primary : Colors.text, fontWeight: '600', fontSize: 13 }}>{a}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              placeholder="Or type your own..."
              placeholderTextColor={Colors.muted}
              value={customActivity}
              onChangeText={(t) => { setCustomActivity(t); setSpecificActivity(''); }}
              style={{
                backgroundColor: Colors.surface2,
                borderWidth: 1,
                borderColor: Colors.border,
                borderRadius: 12,
                padding: 14,
                color: Colors.text,
                fontSize: 15,
              }}
            />
          </View>
        )}

        {/* Timeframe */}
        <Text style={{ color: Colors.textSecondary, fontSize: 13, fontWeight: '600', letterSpacing: 0.5, marginBottom: 12 }}>
          TARGET TIMEFRAME
        </Text>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 40 }}>
          {TIMEFRAMES.map((t) => (
            <TouchableOpacity
              key={t.weeks}
              onPress={() => setTargetWeeks(t.weeks)}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 12,
                alignItems: 'center',
                backgroundColor: targetWeeks === t.weeks ? Colors.primary + '22' : Colors.surface2,
                borderWidth: 1.5,
                borderColor: targetWeeks === t.weeks ? Colors.primary : Colors.border,
              }}
            >
              <Text style={{ color: targetWeeks === t.weeks ? Colors.primary : Colors.text, fontWeight: '700', fontSize: 13 }}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Button title="Build My Plan" onPress={handleNext} size="lg" />
      </ScrollView>
    </SafeAreaView>
  );
}
