// Focused program sections on the Today tab — one horizontal row per
// category (Flexibility, Balance, Strength, ...), each holding the programs
// in that category.
//
// Content comes from Supabase (src/lib/programs.ts), so the categories that
// appear, their order and their contents are all controlled from the Table
// Editor. When the fetch fails or nothing is active this renders nothing at
// all rather than an error or an empty heading — a Today tab that looks
// normal is better than one explaining a backend problem.

import React, { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors } from '../../constants/theme';
import { fetchProgramCategories } from '../../lib/programs';
import type { TodayStackParamList, WorkoutProgramCategory } from '../../types';
import { ProgramCard } from './ProgramCard';

/** Above this many in a category, the row gets a "See all" affordance. */
const SEE_ALL_THRESHOLD = 3;

export function ProgramSections() {
  const navigation = useNavigation<NativeStackNavigationProp<TodayStackParamList>>();
  const [categories, setCategories] = useState<WorkoutProgramCategory[]>([]);

  useEffect(() => {
    let active = true;
    fetchProgramCategories()
      .then((result) => {
        if (active) setCategories(result);
      })
      // fetchProgramCategories already swallows its own failures; this is a
      // belt-and-braces guard so a surprise never bubbles into the screen.
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (categories.length === 0) return null;

  return (
    <>
      {categories.map((category) => (
        <View key={category.title} style={{ paddingHorizontal: 24, marginTop: 20 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}
          >
            <Text style={{ color: Colors.text, fontSize: 18, fontWeight: '800' }}>
              {category.title}
            </Text>

            {category.programs.length > SEE_ALL_THRESHOLD && (
              <TouchableOpacity
                onPress={() => navigation.navigate('ProgramCategory', { category: category.title })}
                accessibilityRole="button"
                accessibilityLabel={`See all ${category.title} programs`}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
              >
                <Text style={{ color: Colors.primary, fontSize: 13, fontWeight: '700' }}>
                  See all
                </Text>
                <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
              </TouchableOpacity>
            )}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            // Bleed to the screen edge so cards scroll past the gutter, matching
            // the "Coming up" row above.
            style={{ marginHorizontal: -24 }}
            contentContainerStyle={{ paddingHorizontal: 24 }}
          >
            {category.programs.map((program) => (
              <ProgramCard
                key={program.id}
                program={program}
                onPress={() => navigation.navigate('ProgramDetail', { programId: program.id })}
              />
            ))}
          </ScrollView>
        </View>
      ))}
    </>
  );
}
