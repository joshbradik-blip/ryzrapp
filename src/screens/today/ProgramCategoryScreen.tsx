// Every program in one category, reached from "See all" on the Today tab.

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { ProgramCard } from '../../components/today/ProgramCard';
import { Colors } from '../../constants/theme';
import { fetchPrograms } from '../../lib/programs';
import type { TodayStackParamList, WorkoutProgram } from '../../types';

export function ProgramCategoryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<TodayStackParamList>>();
  const { category } = useRoute<RouteProp<TodayStackParamList, 'ProgramCategory'>>().params;

  const [programs, setPrograms] = useState<WorkoutProgram[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    navigation.setOptions({ title: category });
  }, [navigation, category]);

  useEffect(() => {
    let active = true;
    fetchPrograms()
      .then((all) => {
        if (!active) return;
        setPrograms(all.filter((p) => p.category === category));
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [category]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background, justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.primary} />
      </SafeAreaView>
    );
  }

  // Reachable when the last program in a category is hidden between the Today
  // tab loading its rows and the user tapping through.
  if (programs.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Ionicons name="file-tray-outline" size={40} color={Colors.muted} />
          <Text style={{ color: Colors.text, fontSize: 17, fontWeight: '700', marginTop: 12 }}>
            Nothing here yet
          </Text>
          <Text style={{ color: Colors.textSecondary, fontSize: 14, textAlign: 'center', marginTop: 6 }}>
            No {category.toLowerCase()} programs are available right now.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }}>
        {programs.map((program) => (
          <ProgramCard
            key={program.id}
            program={program}
            wide
            onPress={() => navigation.navigate('ProgramDetail', { programId: program.id })}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
