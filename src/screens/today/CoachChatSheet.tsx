import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
  Animated,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/theme';
import { askCoach, CoachMessage } from '../../lib/anthropic';
import { useProfileStore } from '../../store/profileStore';
import { useWorkoutStore } from '../../store/workoutStore';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const WELCOME: CoachMessage = {
  role: 'assistant',
  content: "Hey! I'm your RYZR Coach. Ask me anything — form tips, exercise swaps, how many reps to push, recovery advice. I'm here.",
};

export function CoachChatSheet({ visible, onClose }: Props) {
  const { profile } = useProfileStore();
  const { todayWorkout } = useWorkoutStore();
  const [messages, setMessages] = useState<CoachMessage[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const slideAnim = useRef(new Animated.Value(600)).current;
  const listRef = useRef<FlatList<CoachMessage>>(null);

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 600, duration: 220, useNativeDriver: true }).start();
    }
  }, [visible, slideAnim]);

  const send = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;
    const userMsg: CoachMessage = { role: 'user', content: trimmed };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput('');
    setLoading(true);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    try {
      const reply = await askCoach(updated, {
        name: profile?.name ?? 'Athlete',
        workoutName: todayWorkout?.name,
      });
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: "I'm having trouble connecting right now. Try again in a moment." },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [input, loading, messages, profile, todayWorkout]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
        <SafeAreaView style={{ flex: 1 }} edges={['bottom'] as any}>
          {/* Handle + header */}
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.avatarDot} />
              <View>
                <Text style={styles.headerTitle}>RYZR Coach</Text>
                <Text style={styles.headerSub}>AI · Always on</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Messages */}
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(_, i) => String(i)}
            contentContainerStyle={styles.messageList}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <View style={[styles.bubble, item.role === 'user' ? styles.bubbleUser : styles.bubbleCoach]}>
                <Text style={[styles.bubbleText, item.role === 'user' ? styles.bubbleTextUser : styles.bubbleTextCoach]}>
                  {item.content}
                </Text>
              </View>
            )}
            ListFooterComponent={
              loading ? (
                <View style={[styles.bubble, styles.bubbleCoach, { paddingVertical: 12 }]}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                </View>
              ) : null
            }
          />

          {/* Input row */}
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={input}
                onChangeText={setInput}
                placeholder="Ask your coach anything…"
                placeholderTextColor={Colors.muted}
                multiline
                maxLength={400}
                returnKeyType="send"
                onSubmitEditing={send}
                blurOnSubmit={false}
              />
              <TouchableOpacity
                onPress={send}
                disabled={!input.trim() || loading}
                style={[styles.sendBtn, (!input.trim() || loading) && { opacity: 0.35 }]}
              >
                <Ionicons name="send" size={18} color="#000" />
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '75%',
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  avatarDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary + '22',
    borderWidth: 1.5,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { color: Colors.text, fontSize: FontSize.md, fontWeight: '800' },
  headerSub: { color: Colors.primary, fontSize: FontSize.xs, fontWeight: '600', marginTop: 1 },
  messageList: { padding: Spacing.lg, gap: Spacing.sm, paddingBottom: Spacing.md },
  bubble: {
    maxWidth: '80%',
    borderRadius: BorderRadius.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: Spacing.sm,
  },
  bubbleCoach: {
    backgroundColor: Colors.surface2 ?? Colors.surface,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  bubbleUser: {
    backgroundColor: Colors.primary,
    alignSelf: 'flex-end',
  },
  bubbleText: { fontSize: FontSize.md, lineHeight: 22 },
  bubbleTextCoach: { color: Colors.text },
  bubbleTextUser: { color: '#000', fontWeight: '600' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.text,
    fontSize: FontSize.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxHeight: 100,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
