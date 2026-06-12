import React from 'react';
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/theme';

export function SocialScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={{ padding: 24, paddingBottom: 0 }}>
        <Text style={{ color: Colors.text, fontSize: 26, fontWeight: '900' }}>Social</Text>
      </View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <View style={{
          width: 80,
          height: 80,
          borderRadius: 40,
          backgroundColor: Colors.primary + '22',
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 2,
          borderColor: Colors.primary + '55',
          marginBottom: 20,
        }}>
          <Ionicons name="people-outline" size={40} color={Colors.primary} />
        </View>
        <Text style={{ color: Colors.text, fontSize: 22, fontWeight: '900', textAlign: 'center', marginBottom: 10 }}>
          Social features launching soon
        </Text>
        <Text style={{ color: Colors.textSecondary, fontSize: 15, textAlign: 'center', lineHeight: 22 }}>
          Connect with other athletes, share your progress, and join challenges. Check back soon!
        </Text>
      </View>
    </SafeAreaView>
  );
}
