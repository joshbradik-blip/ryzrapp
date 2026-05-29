import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TodayStackParamList } from '../types';
import { TodayScreen } from '../screens/today/TodayScreen';
import { WorkoutSessionScreen } from '../screens/today/WorkoutSessionScreen';
import { ExerciseDetailScreen } from '../screens/today/ExerciseDetailScreen';
import { SubstituteExerciseScreen } from '../screens/today/SubstituteExerciseScreen';
import { WorkoutCompleteScreen } from '../screens/today/WorkoutCompleteScreen';
import { Colors } from '../constants/theme';

// Lazy-load FormCoachScreen so Vision Camera is only initialized when the user
// navigates to Form Coach, preventing a startup SIGABRT from early native API access.
function LazyFormCoachScreen(props: any) {
  const { FormCoachScreen } = require('../screens/today/FormCoachScreen');
  return <FormCoachScreen {...props} />;
}

const Stack = createNativeStackNavigator<TodayStackParamList>();

export function TodayNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: Colors.background },
        headerTintColor: Colors.text,
        headerTitleStyle: { fontWeight: '700', color: Colors.text },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="TodayHome" component={TodayScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="WorkoutSession"
        component={WorkoutSessionScreen}
        options={{ title: 'Workout', headerBackTitle: '' }}
      />
      <Stack.Screen
        name="ExerciseDetail"
        component={ExerciseDetailScreen}
        options={{ title: 'Exercise', headerBackTitle: '' }}
      />
      <Stack.Screen
        name="SubstituteExercise"
        component={SubstituteExerciseScreen}
        options={{ title: 'Swap Exercise', headerBackTitle: '' }}
      />
      <Stack.Screen
        name="FormCoach"
        component={LazyFormCoachScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="WorkoutComplete"
        component={WorkoutCompleteScreen}
        options={{ headerShown: false, gestureEnabled: false }}
      />
    </Stack.Navigator>
  );
}
