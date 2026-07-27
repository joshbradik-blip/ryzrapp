import React from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/theme';
import { GradientButton } from '../ui/GradientButton';

interface Props {
  visible: boolean;
  onConsent: () => void;
  onClose: () => void;
}

/**
 * Consent gate shown before the visual "Future You" projection. Frames the
 * figure honestly (illustration, not a guarantee) and includes a body-image /
 * dysmorphia-awareness note, with a reminder that the visual can be turned off
 * anytime.
 */
export function FutureSelfConsentModal({ visible, onConsent, onClose }: Props) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#0A0A0Acc' }}>
        <View style={{ backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 36, borderWidth: 1, borderColor: Colors.border, maxHeight: '88%' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Text style={{ color: Colors.text, fontSize: 20, fontWeight: '900' }}>Before you see Future You</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
              <Ionicons name="sparkles-outline" size={18} color={Colors.primary} style={{ marginTop: 2 }} />
              <Text style={{ color: Colors.textSecondary, fontSize: 14, lineHeight: 21, flex: 1 }}>
                This is a <Text style={{ color: Colors.text, fontWeight: '700' }}>stylized illustration</Text> of where your logged trend could lead — not a photo of you, and not a medical prediction.
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
              <Ionicons name="trending-up-outline" size={18} color={Colors.primary} style={{ marginTop: 2 }} />
              <Text style={{ color: Colors.textSecondary, fontSize: 14, lineHeight: 21, flex: 1 }}>
                Results are <Text style={{ color: Colors.text, fontWeight: '700' }}>projections, not guarantees</Text>. Real change depends on consistency, nutrition, sleep, genetics, and more — everyone's body responds differently.
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 8 }}>
              <Ionicons name="heart-outline" size={18} color={Colors.primary} style={{ marginTop: 2 }} />
              <Text style={{ color: Colors.textSecondary, fontSize: 14, lineHeight: 21, flex: 1 }}>
                <Text style={{ color: Colors.text, fontWeight: '700' }}>A note on body image:</Text> progress visuals motivate some people and pressure others. If comparing yourself to a projected figure ever feels discouraging or unhealthy, you can turn this off anytime in Settings. Your worth isn't a number on a scale.
              </Text>
            </View>
          </ScrollView>

          <GradientButton title="I understand — show my projection" onPress={onConsent} />
          <TouchableOpacity onPress={onClose} style={{ alignItems: 'center', paddingVertical: 14 }}>
            <Text style={{ color: Colors.muted, fontSize: 14, fontWeight: '600' }}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
