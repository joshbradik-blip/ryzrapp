import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Image, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/theme';

interface Props {
  name: string;
  mediaUrl: string;
  muscles: string[];
  cues: string[];
}

const HERO_HEIGHT = 260;
const STEP_MS = 2500;

export function ExerciseHero({ name, mediaUrl, muscles, cues }: Props) {
  const [failed, setFailed] = useState(false);
  const [walkthrough, setWalkthrough] = useState(false);
  const [cueIndex, setCueIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const hasCues = cues.length > 0;

  useEffect(() => {
    if (walkthrough && !paused && hasCues) {
      timer.current = setInterval(() => {
        setCueIndex((i) => (i + 1) % cues.length);
      }, STEP_MS);
    }
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [walkthrough, paused, cues.length]);

  const startWalkthrough = () => {
    setCueIndex(0);
    setPaused(false);
    setWalkthrough(true);
  };

  const dismiss = () => {
    setWalkthrough(false);
    if (timer.current) clearInterval(timer.current);
  };

  const showImage = !failed && !!mediaUrl;

  return (
    <View style={{ height: HERO_HEIGHT, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
      {showImage ? (
        <Image
          source={{ uri: mediaUrl }}
          style={{ width: '100%', height: '100%' }}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      ) : (
        // Branded fallback — never a broken-image frame.
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
          <View style={{
            width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.primary + '22',
            borderWidth: 1, borderColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ color: Colors.primary, fontSize: 32, fontWeight: '900' }}>
              {name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', paddingHorizontal: 24 }}>
            {muscles.map((m) => (
              <View key={m} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: Colors.surface2 }}>
                <Text style={{ color: Colors.textSecondary, fontSize: 12, fontWeight: '600' }}>{m}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Bottom scrim for legibility */}
      <LinearGradient
        colors={['transparent', '#0A0A0Acc']}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 120 }}
        pointerEvents="none"
      />

      {/* Play button — starts the cue walkthrough */}
      {!walkthrough && hasCues && (
        <TouchableOpacity
          onPress={startWalkthrough}
          activeOpacity={0.85}
          style={{
            position: 'absolute', top: HERO_HEIGHT / 2 - 28, left: '50%', marginLeft: -28,
            width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.primary,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Ionicons name="play" size={26} color={Colors.onPrimary} style={{ marginLeft: 3 }} />
        </TouchableOpacity>
      )}

      {/* Cue walkthrough overlay */}
      {walkthrough && hasCues && (
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setPaused((p) => !p)}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0, justifyContent: 'flex-end', backgroundColor: '#0A0A0A66' }}
        >
          <TouchableOpacity
            onPress={dismiss}
            style={{ position: 'absolute', top: 12, right: 12, width: 32, height: 32, borderRadius: 16, backgroundColor: '#0A0A0Acc', alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="close" size={18} color={Colors.text} />
          </TouchableOpacity>
          <View style={{ padding: 18, backgroundColor: '#0A0A0Acc' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Text style={{ color: Colors.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1 }}>
                STEP {cueIndex + 1}/{cues.length}
              </Text>
              {paused && <Ionicons name="pause" size={13} color={Colors.muted} />}
            </View>
            <Text style={{ color: Colors.text, fontSize: 16, fontWeight: '600', lineHeight: 22 }}>
              {cues[cueIndex]}
            </Text>
            <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 8 }}>
              Tap to {paused ? 'resume' : 'pause'} · ✕ to close
            </Text>
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
}
