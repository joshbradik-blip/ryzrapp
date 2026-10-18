// One predesigned program, as a tappable card. Used in the Today tab's
// horizontal category rows (fixed width) and in the full category list
// (`wide`, filling the column).

import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/theme';
import type { WorkoutProgram } from '../../types';

/** 'Bodyweight' reads better than an empty line when nothing is needed. */
export function equipmentLabel(equipment: string[]): string {
  if (equipment.length === 0) return 'Bodyweight';
  return equipment.map((e) => e.charAt(0).toUpperCase() + e.slice(1)).join(' · ');
}

interface Props {
  program: WorkoutProgram;
  onPress: () => void;
  /** Fill the available width instead of the fixed row width. */
  wide?: boolean;
}

export function ProgramCard({ program, onPress, wide }: Props) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${program.name}, ${program.durationMin} minutes, ${program.difficulty}`}
      style={{
        width: wide ? undefined : 190,
        backgroundColor: Colors.surface,
        borderRadius: 14,
        padding: 14,
        marginRight: wide ? 0 : 10,
        marginBottom: wide ? 10 : 0,
        borderWidth: 1,
        borderColor: Colors.border,
        minHeight: 44,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {/* Icon comes from the database, so fall back when a row names one
            this build's Ionicons set does not have. */}
        <Ionicons
          name={(program.icon in Ionicons.glyphMap ? program.icon : 'body-outline') as keyof typeof Ionicons.glyphMap}
          size={18}
          color={Colors.primary}
        />
        <Text style={{ color: Colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>
          {program.durationMin} MIN
        </Text>
      </View>

      <Text
        style={{ color: Colors.text, fontSize: 15, fontWeight: '700', marginTop: 8 }}
        numberOfLines={2}
      >
        {program.name}
      </Text>

      <Text
        style={{ color: Colors.textSecondary, fontSize: 12, marginTop: 4, lineHeight: 17 }}
        numberOfLines={wide ? 3 : 2}
      >
        {program.goal ?? program.description}
      </Text>

      <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 8 }} numberOfLines={1}>
        {program.difficulty} · {equipmentLabel(program.equipment)}
      </Text>
    </TouchableOpacity>
  );
}
