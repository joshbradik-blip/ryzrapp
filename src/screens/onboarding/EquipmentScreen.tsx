import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OnboardingStackParamList } from '../../types';
import { Button } from '../../components/ui/Button';
import { useProfileStore } from '../../store/profileStore';
import { Colors } from '../../constants/theme';

type Props = {
  navigation: NativeStackNavigationProp<OnboardingStackParamList, 'Equipment'>;
};

const EQUIPMENT_OPTIONS: { id: string; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'dumbbell',         label: 'Dumbbells',         icon: 'barbell-outline' },
  { id: 'barbell',          label: 'Barbell + Plates',  icon: 'barbell-outline' },
  { id: 'kettlebell',       label: 'Kettlebells',        icon: 'ellipse-outline' },
  { id: 'resistance_band',  label: 'Resistance Bands',  icon: 'git-branch-outline' },
  { id: 'pull_up_bar',      label: 'Pull-Up Bar',        icon: 'trending-up-outline' },
  { id: 'bench',            label: 'Bench',              icon: 'reorder-two-outline' },
  { id: 'cable_machine',    label: 'Cable Machine',      icon: 'settings-outline' },
  { id: 'cardio_treadmill', label: 'Treadmill',          icon: 'walk-outline' },
  { id: 'cardio_bike',      label: 'Exercise Bike',      icon: 'bicycle-outline' },
  { id: 'cardio_rower',     label: 'Rowing Machine',     icon: 'boat-outline' },
  { id: 'box',              label: 'Plyo Box',           icon: 'cube-outline' },
  { id: 'jump_rope',        label: 'Jump Rope',          icon: 'git-commit-outline' },
];

const ALL_EQUIPMENT_IDS = EQUIPMENT_OPTIONS.map((e) => e.id);

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

