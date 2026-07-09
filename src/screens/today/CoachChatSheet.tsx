import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Platform,
  Dimensions,
  ActivityIndicator,
  StyleSheet,
  Animated,
  Image,
  ActionSheetIOS,
  Alert,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Speech from 'expo-speech';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/theme';
import { coachChatTurn, CoachMessage } from '../../lib/anthropic';
import { COACH_TOOLS, buildPlanContext, executeCoachTool } from '../../lib/coachTools';
import { readinessPromptContext } from '../../lib/readiness';
import { useProfileStore } from '../../store/profileStore';
import { useWorkoutStore } from '../../store/workoutStore';
import { useWearablesStore } from '../../store/wearablesStore';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const WELCOME: CoachMessage = {
  role: 'assistant',
  content: "Hey! I'm your RYZR Coach. Ask me anything — form tips, how many reps to push, recovery advice. I can also change your plan right here: snap a photo of any machine and say \"add this to today\" or ask me to swap an exercise. Tap the mic to talk instead of type.",
};

const MAX_TOOL_ROUNDS = 3;

export function CoachChatSheet({ visible, onClose }: Props) {
  const { profile } = useProfileStore();
  const { todayWorkout, pendingCoachMessages, clearPendingCoachMessages } = useWorkoutStore();
  const [messages, setMessages] = useState<CoachMessage[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingImage, setPendingImage] = useState<{ uri: string; base64: string } | null>(null);
  // Raw Anthropic message history (text/image/tool_use/tool_result blocks) —
  // kept separate from the display list, which only holds readable text.
  const apiMessagesRef = useRef<object[]>([]);
  const slideAnim = useRef(new Animated.Value(600)).current;
  const listRef = useRef<FlatList<CoachMessage>>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [listening, setListening] = useState(false);
  const voiceTranscriptRef = useRef('');

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
      // Drain any queued coach messages (daily encouragement + pre-workout challenge) into the chat
      if (pendingCoachMessages.length > 0) {
        const queued = pendingCoachMessages.map((text) => ({ role: 'assistant' as const, content: text }));
        setMessages([WELCOME, ...queued]);
        clearPendingCoachMessages();
      }
    } else {
      Animated.timing(slideAnim, { toValue: 600, duration: 220, useNativeDriver: true }).start();
      Speech.stop();
      ExpoSpeechRecognitionModule.stop();
      setListening(false);
    }
  }, [visible, slideAnim]);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      // On edge-to-edge Android the keyboard sits on top of the gesture nav bar,
      // so e.endCoordinates.height only covers the keyboard, not the bar beneath it.
      // Measuring windowHeight - screenY captures the full blocked area.
      const windowH = Dimensions.get('window').height;
      const kbHeight = Math.max(
        e.endCoordinates.height,
        windowH - e.endCoordinates.screenY,
      );
      setKeyboardHeight(kbHeight);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
    });
    return () => { show.remove(); hide.remove(); };
  }, []);

  const send = useCallback(async (overrideText?: string, isVoice = false) => {
    const trimmed = (overrideText ?? input).trim();
    if ((!trimmed && !pendingImage) || loading) return;
    Speech.stop();

    const ctx = {
      name: profile?.name ?? 'Athlete',
      workoutName: todayWorkout?.name,
      exerciseNames: todayWorkout?.exercises.map((e) => e.exercise.name) ?? [],
      readiness: readinessPromptContext(useWearablesStore.getState().readiness),
      planContext: buildPlanContext(),
      tools: COACH_TOOLS,
    };

    const caption = trimmed || 'What is this gym equipment and how do I use it?';
    const image = pendingImage;
    const userMsg: CoachMessage = { role: 'user', content: caption, imageUri: image?.uri };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setPendingImage(null);
    setLoading(true);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);

    // Snapshot so a failed turn can be rolled back — the API history must never
    // end with an unanswered tool_use block.
    const checkpoint = apiMessagesRef.current.length;
    apiMessagesRef.current.push({
      role: 'user',
      content: image
        ? [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image.base64 } },
            { type: 'text', text: caption },
          ]
        : caption,
    });

    let lastAssistantText = '';
    try {
      let resp = await coachChatTurn([...apiMessagesRef.current], ctx);

      // Agentic loop: show text, execute any tool calls against the plan,
      // return the results, and let the coach confirm.
      for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
        const blocks: any[] = Array.isArray(resp?.content) ? resp.content : [];
        apiMessagesRef.current.push({ role: 'assistant', content: blocks });

        const text = blocks
          .filter((b) => b.type === 'text' && typeof b.text === 'string')
          .map((b) => b.text)
          .join('\n')
          .trim();
        if (text) {
          setMessages((prev) => [...prev, { role: 'assistant', content: text }]);
          lastAssistantText = text;
        }

        const toolUses = blocks.filter((b) => b.type === 'tool_use');
        if (resp?.stop_reason !== 'tool_use' || toolUses.length === 0) break;

        if (round === MAX_TOOL_ROUNDS) {
          // Round cap reached — answer the pending tool calls without executing
          // so the history stays valid, then stop.
          apiMessagesRef.current.push({
            role: 'user',
            content: toolUses.map((tu) => ({
              type: 'tool_result',
              tool_use_id: tu.id,
              content: 'Not executed — action limit reached for this message. Ask the user to send the request again.',
              is_error: true,
            })),
          });
          break;
        }

        const results: object[] = [];
        for (const tu of toolUses) {
          const outcome = await executeCoachTool({ id: tu.id, name: tu.name, input: tu.input ?? {} });
          setMessages((prev) => [...prev, {
            role: 'assistant',
            kind: 'action',
            content: outcome.ok ? `✅ ${outcome.summary}` : `⚠️ ${outcome.summary}`,
          }]);
          results.push({
            type: 'tool_result',
            tool_use_id: outcome.toolUseId,
            content: outcome.result,
            ...(outcome.ok ? {} : { is_error: true }),
          });
        }
        apiMessagesRef.current.push({ role: 'user', content: results });
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
        resp = await coachChatTurn([...apiMessagesRef.current], ctx);
      }
      if (isVoice && lastAssistantText) {
        Speech.speak(lastAssistantText, { rate: 0.98 });
      }
    } catch {
      apiMessagesRef.current.length = checkpoint;
      setMessages((prev) => [...prev, { role: 'assistant', content: "I'm having trouble connecting right now. Try again in a moment." }]);
    } finally {
      setLoading(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [input, pendingImage, loading, profile, todayWorkout]);

  const startListening = useCallback(async () => {
    const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!result.granted) {
      Alert.alert('Permission needed', 'Microphone and speech recognition access are required to talk to your coach.');
      return;
    }
    Speech.stop();
    voiceTranscriptRef.current = '';
    setInput('');
    setListening(true);
    ExpoSpeechRecognitionModule.start({ lang: 'en-US', interimResults: true, continuous: false });
  }, []);

  const stopListening = useCallback(() => {
    ExpoSpeechRecognitionModule.stop();
  }, []);

  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results?.[0]?.transcript ?? '';
    voiceTranscriptRef.current = transcript;
    setInput(transcript);
  });

  useSpeechRecognitionEvent('end', () => {
    setListening(false);
    const transcript = voiceTranscriptRef.current.trim();
    voiceTranscriptRef.current = '';
    if (transcript) send(transcript, true);
  });

  useSpeechRecognitionEvent('error', () => {
    setListening(false);
  });

  const pickImage = useCallback(async (fromCamera: boolean) => {
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('Permission needed', fromCamera ? 'Camera access is required.' : 'Photo library access is required.');
      return;
    }

    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.6, mediaTypes: 'images' })
      : await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.6, mediaTypes: 'images' });

    if (!result.canceled && result.assets[0].base64) {
      setPendingImage({ uri: result.assets[0].uri, base64: result.assets[0].base64 });
    }
  }, []);

  const showImagePicker = useCallback(() => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Take Photo', 'Choose from Library'], cancelButtonIndex: 0 },
        (i) => { if (i === 1) pickImage(true); if (i === 2) pickImage(false); }
      );
    } else {
      Alert.alert('Add Photo', '', [
        { text: 'Take Photo', onPress: () => pickImage(true) },
        { text: 'Choose from Library', onPress: () => pickImage(false) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }, [pickImage]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }], bottom: keyboardHeight }]}>
        <SafeAreaView style={{ flex: 1 }} edges={keyboardHeight > 0 ? [] : ['bottom']}>
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
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) =>
                item.kind === 'action' ? (
                  <View style={styles.actionChip}>
                    <Text style={styles.actionChipText}>{item.content}</Text>
                  </View>
                ) : (
                  <View style={[styles.bubble, item.role === 'user' ? styles.bubbleUser : styles.bubbleCoach]}>
                    {item.imageUri && (
                      <Image source={{ uri: item.imageUri }} style={styles.bubbleImage} resizeMode="cover" />
                    )}
                    <Text style={[styles.bubbleText, item.role === 'user' ? styles.bubbleTextUser : styles.bubbleTextCoach]}>
                      {item.content}
                    </Text>
                  </View>
                )
              }
              ListFooterComponent={
                loading ? (
                  <View style={[styles.bubble, styles.bubbleCoach, { paddingVertical: 12 }]}>
                    <ActivityIndicator size="small" color={Colors.primary} />
                  </View>
                ) : null
              }
            />

            {/* Input row */}
            {pendingImage && (
              <View style={styles.imagePreviewRow}>
                <Image source={{ uri: pendingImage.uri }} style={styles.imagePreview} resizeMode="cover" />
                <TouchableOpacity onPress={() => setPendingImage(null)} style={styles.imagePreviewClear}>
                  <Ionicons name="close-circle" size={20} color={Colors.text} />
                </TouchableOpacity>
              </View>
            )}
            <View style={styles.inputRow}>
              <TouchableOpacity onPress={showImagePicker} style={styles.cameraBtn}>
                <Ionicons name="camera-outline" size={22} color={pendingImage ? Colors.primary : Colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={listening ? stopListening : startListening}
                style={styles.cameraBtn}
                disabled={loading}
              >
                <Ionicons name={listening ? 'mic' : 'mic-outline'} size={22} color={listening ? Colors.danger : Colors.textSecondary} />
              </TouchableOpacity>
              <TextInput
                style={styles.input}
                value={input}
                onChangeText={setInput}
                placeholder={listening ? 'Listening…' : pendingImage ? 'Add a caption or send…' : 'Ask your coach anything…'}
                placeholderTextColor={Colors.muted}
                multiline
                maxLength={400}
                returnKeyType="send"
                onSubmitEditing={() => send()}
                blurOnSubmit={false}
                editable={!listening}
              />
              <TouchableOpacity
                onPress={() => send()}
                disabled={(!input.trim() && !pendingImage) || loading || listening}
                style={[styles.sendBtn, ((!input.trim() && !pendingImage) || loading || listening) && { opacity: 0.35 }]}
              >
                <Ionicons name="send" size={18} color="#000" />
              </TouchableOpacity>
            </View>
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
  cameraBtn: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePreviewRow: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
  imagePreview: {
    width: 80,
    height: 60,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  imagePreviewClear: {
    position: 'absolute',
    top: 4,
    left: 68,
  },
  bubbleImage: {
    width: 200,
    height: 150,
    borderRadius: 8,
    marginBottom: 6,
  },
  actionChip: {
    alignSelf: 'center',
    backgroundColor: Colors.primary + '18',
    borderWidth: 1,
    borderColor: Colors.primary + '55',
    borderRadius: BorderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: Spacing.sm,
    maxWidth: '92%',
  },
  actionChipText: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: '700',
    textAlign: 'center',
  },
});
