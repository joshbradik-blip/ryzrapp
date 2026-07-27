// Trainer voice output. Routes speech to the user's chosen ElevenLabs voice
// (via the elevenlabs-tts edge function) when one is selected, and falls back
// to on-device TTS otherwise — or whenever the network call fails, so the
// coach is never left silent.

import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import { supabase } from './supabase';
import { useSettingsStore } from '../store/settingsStore';

let currentSound: Audio.Sound | null = null;
let audioModeReady = false;

async function ensureAudioMode() {
  if (audioModeReady) return;
  try {
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, shouldDuckAndroid: true });
    audioModeReady = true;
  } catch {
    // Non-fatal — playback may still work with default mode.
  }
}

async function unloadCurrent() {
  if (!currentSound) return;
  const sound = currentSound;
  currentSound = null;
  try {
    await sound.stopAsync();
    await sound.unloadAsync();
  } catch {
    // already unloaded
  }
}

function speakOnDevice(text: string) {
  Speech.speak(text, { rate: 0.98 });
}

/** Fetches + plays an ElevenLabs clip. Throws so callers can fall back. */
async function playElevenLabs(text: string, voiceId: string) {
  const { data, error } = await supabase.functions.invoke('elevenlabs-tts', {
    body: { text, voice_id: voiceId },
  });
  if (error || !data?.audio) throw error ?? new Error('No audio returned');

  await ensureAudioMode();
  await unloadCurrent();

  const { sound } = await Audio.Sound.createAsync(
    { uri: `data:${data.mime ?? 'audio/mpeg'};base64,${data.audio}` },
    { shouldPlay: true }
  );
  currentSound = sound;
  sound.setOnPlaybackStatusUpdate((status) => {
    if (status.isLoaded && status.didJustFinish) unloadCurrent();
  });
}

/**
 * Speaks text in the trainer's voice. Respects the global voice toggle. Uses
 * the selected ElevenLabs voice when set, otherwise on-device TTS; any TTS
 * failure silently degrades to on-device speech.
 */
export async function speak(text: string) {
  const { voiceEnabled, trainerVoiceId } = useSettingsStore.getState();
  if (!voiceEnabled || !text?.trim()) return;

  if (!trainerVoiceId) {
    speakOnDevice(text);
    return;
  }
  try {
    await playElevenLabs(text, trainerVoiceId);
  } catch {
    speakOnDevice(text);
  }
}

/** Stops any in-progress trainer speech (both device and ElevenLabs). */
export async function stopSpeaking() {
  Speech.stop();
  await unloadCurrent();
}

/**
 * Plays a one-off preview of a specific ElevenLabs voice, ignoring the
 * selected-voice setting (used by the voice picker). Returns false on failure
 * so the UI can surface it.
 */
export async function previewVoice(voiceId: string, text: string): Promise<boolean> {
  try {
    await playElevenLabs(text, voiceId);
    return true;
  } catch {
    return false;
  }
}
