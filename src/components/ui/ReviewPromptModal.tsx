import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/theme';
import { haptic } from '../../lib/feedback';
import { requestReview, emailFeedback } from '../../lib/review';
import { useReviewStore } from '../../store/reviewStore';
import { GradientButton } from './GradientButton';

interface Props {
  visible: boolean;
  onClose: () => void;
}

type Step = 'ask' | 'happy' | 'unhappy';

/**
 * The soft-ask that fronts the native rating prompt.
 *
 * Rather than firing `requestReview()` at everyone, we ask how they feel
 * first: fans get the store prompt, everyone else gets a route to support.
 * That keeps one-star venting out of the listing and, just as importantly,
 * stops us burning iOS's ~3-per-year prompt budget on unhappy users.
 */
export function ReviewPromptModal({ visible, onClose }: Props) {
  const [step, setStep] = useState<Step>('ask');
  const optOut = useReviewStore((s) => s.optOut);

  const close = () => {
    onClose();
    // Reset after the dismiss animation so the sheet doesn't flash its last
    // step on the way out.
    setTimeout(() => setStep('ask'), 300);
  };

  const handleLove = () => {
    haptic.success();
    setStep('happy');
  };

  const handleMeh = () => {
    haptic.impact('light');
    setStep('unhappy');
  };

  const handleRate = async () => {
    optOut(); // asked and answered — never prompt this user again
    close();
    await requestReview();
  };

  const handleFeedback = async () => {
    optOut(); // they told us instead; don't come back asking for stars
    close();
    await emailFeedback();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable
        onPress={close}
        style={{ flex: 1, backgroundColor: '#000000CC', justifyContent: 'center', padding: 24 }}
      >
        {/* Swallow taps inside the card so the backdrop doesn't dismiss it */}
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: Colors.surface,
            borderRadius: 24,
            padding: 24,
            borderWidth: 1,
            borderColor: Colors.border,
          }}
        >
          <TouchableOpacity
            onPress={close}
            hitSlop={12}
            style={{ position: 'absolute', top: 14, right: 14, zIndex: 1, padding: 6 }}
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={22} color={Colors.muted} />
          </TouchableOpacity>

          <View style={{ alignItems: 'center', marginBottom: 20 }}>
            <View style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: Colors.primary + '22',
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 2,
              borderColor: Colors.primary + '55',
            }}>
              <Ionicons
                name={step === 'unhappy' ? 'chatbubble-ellipses' : 'flame'}
                size={30}
                color={Colors.primary}
              />
            </View>
          </View>

          {step === 'ask' && (
            <>
              <Text style={{ color: Colors.text, fontSize: 22, fontWeight: '900', textAlign: 'center' }}>
                Enjoying RYZR?
              </Text>
              <Text style={{ color: Colors.textSecondary, fontSize: 15, textAlign: 'center', lineHeight: 21, marginTop: 10 }}>
                You've been putting in the work. How's the app treating you?
              </Text>

              <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
                <TouchableOpacity
                  onPress={handleMeh}
                  style={{
                    flex: 1,
                    backgroundColor: Colors.surface2,
                    borderRadius: 14,
                    paddingVertical: 16,
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: Colors.border,
                  }}
                >
                  <Text style={{ color: Colors.textSecondary, fontWeight: '800', fontSize: 15 }}>
                    Could be better
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleLove}
                  style={{
                    flex: 1,
                    backgroundColor: Colors.primary + '22',
                    borderRadius: 14,
                    paddingVertical: 16,
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: Colors.primary,
                  }}
                >
                  <Text style={{ color: Colors.primary, fontWeight: '800', fontSize: 15 }}>
                    Loving it
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {step === 'happy' && (
            <>
              <Text style={{ color: Colors.text, fontSize: 22, fontWeight: '900', textAlign: 'center' }}>
                That's what we like to hear
              </Text>
              <Text style={{ color: Colors.textSecondary, fontSize: 15, textAlign: 'center', lineHeight: 21, marginTop: 10 }}>
                A quick rating helps other lifters find RYZR. Takes about ten seconds.
              </Text>

              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 18 }}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <Ionicons key={i} name="star" size={26} color={Colors.primary} />
                ))}
              </View>

              <View style={{ marginTop: 24 }}>
                <GradientButton title="Rate RYZR" icon="star" onPress={handleRate} />
              </View>
              <TouchableOpacity onPress={close} style={{ paddingVertical: 14, alignItems: 'center' }}>
                <Text style={{ color: Colors.muted, fontWeight: '700', fontSize: 15 }}>Maybe later</Text>
              </TouchableOpacity>
            </>
          )}

          {step === 'unhappy' && (
            <>
              <Text style={{ color: Colors.text, fontSize: 22, fontWeight: '900', textAlign: 'center' }}>
                Tell us what's off
              </Text>
              <Text style={{ color: Colors.textSecondary, fontSize: 15, textAlign: 'center', lineHeight: 21, marginTop: 10 }}>
                We read every message, and we'd rather fix it than have you put up with it.
              </Text>

              <View style={{ marginTop: 24 }}>
                <GradientButton title="Send feedback" icon="mail-outline" onPress={handleFeedback} />
              </View>
              <TouchableOpacity onPress={close} style={{ paddingVertical: 14, alignItems: 'center' }}>
                <Text style={{ color: Colors.muted, fontWeight: '700', fontSize: 15 }}>No thanks</Text>
              </TouchableOpacity>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
