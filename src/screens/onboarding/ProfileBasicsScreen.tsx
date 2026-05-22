import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OnboardingStackParamList, FitnessLevel } from '../../types';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useProfileStore } from '../../store/profileStore';
import { Colors } from '../../constants/theme';

type Props = {
  navigation: NativeStackNavigationProp<OnboardingStackParamList, 'ProfileBasics'>;
};

const FITNESS_LEVELS: { value: FitnessLevel; label: string; desc: string }[] = [
  { value: 'beginner', label: 'New to it', desc: 'Just starting out' },
  { value: 'some_experience', label: 'Some experience', desc: '6 months to 2 years' },
  { value: 'experienced', label: 'Experienced', desc: '2–5 years consistent' },
  { value: 'advanced', label: 'Advanced', desc: '5+ years, compete or coach' },
];

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <View style={{ marginBottom: 32 }}>
      <Text style={{ color: Colors.muted, fontSize: 12, fontWeight: '600', marginBottom: 8 }}>
        STEP {step} OF {total}
      </Text>
      <View style={{ height: 4, backgroundColor: Colors.surface3, borderRadius: 2 }}>
        <View
          style={{
            height: 4,
            width: `${(step / total) * 100}%`,
            backgroundColor: Colors.primary,
            borderRadius: 2,
          }}
        />
      </View>
    </View>
  );
}

