import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TodayStackParamList } from '../../types';
import { getExerciseById } from '../../constants/exercises';
import { useSubscriptionStore } from '../../store/subscriptionStore';
import { Colors } from '../../constants/theme';

type Props = NativeStackScreenProps<TodayStackParamList, 'ExerciseDetail'>;

const TABS = ['Setup', 'Execution', 'Mistakes'] as const;

const MUSCLE_COLORS: Record<string, string> = {
  'Chest': '#4488FF',
  'Quadriceps': '#FF8C44',
  'Glutes': '#FF4488',
  'Hamstrings': '#AA44FF',
  'Lats': '#44DDFF',
  'Core': '#44FF88',
  'Biceps': '#FFD644',
  'Triceps': '#FF6644',
  'Deltoids': '#44AAFF',
};

export function ExerciseDetailScreen({ navigation, route }: Props) {
  const { exerciseId, workoutId, workoutExerciseId } = route.params;
  const exercise = getExerciseById(exerciseId);
  const { isPremium } = useSubscriptionStore();
  const [activeTab, setActiveTab] = useState<typeof TABS[number]>('Setup');
  const [videoLoading, setVideoLoading] = useState(true);

  if (!exercise) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: Colors.text }}>Exercise not found.</Text>
      </SafeAreaView>
    );
  }

  const canSwap = !!(workoutId && workoutExerciseId);
  const videoQuery = encodeURIComponent(`${exercise.name} proper form tutorial`);
  const embedUrl = `https://m.youtube.com/results?search_query=${videoQuery}`;

  const handleSwap = () => {
    if (!canSwap) {
      Alert.alert('Open from workout', 'Start a workout to swap exercises.');
      return;
    }
    navigation.navigate('SubstituteExercise', {
      exerciseId,
      workoutId: workoutId!,
      workoutExerciseId: workoutExerciseId!,
    });
  };

  const tabContent: Record<typeof TABS[number], string[]> = {
    Setup: exercise.setup_cues,
    Execution: exercise.execution_cues,
    Mistakes: exercise.common_mistakes,
  };

  const tabIcons: Record<typeof TABS[number], keyof typeof Ionicons.glyphMap> = {
    Setup: 'list-outline',
    Execution: 'play-circle-outline',
    Mistakes: 'warning-outline',
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Embedded demo video */}
        <View style={{ height: 220, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
          {videoLoading && (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
              <ActivityIndicator color={Colors.primary} size="large" />
            </View>
          )}
          <WebView
            source={{ uri: embedUrl }}
            style={{ flex: 1, backgroundColor: Colors.surface }}
            onLoad={() => setVideoLoading(false)}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            javaScriptEnabled
          />
        </View>

        <View style={{ padding: 24 }}>
          {/* Name & difficulty */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <Text style={{ color: Colors.text, fontSize: 26, fontWeight: '900', flex: 1 }}>{exercise.name}</Text>
            <View style={{
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 8,
              backgroundColor:
                exercise.difficulty === 'beginner' ? '#44FF8822' :
                exercise.difficulty === 'intermediate' ? '#FFD64422' : '#FF444422',
            }}>
              <Text style={{
                color:
                  exercise.difficulty === 'beginner' ? '#44FF88' :
                  exercise.difficulty === 'intermediate' ? '#FFD644' : '#FF4444',
                fontSize: 12,
                fontWeight: '700',
                textTransform: 'capitalize',
              }}>{exercise.difficulty}</Text>
            </View>
          </View>

          {/* Muscles */}
          <Text style={{ color: Colors.muted, fontSize: 12, fontWeight: '600', letterSpacing: 0.5, marginBottom: 10 }}>
            MUSCLES WORKED
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
            {exercise.muscles_primary.map((m) => (
              <View key={m} style={{
                paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
                backgroundColor: (MUSCLE_COLORS[m] ?? Colors.primary) + '22',
                borderWidth: 1, borderColor: MUSCLE_COLORS[m] ?? Colors.primary,
              }}>
                <Text style={{ color: MUSCLE_COLORS[m] ?? Colors.primary, fontSize: 13, fontWeight: '700' }}>{m}</Text>
              </View>
            ))}
            {exercise.muscles_secondary.map((m) => (
              <View key={m} style={{
                paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
                backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border,
              }}>
                <Text style={{ color: Colors.textSecondary, fontSize: 13 }}>{m}</Text>
              </View>
            ))}
          </View>

          {/* Tabs */}
          <View style={{
            flexDirection: 'row', backgroundColor: Colors.surface2, borderRadius: 12,
            padding: 4, marginBottom: 20, borderWidth: 1, borderColor: Colors.border,
          }}>
            {TABS.map((tab) => (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={{
                  flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center',
                  backgroundColor: activeTab === tab ? Colors.surface3 : 'transparent',
                }}
              >
                <Ionicons name={tabIcons[tab]} size={16} color={activeTab === tab ? Colors.text : Colors.muted} />
                <Text style={{ color: activeTab === tab ? Colors.text : Colors.muted, fontSize: 12, fontWeight: '600', marginTop: 2 }}>{tab}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Tab content */}
          <View style={{ gap: 12, marginBottom: 32 }}>
            {tabContent[activeTab].map((cue, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                <View style={{
                  width: 24, height: 24, borderRadius: 12,
                  backgroundColor: activeTab === 'Mistakes' ? Colors.danger + '22' : Colors.primary + '22',
                  alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {activeTab === 'Mistakes'
                    ? <Ionicons name="close" size={12} color={Colors.danger} />
                    : <Text style={{ color: Colors.primary, fontSize: 12, fontWeight: '700' }}>{i + 1}</Text>
                  }
                </View>
                <Text style={{ color: Colors.text, fontSize: 15, lineHeight: 22, flex: 1 }}>{cue}</Text>
              </View>
            ))}
          </View>

          {/* Swap exercise button */}
          <TouchableOpacity
            onPress={handleSwap}
            style={{
              backgroundColor: Colors.surface2,
              borderRadius: 14,
              padding: 18,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
              borderWidth: 1,
              borderColor: Colors.border,
              marginBottom: 12,
            }}
          >
            <Ionicons name="swap-horizontal-outline" size={26} color={Colors.text} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: Colors.text, fontWeight: '800', fontSize: 15 }}>
                Swap Exercise
              </Text>
              <Text style={{ color: Colors.textSecondary, fontSize: 13, marginTop: 2 }}>
                {canSwap
                  ? 'Find an alternative from 1,300+ exercises'
                  : 'Start a workout to enable swapping'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.muted} />
          </TouchableOpacity>

          {/* Form Coach CTA */}
          <TouchableOpacity
            onPress={() => {
              if (!isPremium) {
                Alert.alert('Premium Feature', 'Upgrade to RYZR Premium for the AI Form Coach.');
                return;
              }
              navigation.navigate('FormCoach', { exerciseId: exercise.id, exerciseName: exercise.name });
            }}
            style={{
              backgroundColor: isPremium ? Colors.primary + '22' : Colors.surface2,
              borderRadius: 14,
              padding: 18,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
              borderWidth: 1,
              borderColor: isPremium ? Colors.primary : Colors.border,
            }}
          >
            <Ionicons
              name={isPremium ? 'camera-outline' : 'lock-closed-outline'}
              size={28}
              color={isPremium ? Colors.primary : Colors.muted}
            />
            <View style={{ flex: 1 }}>
              <Text style={{ color: isPremium ? Colors.primary : Colors.text, fontWeight: '800', fontSize: 15 }}>
                Check My Form
              </Text>
              <Text style={{ color: Colors.textSecondary, fontSize: 13, marginTop: 2 }}>
                {isPremium ? 'Live AI feedback with your camera' : 'Premium feature — upgrade to unlock'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={isPremium ? Colors.primary : Colors.muted} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
