import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { MainTabParamList } from '../types';
import { TodayNavigator } from './TodayNavigator';
import { ProgressScreen } from '../screens/progress/ProgressScreen';
import { NutritionScreen } from '../screens/nutrition/NutritionScreen';
// Social removed in 1.0.8 — to be rebuilt as a richer experience once the user base grows
import { StoreScreen } from '../screens/store/StoreScreen';
import { ProfileNavigator } from './ProfileNavigator';
import { Colors } from '../constants/theme';

const Tab = createBottomTabNavigator<MainTabParamList>();

const TAB_ICONS: Record<string, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
  Today:     { active: 'flash',      inactive: 'flash-outline' },
  Progress:  { active: 'bar-chart',  inactive: 'bar-chart-outline' },
  Nutrition: { active: 'restaurant', inactive: 'restaurant-outline' },
  Store:     { active: 'bag',        inactive: 'bag-outline' },
  Profile:   { active: 'person',     inactive: 'person-outline' },
};

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons = TAB_ICONS[name];
  return (
    <Ionicons
      name={focused ? icons.active : icons.inactive}
      size={24}
      color={focused ? Colors.primary : Colors.muted}
    />
  );
}

export function MainTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused }) => <TabIcon name={route.name} focused={focused} />,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.muted,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          height: 80,
          paddingBottom: 16,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      })}
    >
      <Tab.Screen name="Today" component={TodayNavigator} />
      <Tab.Screen name="Progress" component={ProgressScreen} />
      <Tab.Screen name="Nutrition" component={NutritionScreen} />
      <Tab.Screen name="Store" component={StoreScreen} />
      <Tab.Screen name="Profile" component={ProfileNavigator} />
    </Tab.Navigator>
  );
}
