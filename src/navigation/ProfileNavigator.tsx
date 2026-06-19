import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ProfileStackParamList } from '../types';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { WearablesScreen } from '../screens/profile/WearablesScreen';
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
    </Stack.Navigator>
  );
}
