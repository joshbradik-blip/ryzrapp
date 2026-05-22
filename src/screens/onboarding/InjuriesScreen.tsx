import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OnboardingStackParamList, Injury, InjurySeverity } from '../../types';
import { Button } from '../../components/ui/Button';
import { useProfileStore } from '../../store/profileStore';
import { Colors } from '../../constants/theme';

type Props = {
  navigation: NativeStackNavigationProp<OnboardingStackParamList, 'Injuries'>;
};

const BODY_PARTS = [
  'lower_back', 'knees', 'left_shoulder', 'right_shoulder',
  'wrists', 'elbows', 'neck', 'hips', 'ankles',
];

const PART_LABELS: Record<string, string> = {
  lower_back: 'Lower Back', knees: 'Knees', left_shoulder: 'Left Shoulder',
  right_shoulder: 'Right Shoulder', wrists: 'Wrists', elbows: 'Elbows',
  neck: 'Neck', hips: 'Hips', ankles: 'Ankles',
};

const SEVERITY_OPTIONS: { value: InjurySeverity; label: string; color: string }[] = [
  { value: 'cautious', label: 'Cautious', color: Colors.warning },
  { value: 'active_pain', label: 'Active pain', color: '#FF8844' },
  { value: 'avoid', label: 'Avoid entirely', color: Colors.danger },
];

const DISABILITY_OPTIONS = [
  { id: 'wheelchair',        label: 'Wheelchair user' },
  { id: 'amputee_arm_left',  label: 'Missing / prosthetic left arm' },
  { id: 'amputee_arm_right', label: 'Missing / prosthetic right arm' },
  { id: 'amputee_leg_left',  label: 'Missing / prosthetic left leg' },
  { id: 'amputee_leg_right', label: 'Missing / prosthetic right leg' },
  { id: 'visually_impaired', label: 'Visually impaired / blind' },
  { id: 'hearing_impaired',  label: 'Hearing impaired / deaf' },
  { id: 'limited_upper',     label: 'Limited upper body mobility' },
  { id: 'limited_lower',     label: 'Limited lower body mobility' },
];

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <View style={{ marginBottom: 32 }}>
      <Text style={{ color: Colors.muted, fontSize: 12, fontWeight: '600', marginBottom: 8 }}>
        STEP {step} OF {total}
      </Text>
      <View style={{ height: 4, backgroundColor: Colors.surface3, borderRadius: 2 }}>
        <View style={{ height: 4, width: `${(step / total) * 100}%`, backgroundColor: Colors.primary, borderRadius: 2 }} />
      </View>
    </View>
  );
}

