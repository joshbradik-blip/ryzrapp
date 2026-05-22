import React from 'react';
import {
  View,
  Text,
  StatusBar,
  ImageBackground,
  TouchableOpacity,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../types';
import { Button } from '../../components/ui/Button';
import { Colors } from '../../constants/theme';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Welcome'>;
};

export function WelcomeScreen({ navigation }: Props) {
  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <StatusBar barStyle="light-content" />

      {/* Hero gradient overlay */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '60%',
          backgroundColor: Colors.surface,
          opacity: 0.5,
        }}
      />

      {/* Logo area */}
      <View
        style={{
          flex: 1,
          paddingTop: 100,
          paddingHorizontal: 32,
          justifyContent: 'space-between',
          paddingBottom: 60,
        }}
      >
        <View style={{ alignItems: 'center' }}>
          {/* Brand mark */}
          <Image
            source={require('../../../assets/icon.png')}
            style={{
              width: 96,
              height: 96,
              borderRadius: 22,
              marginBottom: 24,
            }}
          />

          <Text
            style={{
              fontSize: 48,
              fontWeight: '900',
              color: Colors.text,
              letterSpacing: 8,
              marginBottom: 16,
            }}
          >
            RYZR
          </Text>

          <Text
            style={{
              fontSize: 18,
              color: Colors.textSecondary,
              textAlign: 'center',
              lineHeight: 26,
              maxWidth: 280,
            }}
          >
            Workouts built around your goals, body, and gear.
          </Text>

          <View style={{ marginTop: 48, flexDirection: 'row', gap: 24, justifyContent: 'center' }}>
            {([
              { label: 'AI Plans',    icon: 'hardware-chip-outline' },
              { label: 'Form Coach',  icon: 'camera-outline' },
              { label: 'Track PRs',   icon: 'trophy-outline' },
            ] as const).map(({ label, icon }) => (
              <View key={label} style={{ alignItems: 'center', gap: 6 }}>
                <View style={{
                  width: 52,
                  height: 52,
                  borderRadius: 26,
                  backgroundColor: Colors.primary + '22',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: Colors.primary + '44',
                }}>
                  <Ionicons name={icon} size={24} color={Colors.primary} />
                </View>
                <Text style={{ color: Colors.textSecondary, fontSize: 12, fontWeight: '600' }}>
                  {label}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ gap: 12 }}>
          <Button
            title="Get Started"
            onPress={() => navigation.navigate('SignUp')}
            size="lg"
          />
          <Button
            title="I already have an account"
            onPress={() => navigation.navigate('Login')}
            variant="ghost"
            size="lg"
          />
        </View>
      </View>
    </View>
  );
}
