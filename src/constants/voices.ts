// Curated ElevenLabs voices for the AI trainer. These are premade library
// voice IDs, which are stable across accounts, so no per-user voice fetch is
// needed. Personas are picked to suit coaching tone.

export interface TrainerVoice {
  id: string;
  name: string;
  persona: string;
}

export const TRAINER_VOICES: TrainerVoice[] = [
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', persona: 'Deep, steady, motivating' },
  { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh', persona: 'Young, energetic hype' },
  { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', persona: 'Bold, commanding' },
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', persona: 'Calm, encouraging' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella', persona: 'Warm, upbeat' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', persona: 'Smooth, confident' },
];

/** Short line used to preview a voice in the picker. */
export const VOICE_PREVIEW_LINE = "Let's get to work — three more reps, you've got this.";

export function trainerVoiceName(id: string | null): string {
  if (!id) return 'Device voice';
  return TRAINER_VOICES.find((v) => v.id === id)?.name ?? 'Custom';
}
