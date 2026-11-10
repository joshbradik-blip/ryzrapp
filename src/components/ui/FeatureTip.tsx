import React, { useEffect, useRef, useState } from 'react';
import { Modal, Text, TouchableOpacity, useWindowDimensions, View, ScrollView, StyleProp, ViewStyle } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/theme';

let activeTip: symbol | null = null;
const acknowledgedTips = new Set<string>();

/** Keeps the real feature visible above a dimmed backdrop. Only Got it dismisses. */
export function FeatureTip({ id, title, message, enabled = true, onAcknowledged, children, style }: {
  id: string; title: string; message: string; enabled?: boolean;
  onAcknowledged?: () => void; children: React.ReactNode; style?: StyleProp<ViewStyle>;
}) {
  const target = useRef<View>(null);
  const owner = useRef(Symbol(id));
  const focused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [unseen, setUnseen] = useState(false);
  const [bounds, setBounds] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const key = `feature-tip-v1:${id}`;

  useEffect(() => {
    let alive = true;
    setBounds(null);
    setUnseen(false);
    AsyncStorage.getItem(key).then((value) => {
      if (!alive) return;
      if (value === 'seen' || acknowledgedTips.has(key)) { acknowledgedTips.add(key); onAcknowledged?.(); }
      else setUnseen(true);
    }).catch(() => { if (alive) setUnseen(true); });
    return () => { alive = false; };
  }, [key]);

  useEffect(() => {
    setBounds(null);
    if (activeTip === owner.current) activeTip = null;
    if (!enabled || !focused || !unseen) return;
    let cancelled = false;
    // Wait for navigation and layout before measuring in screen coordinates.
    const interval = setInterval(() => target.current?.measureInWindow((x, y, w, h) => {
      if (cancelled) return;
      if (acknowledgedTips.has(key)) { setUnseen(false); return; }
      if (activeTip !== null && activeTip !== owner.current) return;
      if (w > 0 && h > 0 && y >= insets.top && y + h <= height - insets.bottom) {
        activeTip = owner.current;
        setBounds((current) => current ?? { x, y, width: w, height: h });
      }
    }), 500);
    return () => { cancelled = true; clearInterval(interval); if (activeTip === owner.current) activeTip = null; };
  }, [enabled, focused, unseen, width, height]);

  const left = Math.max(0, (bounds?.x ?? 0) - 6);
  const top = Math.max(0, (bounds?.y ?? 0) - 6);
  const right = Math.min(width, (bounds?.x ?? 0) + (bounds?.width ?? 0) + 6);
  const bottom = Math.min(height, (bounds?.y ?? 0) + (bounds?.height ?? 0) + 6);
  const dim = '#000000D9';
  const below = bottom + 210 < height - insets.bottom;

  return (
    <View ref={target} collapsable={false} style={style}>
      {children}
      <Modal visible={!!bounds && enabled && focused && unseen} transparent statusBarTranslucent navigationBarTranslucent animationType="none" onRequestClose={() => {}}>
        <View style={{ flex: 1 }} accessibilityViewIsModal>
          {/* Four panels leave a clear window over the actual control. */}
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: top, backgroundColor: dim }} />
          <View style={{ position: 'absolute', top, left: 0, width: left, height: bottom - top, backgroundColor: dim }} />
          <View style={{ position: 'absolute', top, left: right, right: 0, height: bottom - top, backgroundColor: dim }} />
          <View style={{ position: 'absolute', top: bottom, left: 0, right: 0, bottom: 0, backgroundColor: dim }} />
          <View style={{ position: 'absolute', left, top, width: right - left, height: bottom - top, borderWidth: 3, borderColor: Colors.primary, borderRadius: 14, shadowColor: Colors.primary, shadowOpacity: 0.9, shadowRadius: 14, elevation: 12 }} />
          <View style={{ position: 'absolute', left: 20, right: 20, ...(below ? { top: bottom + 16 } : { bottom: height - top + 16 }), maxHeight: Math.max(140, below ? height - bottom - 32 - insets.bottom : top - 32 - insets.top), backgroundColor: Colors.surface2, padding: 20, borderRadius: 18, borderWidth: 1, borderColor: Colors.primary, elevation: 16, shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 12 }}>
            <ScrollView>
            <Text accessibilityRole="header" style={{ color: Colors.text, fontSize: 20, fontWeight: '900', marginBottom: 8 }}>{title}</Text>
            <Text style={{ color: Colors.textSecondary, fontSize: 15, lineHeight: 22, marginBottom: 16 }}>{message}</Text>
            <TouchableOpacity accessibilityRole="button" onPress={() => {
              if (activeTip === owner.current) activeTip = null;
              acknowledgedTips.add(key);
              setUnseen(false); setBounds(null);
              AsyncStorage.setItem(key, 'seen').catch(() => {});
              onAcknowledged?.();
            }} style={{ padding: 14, borderRadius: 12, backgroundColor: Colors.primary, alignItems: 'center' }}>
              <Text style={{ color: Colors.onPrimary, fontWeight: '800', fontSize: 16 }}>Got it</Text>
            </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
