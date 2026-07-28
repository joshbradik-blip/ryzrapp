import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Image, ScrollView, Platform, ActionSheetIOS, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Colors } from '../../constants/theme';
import { BodyFatOutlook } from '../../lib/futureSelf';
import { reshapeFeaturesFromProjection, generatePhysiquePreview } from '../../lib/futureSelfPhoto';
import { GradientButton } from '../ui/GradientButton';

interface Props {
  visible: boolean;
  onClose: () => void;
  outlook: BodyFatOutlook | null;
  goal?: string;
  isPremium: boolean;
}

// The reshape API needs the whole body in frame; spell the rules out so the
// user picks a usable shot the first time.
const POSE_TIPS = [
  'Stand facing the camera, full body in frame',
  'Both arms and both legs fully visible',
  'Arms relaxed at your sides — no raised hands',
  'Good light, plain background works best',
];

/**
 * "Future You" on your own photo. Takes a full-body selfie and reshapes it
 * toward the user's OWN projected body-fat / muscle trend (Perfect Corp AI
 * Body Reshape). Premium + consent gated by the caller. The result is a
 * stylized projection, not a promise — framed that way throughout.
 */
export function FutureSelfPhotoSheet({ visible, onClose, outlook, goal, isPremium }: Props) {
  const milestones = outlook?.milestones ?? [];
  const [selectedIdx, setSelectedIdx] = useState(Math.max(0, milestones.length - 1));
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = milestones[Math.min(selectedIdx, milestones.length - 1)];

  const reset = () => { setPhotoUri(null); setResultUrl(null); setBusy(false); };
  const close = () => { reset(); onClose(); };

  const run = async (base64: string) => {
    if (!outlook || !selected) return;
    setBusy(true);
    setResultUrl(null);
    try {
      const features = reshapeFeaturesFromProjection({
        goal,
        fatDeltaPct: outlook.currentBf - selected.projectedBf,
        muscleDelta01: selected.muscleLevel - outlook.currentMuscle,
      });
      const res = await generatePhysiquePreview(base64, features);
      if (res.status === 'success' && res.imageUrl) {
        setResultUrl(res.imageUrl);
      } else {
        Alert.alert(
          "Couldn't create your projection",
          'Try a clearer, well-lit full-body photo with your whole body in frame.'
        );
      }
    } catch {
      Alert.alert('Something went wrong', 'Please try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  const pick = async (fromCamera: boolean) => {
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', fromCamera ? 'Camera access is required.' : 'Photo library access is required.');
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7, mediaTypes: 'images' })
      : await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.7, mediaTypes: 'images' });
    if (result.canceled || !result.assets[0].base64) return;
    setPhotoUri(result.assets[0].uri);
    run(result.assets[0].base64);
  };

  const choosePhoto = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Take Photo', 'Choose from Library'], cancelButtonIndex: 0 },
        (i) => { if (i === 1) pick(true); if (i === 2) pick(false); }
      );
    } else {
      Alert.alert('Add a full-body photo', '', [
        { text: 'Take Photo', onPress: () => pick(true) },
        { text: 'Choose from Library', onPress: () => pick(false) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#0A0A0Acc' }}>
        <View style={{ backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 36, borderWidth: 1, borderColor: Colors.border, maxHeight: '90%' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ color: Colors.text, fontSize: 20, fontWeight: '900' }}>Future You — on your photo</Text>
            </View>
            <TouchableOpacity onPress={close}>
              <Ionicons name="close" size={24} color={Colors.muted} />
            </TouchableOpacity>
          </View>

          {!isPremium ? (
            <View style={{ alignItems: 'center', paddingVertical: 24 }}>
              <Ionicons name="lock-closed" size={30} color={Colors.primary} style={{ marginBottom: 10 }} />
              <Text style={{ color: Colors.text, fontSize: 16, fontWeight: '800', marginBottom: 6, textAlign: 'center' }}>A premium feature</Text>
              <Text style={{ color: Colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
                Upgrade in the Store tab to see your projection rendered on your own photo.
              </Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Milestone target */}
              {milestones.length > 0 && (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, marginBottom: 14 }}>
                  {milestones.map((m, i) => {
                    const active = i === Math.min(selectedIdx, milestones.length - 1);
                    return (
                      <TouchableOpacity
                        key={m.weeksAhead}
                        onPress={() => { setSelectedIdx(i); setResultUrl(null); }}
                        style={{ flex: 1, paddingVertical: 8, borderRadius: 12, alignItems: 'center', backgroundColor: active ? Colors.primary + '22' : Colors.surface2, borderWidth: 1, borderColor: active ? Colors.primary : Colors.border }}
                      >
                        <Text style={{ color: active ? Colors.primary : Colors.text, fontWeight: '800', fontSize: 14 }}>{m.weeksAhead} wk</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* Before / after */}
              {photoUri && (
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <Image source={{ uri: photoUri }} style={{ width: '100%', aspectRatio: 1, borderRadius: 12 }} resizeMode="cover" />
                    <Text style={{ color: Colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: 4 }}>NOW</Text>
                  </View>
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    {resultUrl ? (
                      <Image source={{ uri: resultUrl }} style={{ width: '100%', aspectRatio: 1, borderRadius: 12 }} resizeMode="cover" />
                    ) : (
                      <View style={{ width: '100%', aspectRatio: 1, borderRadius: 12, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border }}>
                        <Ionicons name={busy ? 'hourglass-outline' : 'sparkles-outline'} size={26} color={Colors.muted} />
                        {busy && <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 6 }}>Rendering…</Text>}
                      </View>
                    )}
                    <Text style={{ color: Colors.primary, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: 4 }}>
                      {selected ? `${selected.weeksAhead} WEEKS` : 'PROJECTED'}
                    </Text>
                  </View>
                </View>
              )}

              {!photoUri && (
                <>
                  <Text style={{ color: Colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 8, marginBottom: 12 }}>
                    Add a full-body photo and we'll show a projection of your body at your current pace — a stylized guide, not a guarantee.
                  </Text>
                  <View style={{ backgroundColor: Colors.surface2, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border, marginBottom: 16 }}>
                    {POSE_TIPS.map((tip) => (
                      <View key={tip} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <Ionicons name="checkmark-circle" size={15} color={Colors.primary} />
                        <Text style={{ color: Colors.textSecondary, fontSize: 13, flex: 1 }}>{tip}</Text>
                      </View>
                    ))}
                  </View>
                </>
              )}

              <GradientButton
                title={busy ? 'Rendering…' : photoUri ? 'Try another photo' : 'Add full-body photo'}
                icon="camera"
                onPress={choosePhoto}
                loading={busy}
                disabled={busy || !outlook}
              />

              <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 12, lineHeight: 16, textAlign: 'center' }}>
                An AI visualization of your projected trend — not a photo of a real future outcome, and not a guarantee. Your photo is processed privately and not shared.
              </Text>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}
