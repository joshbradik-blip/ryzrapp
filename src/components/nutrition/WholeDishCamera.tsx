import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ActivityIndicator, Linking, useWindowDimensions } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/theme';
import { ReferenceObject, REFERENCE_OBJECTS, REFERENCE_ORDER } from '../../lib/wholeDish';

interface Props {
  visible: boolean;
  reference: ReferenceObject;
  onReferenceChange: (r: ReferenceObject) => void;
  onCapture: (photo: { base64: string; uri: string }) => void;
  onClose: () => void;
}

/**
 * Full-screen camera for whole-dish photos. Unlike the system picker it can
 * show a framing guide: the dish goes in the large frame, the reference object
 * in the small box, and the shot is taken from above. Pure JS on top of
 * expo-camera, so it needs no extra native modules.
 */
export function WholeDishCamera({ visible, reference, onReferenceChange, onCapture, onClose }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const { width } = useWindowDimensions();
  const frame = width - 48;

  const snap = async () => {
    if (!cameraRef.current || capturing || !ready) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.8 });
      if (photo?.base64) onCapture({ base64: photo.base64, uri: photo.uri });
    } finally {
      setCapturing(false);
    }
  };

  const close = () => { setReady(false); onClose(); };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {!permission ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : !permission.granted ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 }}>
            <Ionicons name="camera-outline" size={40} color={Colors.muted} />
            <Text style={{ color: Colors.text, fontSize: 16, fontWeight: '700', textAlign: 'center' }}>Camera access is required</Text>
            <TouchableOpacity
              onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())}
              style={{ backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 24, minHeight: 44 }}
            >
              <Text style={{ color: '#000', fontWeight: '800' }}>{permission.canAskAgain ? 'Allow camera' : 'Open settings'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" onCameraReady={() => setReady(true)} />

            {/* Framing guide */}
            <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: frame, height: frame, borderRadius: 24, borderWidth: 2, borderColor: Colors.primary + 'cc', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700', textShadowColor: '#000', textShadowRadius: 4 }}>
                  WHOLE DISH IN HERE
                </Text>
              </View>
              <View style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#000a', borderRadius: 10, paddingVertical: 6, paddingHorizontal: 12 }}>
                <Ionicons name="resize-outline" size={16} color={Colors.primary} />
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>
                  Keep the {REFERENCE_OBJECTS[reference].label.toLowerCase()} flat, fully in view
                </Text>
              </View>
            </View>

            {/* Top bar */}
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingTop: 54, paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <TouchableOpacity onPress={close} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }}>
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>Whole dish</Text>
              <View style={{ width: 44 }} />
            </View>

            {/* Bottom controls */}
            <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingBottom: 44, paddingTop: 16, backgroundColor: '#000a', alignItems: 'center', gap: 16 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, paddingHorizontal: 16 }}>
                {REFERENCE_ORDER.map((r) => {
                  const active = r === reference;
                  return (
                    <TouchableOpacity key={r} onPress={() => onReferenceChange(r)} style={{ paddingVertical: 8, paddingHorizontal: 12, minHeight: 44, justifyContent: 'center', borderRadius: 10, backgroundColor: active ? Colors.primary + '33' : '#ffffff18', borderWidth: 1, borderColor: active ? Colors.primary : 'transparent' }}>
                      <Text style={{ color: active ? Colors.primary : '#fff', fontWeight: '700', fontSize: 12 }}>{REFERENCE_OBJECTS[r].label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TouchableOpacity
                onPress={snap}
                disabled={!ready || capturing}
                accessibilityLabel="Take photo"
                style={{ width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center', opacity: ready ? 1 : 0.4 }}
              >
                {capturing ? <ActivityIndicator color="#fff" /> : <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: Colors.primary }} />}
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}
