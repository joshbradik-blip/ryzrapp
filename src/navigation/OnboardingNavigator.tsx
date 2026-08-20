import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { OnboardingStackParamList } from '../types';
import { PlanChoiceScreen } from '../screens/onboarding/PlanChoiceScreen';
import { PlanReadyScreen } from '../screens/onboarding/PlanReadyScreen';
import { ProfileBasicsScreen } from '../screens/onboarding/ProfileBasicsScreen';
import { InjuriesScreen } from '../screens/onboarding/InjuriesScreen';
import { ScheduleScreen } from '../screens/onboarding/ScheduleScreen';
import { EquipmentScreen } from '../screens/onboarding/EquipmentScreen';
import { GoalsScreen } from '../screens/onboarding/GoalsScreen';
import { ChoosePlanScreen } from '../screens/onboarding/ChoosePlanScreen';
import { GeneratingPlanScreen } from '../screens/onboarding/GeneratingPlanScreen';

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

export function OnboardingNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="PlanChoice" component={PlanChoiceScreen} />
      <Stack.Screen name="PlanReady" component={PlanReadyScreen} />
      <Stack.Screen name="ProfileBasics" component={ProfileBasicsScreen} />
      <Stack.Screen name="Injuries" component={InjuriesScreen} />
      <Stack.Screen name="Schedule" component={ScheduleScreen} />
      <Stack.Screen name="Equipment" component={EquipmentScreen} />
      <Stack.Screen name="Goals" component={GoalsScreen} />
      <Stack.Screen name="ChoosePlan" component={ChoosePlanScreen} />
      <Stack.Screen name="GeneratingPlan" component={GeneratingPlanScreen} />
    </Stack.Navigator>
  );
}