export function ProfileBasicsScreen({ navigation }: Props) {
  const { profile, setProfile } = useProfileStore();

  const [name, setName] = useState(profile?.name ?? '');
  const [age, setAge] = useState(String(profile?.age ?? ''));
  const [heightCm, setHeightCm] = useState(String(profile?.height_cm ?? ''));
  const [heightFt, setHeightFt] = useState(() => {
    if (!profile?.height_cm) return '';
    const totalIn = profile.height_cm / 2.54;
    return String(Math.floor(totalIn / 12));
  });
  const [heightIn, setHeightIn] = useState(() => {
    if (!profile?.height_cm) return '';
    const totalIn = profile.height_cm / 2.54;
    return String(Math.round(totalIn % 12));
  });
  const [heightUnit, setHeightUnit] = useState<'cm' | 'ft'>('ft');
  const [weight, setWeight] = useState(() => {
    if (!profile?.weight_kg) return '';
    return (profile.weight_kg * 2.20462).toFixed(1);
  });
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lbs'>('lbs');
  const [sex, setSex] = useState<'male' | 'female'>(profile?.sex ?? 'male');

  const toggleHeightUnit = (unit: 'cm' | 'ft') => {
    if (unit === heightUnit) return;
    if (unit === 'ft') {
      const cm = parseFloat(heightCm);
      if (!isNaN(cm)) {
        const totalIn = cm / 2.54;
        setHeightFt(String(Math.floor(totalIn / 12)));
        setHeightIn(String(Math.round(totalIn % 12)));
      }
    } else {
      const ft = parseFloat(heightFt) || 0;
      const inches = parseFloat(heightIn) || 0;
      setHeightCm(((ft * 12 + inches) * 2.54).toFixed(1));
    }
    setHeightUnit(unit);
  };
  const [fitnessLevel, setFitnessLevel] = useState<FitnessLevel>(
    profile?.fitness_level ?? 'some_experience'
  );

  const toggleWeightUnit = (unit: 'kg' | 'lbs') => {
    if (unit === weightUnit) return;
    const val = parseFloat(weight);
    if (!isNaN(val)) {
      const converted = unit === 'lbs' ? val * 2.20462 : val * 0.453592;
      setWeight(converted.toFixed(1));
    }
    setWeightUnit(unit);
  };

  const handleNext = () => {
    const heightValid = heightUnit === 'cm' ? !!heightCm : !!heightFt;
    if (!name.trim() || !age || !heightValid || !weight) return;
    const rawWeight = parseFloat(weight);
    const weightKg = weightUnit === 'lbs' ? rawWeight * 0.453592 : rawWeight;
    const finalHeightCm = heightUnit === 'ft'
      ? ((parseFloat(heightFt) || 0) * 12 + (parseFloat(heightIn) || 0)) * 2.54
      : parseFloat(heightCm);
    setProfile({
      name: name.trim(),
      age: parseInt(age, 10),
      height_cm: parseFloat(finalHeightCm.toFixed(1)),
      weight_kg: parseFloat(weightKg.toFixed(1)),
      sex,
      fitness_level: fitnessLevel,
    });
    navigation.navigate('Injuries');
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, padding: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <ProgressBar step={1} total={5} />

          <Text style={{ fontSize: 28, fontWeight: '900', color: Colors.text, marginBottom: 8 }}>
            Let's get to know you
          </Text>
          <Text style={{ color: Colors.textSecondary, fontSize: 16, marginBottom: 32 }}>
            This helps us build a plan that actually fits your body.
          </Text>

          <Input
            label="Your name"
            value={name}
            onChangeText={setName}
            placeholder="First name"
            autoCapitalize="words"
          />

          <Input
            label="Age"
            value={age}
            onChangeText={setAge}
            placeholder="e.g. 28"
            keyboardType="number-pad"
          />

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <Text style={{ color: Colors.textSecondary, fontSize: 13, fontWeight: '600', letterSpacing: 0.5 }}>HEIGHT</Text>
                <View style={{ flexDirection: 'row', borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border }}>
                  {(['cm', 'ft'] as const).map((u) => (
                    <TouchableOpacity key={u} onPress={() => toggleHeightUnit(u)}
                      style={{ paddingHorizontal: 10, paddingVertical: 4, backgroundColor: heightUnit === u ? Colors.primary : Colors.surface2 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: heightUnit === u ? Colors.background : Colors.textSecondary }}>{u}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              {heightUnit === 'cm' ? (
                <Input value={heightCm} onChangeText={setHeightCm} placeholder="e.g. 175" keyboardType="decimal-pad" />
              ) : (
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <View style={{ flex: 1 }}>
                    <Input value={heightFt} onChangeText={setHeightFt} placeholder="ft" keyboardType="number-pad" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Input value={heightIn} onChangeText={setHeightIn} placeholder="in" keyboardType="number-pad" />
                  </View>
                </View>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <Text style={{ color: Colors.textSecondary, fontSize: 13, fontWeight: '600', letterSpacing: 0.5 }}>WEIGHT</Text>
                <View style={{ flexDirection: 'row', borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border }}>
                  {(['kg', 'lbs'] as const).map((u) => (
                    <TouchableOpacity
                      key={u}
                      onPress={() => toggleWeightUnit(u)}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        backgroundColor: weightUnit === u ? Colors.primary : Colors.surface2,
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: weightUnit === u ? Colors.background : Colors.textSecondary }}>
                        {u}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <Input
                value={weight}
                onChangeText={setWeight}
                placeholder={weightUnit === 'kg' ? 'e.g. 75' : 'e.g. 165'}
                keyboardType="decimal-pad"
              />
            </View>
          </View>

          {/* Sex */}
          <Text style={{ color: Colors.textSecondary, fontSize: 13, marginBottom: 8, fontWeight: '600', letterSpacing: 0.5 }}>
            SEX (FOR PROGRAMMING NORMS)
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 24 }}>
            {(['male', 'female'] as const).map((s) => (
              <TouchableOpacity
                key={s}
                onPress={() => setSex(s)}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 10,
                  alignItems: 'center',
                  backgroundColor: sex === s ? Colors.primary + '22' : Colors.surface2,
                  borderWidth: 1.5,
                  borderColor: sex === s ? Colors.primary : Colors.border,
                }}
              >
                <Text style={{ color: sex === s ? Colors.primary : Colors.text, fontWeight: '600', textTransform: 'capitalize' }}>
                  {s}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Fitness level */}
          <Text style={{ color: Colors.textSecondary, fontSize: 13, marginBottom: 8, fontWeight: '600', letterSpacing: 0.5 }}>
            FITNESS LEVEL
          </Text>
          <View style={{ gap: 8, marginBottom: 32 }}>
            {FITNESS_LEVELS.map((fl) => (
              <TouchableOpacity
                key={fl.value}
                onPress={() => setFitnessLevel(fl.value)}
                style={{
                  padding: 14,
                  borderRadius: 12,
                  backgroundColor: fitnessLevel === fl.value ? Colors.primary + '22' : Colors.surface2,
                  borderWidth: 1.5,
                  borderColor: fitnessLevel === fl.value ? Colors.primary : Colors.border,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <View>
                  <Text style={{ color: Colors.text, fontWeight: '700', fontSize: 15 }}>{fl.label}</Text>
                  <Text style={{ color: Colors.textSecondary, fontSize: 13, marginTop: 2 }}>{fl.desc}</Text>
                </View>
                {fitnessLevel === fl.value && (
                  <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>

          <Button
            title="Next →"
            onPress={handleNext}
            size="lg"
            disabled={!name.trim() || !age || !(heightUnit === 'cm' ? heightCm : heightFt) || !weight}
          />
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
