import React, { useState } from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity } from 'react-native';
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

  const toggle = (id: string) => {
    setBodyweightOnly(false);
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]
    );
  };

  const handleNext = () => {
    setEquipment(bodyweightOnly ? [] : selected);
    navigation.navigate('Goals');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24 }}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginBottom: 8 }}>
          <Ionicons name="chevron-back" size={28} color={Colors.text} />
        </TouchableOpacity>
        <ProgressBar step={4} total={5} />

        <Text style={{ fontSize: 28, fontWeight: '900', color: Colors.text, marginBottom: 8 }}>Your equipment</Text>
        <Text style={{ color: Colors.textSecondary, fontSize: 16, marginBottom: 32 }}>
          We'll only program exercises you can actually do.
        </Text>

        {/* Bodyweight only */}
        <TouchableOpacity
          onPress={() => { setBodyweightOnly((v) => !v); setSelected([]); }}
          style={{
            padding: 14, borderRadius: 12, marginBottom: 16,
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

        {/* Equipment grid */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 40 }}>
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

        <Button title="Next" onPress={handleNext} size="lg" />
      </ScrollView>
    </SafeAreaView>
  );
}
