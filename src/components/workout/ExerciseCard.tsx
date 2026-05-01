import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { WorkoutExercise } from '../../types';
import { Colors } from '../../constants/theme';

interface ExerciseCardProps {
  workoutExercise: WorkoutExercise;
  index: number;
  onPress?: () => void;
  completed?: boolean;
}

const CATEGORY_COLORS: Record<string, string> = {
  lower_body: '#FF8C44',
  upper_push: '#4488FF',
  upper_pull: '#AA44FF',
  posterior_chain: '#FF4488',
  core: '#44DDFF',
  cardio: '#FFD644',
  power: '#FF4444',
};

export function ExerciseCard({ workoutExercise, index, onPress, completed }: ExerciseCardProps) {
  const { exercise, target_sets, target_reps, target_rpe, rest_seconds } = workoutExercise;
  const color = CATEGORY_COLORS[exercise.category] ?? Colors.primary;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        backgroundColor: Colors.surface,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: completed ? Colors.primary + '44' : Colors.border,
        padding: 16,
        marginBottom: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        opacity: completed ? 0.6 : 1,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: color + '22',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color, fontSize: 16, fontWeight: '700' }}>{index + 1}</Text>
      </View>

      <View style={{ flex: 1 }}>
        <Text style={{ color: Colors.text, fontSize: 15, fontWeight: '700' }}>{exercise.name}</Text>
        <Text style={{ color: Colors.textSecondary, fontSize: 13, marginTop: 2 }}>
          {target_sets} sets × {target_reps} reps
          {target_rpe > 0 ? ` · RPE ${target_rpe}` : ''}
          {rest_seconds > 0 ? ` · ${rest_seconds}s rest` : ''}
        </Text>
        {workoutExercise.notes ? (
          <Text style={{ color: Colors.muted, fontSize: 12, marginTop: 4, fontStyle: 'italic' }}>
            {workoutExercise.notes}
          </Text>
        ) : null}
      </View>

      {completed && (
        <Text style={{ color: Colors.primary, fontSize: 20 }}>✓</Text>
      )}
    </TouchableOpacity>
  );
}
