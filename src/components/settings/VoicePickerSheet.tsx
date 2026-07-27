import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/theme';
import { useSettingsStore } from '../../store/settingsStore';
import { TRAINER_VOICES, VOICE_PREVIEW_LINE } from '../../constants/voices';
import { previewVoice, speak, stopSpeaking } from '../../lib/voice';

interface Props {
  visible: boolean;
  onClose: () => void;
  isPremium: boolean;
  onRequirePremium: () => void;
}

/**
 * Trainer-voice picker. "Device voice" is free; ElevenLabs voices are premium
 * and previewable inline. Selecting a voice also plays a short sample so the
 * choice is audible immediately.
 */
export function VoicePickerSheet({ visible, onClose, isPremium, onRequirePremium }: Props) {
  const { trainerVoiceId, setTrainerVoiceId } = useSettingsStore();
  const [previewing, setPreviewing] = useState<string | null>(null);

  const selectDevice = () => {
    stopSpeaking();
    setTrainerVoiceId(null);
    speak('Device voice selected.');
  };

  const selectVoice = async (id: string) => {
    if (!isPremium) {
      onRequirePremium();
      return;
    }
    setTrainerVoiceId(id);
    setPreviewing(id);
    const ok = await previewVoice(id, VOICE_PREVIEW_LINE);
    setPreviewing(null);
    if (!ok) Alert.alert('Preview unavailable', 'Could not reach the voice service. The voice is still selected.');
  };

  const preview = async (id: string) => {
    if (!isPremium) {
      onRequirePremium();
      return;
    }
    setPreviewing(id);
    const ok = await previewVoice(id, VOICE_PREVIEW_LINE);
    setPreviewing(null);
    if (!ok) Alert.alert('Preview unavailable', 'Could not reach the voice service. Please try again.');
  };

  const close = () => { stopSpeaking(); onClose(); };

  const Row = ({
    id, name, persona, selected, locked, onSelect, onPreview,
  }: {
    id: string; name: string; persona: string; selected: boolean; locked: boolean;
    onSelect: () => void; onPreview?: () => void;
  }) => (
    <TouchableOpacity
      onPress={onSelect}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, marginBottom: 8,
        backgroundColor: selected ? Colors.primary + '18' : Colors.surface2,
        borderWidth: 1, borderColor: selected ? Colors.primary : Colors.border,
      }}
    >
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surface3, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={selected ? 'checkmark' : locked ? 'lock-closed' : 'mic-outline'} size={18} color={selected ? Colors.primary : Colors.muted} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: Colors.text, fontSize: 15, fontWeight: '800' }}>{name}</Text>
        <Text style={{ color: Colors.textSecondary, fontSize: 12, marginTop: 1 }}>{persona}</Text>
      </View>
      {onPreview && (
        previewing === id ? (
          <ActivityIndicator color={Colors.primary} />
        ) : (
          <TouchableOpacity onPress={onPreview} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="play-circle" size={26} color={locked ? Colors.muted : Colors.primary} />
          </TouchableOpacity>
        )
      )}
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#0A0A0Acc' }}>
        <View style={{ backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 36, borderWidth: 1, borderColor: Colors.border, maxHeight: '85%' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <Text style={{ color: Colors.text, fontSize: 20, fontWeight: '900' }}>Trainer voice</Text>
            <TouchableOpacity onPress={close}>
              <Ionicons name="close" size={24} color={Colors.muted} />
            </TouchableOpacity>
          </View>
          <Text style={{ color: Colors.textSecondary, fontSize: 13, marginBottom: 16, lineHeight: 19 }}>
            Choose how your AI coach sounds. Premium voices use lifelike AI speech; the device voice is always free.
          </Text>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Row
              id="device"
              name="Device voice"
              persona="Built-in, works offline · free"
              selected={trainerVoiceId === null}
              locked={false}
              onSelect={selectDevice}
            />
            {!isPremium && (
              <Text style={{ color: Colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginTop: 8, marginBottom: 8 }}>
                PREMIUM VOICES
              </Text>
            )}
            {TRAINER_VOICES.map((v) => (
              <Row
                key={v.id}
                id={v.id}
                name={v.name}
                persona={v.persona}
                selected={trainerVoiceId === v.id}
                locked={!isPremium}
                onSelect={() => selectVoice(v.id)}
                onPreview={() => preview(v.id)}
              />
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