export function InjuriesScreen({ navigation }: Props) {
  const { setInjuries, setDisabilities } = useProfileStore();
  const [selected, setSelected] = useState<Record<string, InjurySeverity>>({});
  const [noInjuries, setNoInjuries] = useState(false);
  const [selectedDisabilities, setSelectedDisabilities] = useState<string[]>([]);
  const [customDisability, setCustomDisability] = useState('');

  const togglePart = (part: string) => {
    setNoInjuries(false);
    setSelected((prev) => {
      if (prev[part]) {
        const next = { ...prev };
        delete next[part];
        return next;
      }
      return { ...prev, [part]: 'cautious' };
    });
  };

  const setSeverity = (part: string, severity: InjurySeverity) => {
    setSelected((prev) => ({ ...prev, [part]: severity }));
  };

  const toggleDisability = (id: string) => {
    setSelectedDisabilities((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  };

  const handleNext = () => {
    if (noInjuries) {
      setInjuries([]);
    } else {
      const injuries: Injury[] = Object.entries(selected).map(([part, severity]) => ({
        id: Math.random().toString(36).slice(2),
        body_part: part,
        severity,
      }));
      setInjuries(injuries);
    }
    const allDisabilities = customDisability.trim()
      ? [...selectedDisabilities, customDisability.trim()]
      : selectedDisabilities;
    setDisabilities(allDisabilities);
    navigation.navigate('Schedule');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24 }} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginBottom: 8 }}>
          <Ionicons name="chevron-back" size={28} color={Colors.text} />
        </TouchableOpacity>
        <ProgressBar step={2} total={5} />

        <Text style={{ fontSize: 28, fontWeight: '900', color: Colors.text, marginBottom: 8 }}>
          Any injuries or limitations?
        </Text>
        <Text style={{ color: Colors.textSecondary, fontSize: 16, marginBottom: 32 }}>
          We'll work around anything that needs it.
        </Text>

        {/* No injuries toggle */}
        <TouchableOpacity
          onPress={() => { setNoInjuries((v) => !v); setSelected({}); }}
          style={{
            padding: 14,
            borderRadius: 12,
            backgroundColor: noInjuries ? Colors.primary + '22' : Colors.surface2,
            borderWidth: 1.5,
            borderColor: noInjuries ? Colors.primary : Colors.border,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
          }}
        >
          <Text style={{ color: Colors.text, fontWeight: '700', fontSize: 15 }}>I have no injuries</Text>
          {noInjuries && <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />}
        </TouchableOpacity>

        {/* Body parts grid */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
          {BODY_PARTS.map((part) => {
            const isSelected = !!selected[part];
            return (
              <TouchableOpacity
                key={part}
                onPress={() => togglePart(part)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: 20,
                  backgroundColor: isSelected ? Colors.warning + '22' : Colors.surface2,
                  borderWidth: 1.5,
                  borderColor: isSelected ? Colors.warning : Colors.border,
                }}
              >
                <Text style={{ color: isSelected ? Colors.warning : Colors.text, fontWeight: '600', fontSize: 14 }}>
                  {PART_LABELS[part]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Severity selectors for selected parts */}
        {Object.keys(selected).length > 0 && (
          <View style={{ gap: 16, marginBottom: 32 }}>
            {Object.keys(selected).map((part) => (
              <View key={part} style={{ backgroundColor: Colors.surface2, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border }}>
                <Text style={{ color: Colors.text, fontWeight: '700', marginBottom: 10 }}>{PART_LABELS[part]}</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {SEVERITY_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt.value}
                      onPress={() => setSeverity(part, opt.value)}
                      style={{
                        flex: 1,
                        paddingVertical: 8,
                        borderRadius: 8,
                        alignItems: 'center',
                        backgroundColor: selected[part] === opt.value ? opt.color + '33' : Colors.surface3,
                        borderWidth: 1,
                        borderColor: selected[part] === opt.value ? opt.color : Colors.border,
                      }}
                    >
                      <Text style={{ color: selected[part] === opt.value ? opt.color : Colors.textSecondary, fontSize: 12, fontWeight: '600' }}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Disabilities section */}
        <View style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 20, fontWeight: '900', color: Colors.text, marginBottom: 4 }}>
            Any disabilities?
          </Text>
          <Text style={{ color: Colors.textSecondary, fontSize: 14, marginBottom: 16 }}>
            We'll adapt your plan accordingly.
          </Text>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
            {DISABILITY_OPTIONS.map((d) => {
              const isSelected = selectedDisabilities.includes(d.id);
              return (
                <TouchableOpacity
                  key={d.id}
                  onPress={() => toggleDisability(d.id)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 20,
                    backgroundColor: isSelected ? Colors.primary + '22' : Colors.surface2,
                    borderWidth: 1.5,
                    borderColor: isSelected ? Colors.primary : Colors.border,
                  }}
                >
                  <Text style={{ color: isSelected ? Colors.primary : Colors.text, fontWeight: '600', fontSize: 14 }}>
                    {d.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TextInput
            placeholder="Other — describe your situation..."
            placeholderTextColor={Colors.muted}
            value={customDisability}
            onChangeText={setCustomDisability}
            style={{
              backgroundColor: Colors.surface2,
              borderWidth: 1,
              borderColor: Colors.border,
              borderRadius: 12,
              padding: 14,
              color: Colors.text,
              fontSize: 15,
              marginBottom: 32,
            }}
          />
        </View>

        <Button title="Next →" onPress={handleNext} size="lg" />
      </ScrollView>
    </SafeAreaView>
  );
}