export function EquipmentScreen({ navigation }: Props) {
  const { setEquipment } = useProfileStore();
  const [selected, setSelected] = useState<string[]>([]);
  const [bodyweightOnly, setBodyweightOnly] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const [customEquipment, setCustomEquipment] = useState<string[]>([]);

  const fullGym = ALL_EQUIPMENT_IDS.every((id) => selected.includes(id));

  const toggle = (id: string) => {
    setBodyweightOnly(false);
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]
    );
  };

  const toggleFullGym = () => {
    setBodyweightOnly(false);
    if (fullGym) {
      setSelected([]);
    } else {
      setSelected([...ALL_EQUIPMENT_IDS]);
    }
  };

  const addCustom = () => {
    const trimmed = customInput.trim();
    if (!trimmed) return;
    if (customEquipment.includes(trimmed)) {
      setCustomInput('');
      return;
    }
    setBodyweightOnly(false);
    setCustomEquipment((prev) => [...prev, trimmed]);
    setCustomInput('');
  };

  const removeCustom = (item: string) => {
    setCustomEquipment((prev) => prev.filter((e) => e !== item));
  };

  const handleNext = () => {
    const finalEquipment = bodyweightOnly
      ? []
      : [...selected, ...customEquipment];
    setEquipment(finalEquipment);
    navigation.navigate('Goals');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24 }} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginBottom: 8 }}>
          <Ionicons name="chevron-back" size={28} color={Colors.text} />
        </TouchableOpacity>
        <ProgressBar step={4} total={5} />

        <Text style={{ fontSize: 28, fontWeight: '900', color: Colors.text, marginBottom: 8 }}>Your equipment</Text>
        <Text style={{ color: Colors.textSecondary, fontSize: 16, marginBottom: 24 }}>
          We'll only program exercises you can actually do.
        </Text>

        {/* Bodyweight only */}
        <TouchableOpacity
          onPress={() => { setBodyweightOnly((v) => !v); setSelected([]); setCustomEquipment([]); }}
          style={{
            padding: 14, borderRadius: 12, marginBottom: 10,
            backgroundColor: bodyweightOnly ? Colors.primary + '22' : Colors.surface2,
            borderWidth: 1.5,
            borderColor: bodyweightOnly ? Colors.primary : Colors.border,
            flexDirection: 'row', alignItems: 'center', gap: 12,
          }}
        >
          <Ionicons name="body-outline" size={22} color={bodyweightOnly ? Colors.primary : Colors.textSecondary} />
          <Text style={{ color: Colors.text, fontWeight: '700', fontSize: 15, flex: 1 }}>Bodyweight only</Text>
          {bodyweightOnly && <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />}
        </TouchableOpacity>

        {/* Full Gym */}
        <TouchableOpacity
          onPress={toggleFullGym}
          style={{
            padding: 14, borderRadius: 12, marginBottom: 16,
            backgroundColor: fullGym ? Colors.primary + '22' : Colors.surface2,
            borderWidth: 1.5,
            borderColor: fullGym ? Colors.primary : Colors.border,
            flexDirection: 'row', alignItems: 'center', gap: 12,
          }}
        >
          <Ionicons name="fitness-outline" size={22} color={fullGym ? Colors.primary : Colors.textSecondary} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: Colors.text, fontWeight: '700', fontSize: 15 }}>Full Gym</Text>
            <Text style={{ color: Colors.textSecondary, fontSize: 12, marginTop: 1 }}>Selects every item below</Text>
          </View>
          {fullGym && <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />}
        </TouchableOpacity>

        {/* Equipment grid */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 28 }}>
          {EQUIPMENT_OPTIONS.map((eq) => {
            const isSelected = selected.includes(eq.id);
            return (
              <TouchableOpacity
                key={eq.id}
                onPress={() => toggle(eq.id)}
                style={{
                  width: '47%',
                  padding: 14,
                  borderRadius: 12,
                  backgroundColor: isSelected ? Colors.primary + '22' : Colors.surface2,
                  borderWidth: 1.5,
                  borderColor: isSelected ? Colors.primary : Colors.border,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <Ionicons name={eq.icon} size={20} color={isSelected ? Colors.primary : Colors.textSecondary} />
                <Text style={{ color: Colors.text, fontWeight: '600', fontSize: 13, flex: 1 }}>{eq.label}</Text>
                {isSelected && <Ionicons name="checkmark" size={16} color={Colors.primary} />}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Other equipment */}
        <Text style={{ color: Colors.textSecondary, fontSize: 13, fontWeight: '600', letterSpacing: 0.5, marginBottom: 10 }}>
          OTHER EQUIPMENT
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          <TextInput
            value={customInput}
            onChangeText={setCustomInput}
            onSubmitEditing={addCustom}
            blurOnSubmit={false}
            placeholder="e.g. sled, sandbag, TRX"
            placeholderTextColor={Colors.muted}
            returnKeyType="done"
            style={{
              flex: 1,
              backgroundColor: Colors.surface2,
              borderRadius: 10,
              padding: 12,
              color: Colors.text,
              fontSize: 14,
              borderWidth: 1,
              borderColor: Colors.border,
            }}
          />
          <TouchableOpacity
            onPress={addCustom}
            disabled={!customInput.trim()}
            style={{
              paddingHorizontal: 16,
              borderRadius: 10,
              backgroundColor: customInput.trim() ? Colors.primary : Colors.surface3,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="add" size={22} color={customInput.trim() ? '#000' : Colors.muted} />
          </TouchableOpacity>
        </View>

        {customEquipment.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
            {customEquipment.map((item) => (
              <View
                key={item}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  backgroundColor: Colors.primary + '22',
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: Colors.primary + '55',
                }}
              >
                <Text style={{ color: Colors.text, fontSize: 13, fontWeight: '600' }}>{item}</Text>
                <TouchableOpacity onPress={() => removeCustom(item)}>
                  <Ionicons name="close-circle" size={16} color={Colors.primary} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <View style={{ marginTop: customEquipment.length > 0 ? 8 : 24 }}>
          <Button title="Next" onPress={handleNext} size="lg" />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
