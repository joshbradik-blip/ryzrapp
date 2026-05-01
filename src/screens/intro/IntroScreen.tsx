import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  ListRenderItem,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/theme';
import { useIntroStore } from '../../store/introStore';
import type { RootStackParamList } from '../../types';

const { width: SW, height: SH } = Dimensions.get('window');

type Slide = {
  id: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  tag: string;
  title: string;
  body: string;
  quote?: string;
};

const SLIDES: Slide[] = [
  {
    id: '1',
    icon: 'flash',
    tag: 'WELCOME TO RYZR',
    title: 'Train Smarter,\nNot Harder',
    body: 'Your AI-powered personal trainer — built around your goals, your body, and your schedule. No templates. No guesswork. Just workouts that work for you.',
  },
  {
    id: '2',
    icon: 'hardware-chip-outline',
    tag: 'AI TRAINING PLANS',
    title: 'A Plan Built\nJust for You',
    body: 'Tell us your goals, available equipment, schedule, and any injuries. Our AI generates a personalized weekly program and adapts it week by week as you improve.',
    quote: 'A goal without a plan is just a dream.',
  },
  {
    id: '3',
    icon: 'camera-outline',
    tag: 'FORM COACH',
    title: 'Perfect Form,\nEvery Rep',
    body: "The Form Coach uses your phone's camera to give real-time technique feedback. Catch errors before they become injuries. Train with confidence.",
  },
  {
    id: '4',
    icon: 'trophy-outline',
    tag: 'TRACK YOUR PROGRESS',
    title: 'Watch Yourself\nLevel Up',
    body: 'Log workouts, set personal records, track body composition, and compete in community challenges. Every rep — counted, measured, and celebrated.',
  },
];

type Props = NativeStackScreenProps<RootStackParamList, 'Intro'>;

export default function IntroScreen(_props: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const listRef = useRef<FlatList<Slide>>(null);
  const { markSeen } = useIntroStore();

  const isLast = currentIndex === SLIDES.length - 1;

  const finish = useCallback(async () => {
    await SecureStore.setItemAsync('intro_seen', 'true');
    markSeen();
  }, [markSeen]);

  const handleNext = useCallback(() => {
    if (isLast) {
      finish();
    } else {
      listRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    }
  }, [isLast, currentIndex, finish]);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentIndex(viewableItems[0].index);
      }
    },
    []
  );

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

  const renderItem: ListRenderItem<Slide> = useCallback(({ item }) => (
    <View style={styles.slide}>
      <View style={styles.iconRing}>
        <View style={styles.iconInner}>
          <Ionicons name={item.icon} size={72} color={Colors.primary} />
        </View>
      </View>
      <Text style={styles.tag}>{item.tag}</Text>
      <Text style={styles.title}>{item.title}</Text>
      <Text style={styles.body}>{item.body}</Text>
      {item.quote && (
        <View style={styles.quoteBlock}>
          <View style={styles.quoteBar} />
          <Text style={styles.quoteText}>"{item.quote}"</Text>
        </View>
      )}
    </View>
  ), []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      {!isLast && (
        <SafeAreaView style={styles.skipArea} pointerEvents="box-none">
          <TouchableOpacity
            onPress={finish}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        </SafeAreaView>
      )}

      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, index) => ({ length: SW, offset: SW * index, index })}
      />

      <SafeAreaView edges={['bottom']} style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === currentIndex && styles.dotActive]} />
          ))}
        </View>

        <TouchableOpacity style={styles.nextBtn} onPress={handleNext} activeOpacity={0.85}>
          <Text style={styles.nextBtnText}>{isLast ? "Let's Go" : 'Next'}</Text>
          {!isLast && (
            <Ionicons
              name="arrow-forward"
              size={16}
              color={Colors.background}
              style={{ marginLeft: 8 }}
            />
          )}
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  skipArea: {
    position: 'absolute',
    top: 0,
    right: Spacing.lg,
    zIndex: 10,
    alignItems: 'flex-end',
  },
  skipText: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
    paddingVertical: Spacing.sm,
  },
  slide: {
    width: SW,
    height: SH,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingBottom: 220,
  },
  iconRing: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: Colors.primary + '35',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
  },
  iconInner: {
    width: 148,
    height: 148,
    borderRadius: 74,
    backgroundColor: Colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tag: {
    color: Colors.primary,
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 3,
    marginBottom: Spacing.md,
  },
  title: {
    color: Colors.text,
    fontSize: FontSize.xxl,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 42,
    marginBottom: Spacing.lg,
  },
  body: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
    textAlign: 'center',
    lineHeight: 26,
    maxWidth: 320,
  },
  quoteBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.xl,
    maxWidth: 300,
    gap: Spacing.md,
  },
  quoteBar: {
    width: 3,
    height: '100%',
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    minHeight: 36,
  },
  quoteText: {
    flex: 1,
    color: Colors.text,
    fontSize: FontSize.sm,
    fontStyle: 'italic',
    lineHeight: 22,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.lg,
    backgroundColor: Colors.background + 'E6',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingTop: Spacing.lg,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface3,
  },
  dotActive: {
    width: 28,
    backgroundColor: Colors.primary,
  },
  nextBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextBtnText: {
    color: Colors.background,
    fontSize: FontSize.md,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
