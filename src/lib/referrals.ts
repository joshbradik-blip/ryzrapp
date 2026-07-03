import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { supabase } from './supabase';

const PENDING_CODE_KEY = 'ryzr_pending_referral_code';

export const APP_STORE_URL = 'https://apps.apple.com/app/ryzr/id6767086947';
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.ryzr.app';

export interface ReferralInvitee {
  name: string;
  status: 'signed_up' | 'converted';
  joined_at: string;
}

export interface ReferralStatus {
  code: string;
  conversions: number;
  invitees: ReferralInvitee[];
}

export async function fetchReferralStatus(): Promise<ReferralStatus> {
  const { data, error } = await supabase.rpc('get_referral_status');
  if (error) throw error;
  return data as ReferralStatus;
}

export function buildInviteMessage(code: string): string {
  const link = Platform.OS === 'android' ? PLAY_STORE_URL : APP_STORE_URL;
  return `Join me on RYZR — AI-powered workouts that adapt to you. Sign up with my invite code ${code} and your first month of RYZR Pro is free!\n${link}`;
}

// Invite codes entered at sign-up are stashed here and redeemed once a session
// exists (email confirmation can delay that past the sign-up screen).
export async function setPendingReferralCode(code: string): Promise<void> {
  await AsyncStorage.setItem(PENDING_CODE_KEY, code.trim().toUpperCase());
}

export async function redeemPendingReferralCode(): Promise<void> {
  const code = await AsyncStorage.getItem(PENDING_CODE_KEY);
  if (!code) return;
  const { error } = await supabase.rpc('redeem_referral_code', { p_code: code });
  // Success and permanent rejections (invalid code, self-referral, already
  // referred) both come back without an error — clear the pending code.
  // Keep it on transport/server errors so the next launch retries.
  if (!error) await AsyncStorage.removeItem(PENDING_CODE_KEY);
}
