// ─────────────────────────────────────────────────────────────────────────────
// Native Sign in with Apple / Google Sign-In, exchanged for a Supabase session.
//
// Both providers hand us an OIDC ID token from their native SDK, which we trade
// for a Supabase session via signInWithIdToken. No browser round-trip, no deep
// link — the token never leaves the device except on the way to Supabase.
//
// Console setup (Apple Developer, Google Cloud, Supabase) is documented in
// docs/social-sign-in-setup.md.
// ─────────────────────────────────────────────────────────────────────────────
import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { supabase } from './supabase';

/** The user backed out of the provider sheet. Callers swallow this silently. */
export class SocialAuthCancelled extends Error {
  constructor() {
    super('Sign-in cancelled');
    this.name = 'SocialAuthCancelled';
  }
}

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';

/**
 * Whether this build has enough Google configuration to show the button.
 *
 * The web client ID is always required — it is the audience Supabase validates
 * the ID token against. iOS additionally needs its own client ID; Android
 * resolves its client from the package name + signing SHA-1 registered in
 * Google Cloud, so it needs nothing extra here.
 */
export function isGoogleSignInConfigured(): boolean {
  if (!GOOGLE_WEB_CLIENT_ID) return false;
  return Platform.OS !== 'ios' || !!GOOGLE_IOS_CLIENT_ID;
}

let googleConfigured = false;
function configureGoogle() {
  if (googleConfigured) return;
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID || undefined,
    scopes: ['profile', 'email'],
  });
  googleConfigured = true;
}

/** Sign in with Apple exists on iOS 13+ only — never on Android. */
export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function signInWithApple(): Promise<void> {
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (e: any) {
    if (e?.code === 'ERR_REQUEST_CANCELED') throw new SocialAuthCancelled();
    throw e;
  }

  if (!credential.identityToken) {
    throw new Error('Apple did not return an identity token. Please try again.');
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) throw error;

  // Apple releases the name exactly once — on the very first authorization for
  // this Apple ID. It is absent from the identity token and from every later
  // sign-in, so if we do not persist it now it is gone for good.
  const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
    .filter(Boolean)
    .join(' ')
    .trim();
  if (fullName && !data.user?.user_metadata?.name) {
    try {
      await supabase.auth.updateUser({ data: { name: fullName } });
    } catch {
      // A missing display name is not worth failing an otherwise good sign-in.
    }
  }
}

export async function signInWithGoogle(): Promise<void> {
  if (!isGoogleSignInConfigured()) {
    throw new Error(
      'Google Sign-In is not configured in this build. Add the Google client IDs to .env and rebuild.',
    );
  }
  configureGoogle();

  let idToken: string | null | undefined;
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

    // Drop any cached native session first, so the account picker always shows
    // and Google mints a fresh ID token instead of replaying a stale one.
    try {
      await GoogleSignin.signOut();
    } catch {
      // Nothing was signed in — nothing to clear.
    }

    const response = await GoogleSignin.signIn();
    if (response.type === 'cancelled') throw new SocialAuthCancelled();
    idToken = response.data?.idToken;
  } catch (e: any) {
    if (e instanceof SocialAuthCancelled) throw e;
    if (e?.code === statusCodes.SIGN_IN_CANCELLED) throw new SocialAuthCancelled();
    if (e?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      throw new Error('Google Play Services is unavailable or out of date on this device.');
    }
    throw e;
  }

  if (!idToken) {
    throw new Error('Google did not return an ID token. Please try again.');
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
  });
  if (error) throw error;
}
