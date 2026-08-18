import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ProfileStackParamList } from '../types';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { WearablesScreen } from '../screens/profile/WearablesScreen';
import { ReferralScreen } from '../screens/profile/ReferralScreen';
import { ProfileBasicsScreen } from '../screens/onboarding/ProfileBasicsScreen';
import { InjuriesScreen } from '../screens/onboarding/InjuriesScreen';
import { ScheduleScreen } from '../screens/onboarding/ScheduleScreen';
import { EquipmentScreen } from '../screens/onboarding/EquipmentScreen';
import { GoalsScreen } from '../screens/onboarding/GoalsScreen';
import { ChoosePlanScreen } from '../screens/onboarding/ChoosePlanScreen';
import { GeneratingPlanScreen } from '../screens/onboarding/GeneratingPlanScreen';
import { Colors } from '../constants/theme';

const Stack = createNativeStackNavigator<ProfileStackParamList>();

export function ProfileNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: Colors.background },
        headerTintColor: Colors.text,
        headerTitleStyle: { fontWeight: '700', color: Colors.text },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="ProfileHome" component={ProfileScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="Wearables"
        component={WearablesScreen}
        options={{ title: 'Wearables', headerBackTitle: '' }}
      />
      <Stack.Screen name="Referral" component={ReferralScreen} options={{ headerShown: false }} />

      {/* Shared with OnboardingNavigator — lets a premium user re-run the
          questionnaire from Profile ("Edit training profile"). Screens have
          their own in-flow back chevrons, so hide the native header here to
          avoid a double back button. */}
      <Stack.Screen name="ProfileBasics" component={ProfileBasicsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Injuries" component={InjuriesScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Schedule" component={ScheduleScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Equipment" component={EquipmentScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Goals" component={GoalsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ChoosePlan" component={ChoosePlanScreen} options={{ headerShown: false }} />
      <Stack.Screen name="GeneratingPlan" component={GeneratingPlanScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
