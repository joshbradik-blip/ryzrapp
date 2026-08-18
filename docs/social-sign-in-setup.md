# Sign in with Apple + Google Sign-In

Both providers use the **native** flow: the platform SDK returns an OIDC ID
token, and the app trades it for a Supabase session with
`supabase.auth.signInWithIdToken`. There is no browser hop and no deep-link
round-trip, so nothing here depends on the `ryzr://` scheme.

| Piece | Where |
|---|---|
| Token exchange | `src/lib/socialAuth.ts` |
| Store actions | `src/store/authStore.ts` (`signInWithApple`, `signInWithGoogle`) |
| UI | `src/components/auth/SocialAuthButtons.tsx`, used by Login + Sign Up |
| Native config | `app.json` (`ios.usesAppleSignIn`, the two config plugins) |
| Client IDs | `.env` (`EXPO_PUBLIC_GOOGLE_*_CLIENT_ID`) |

**Both packages are native modules.** They ship only in a new EAS build —
`eas update` / OTA will not deliver them.

---

## Status

- [x] App code — buttons, token exchange, Supabase session, Apple name capture
- [ ] Apple Developer + Supabase Apple provider
- [ ] Google Cloud **Web** OAuth client
- [ ] Google Cloud **iOS** OAuth client → paste into `app.json` + `.env`
- [ ] Google Cloud **Android** OAuth client (needs the signing SHA-1)
- [ ] Supabase Google provider — authorized client IDs

---

## 1. Apple

1. **Apple Developer → Certificates, IDs & Profiles → Identifiers →
   `com.ryzr.app`**: enable the **Sign in with Apple** capability.
2. **Supabase → Authentication → Providers → Apple**: enable it, and add
   `com.ryzr.app` to **Authorized Client IDs**.

The Services ID / key / client-secret fields on that Supabase page are only for
the *web* OAuth flow. The native iOS flow validates the token against the
bundle ID in Authorized Client IDs, so leave them alone unless you also sign in
from a browser.

Apple releases the user's name **exactly once**, on the very first
authorization — it is not in the identity token and never comes back on later
sign-ins. `signInWithApple()` writes it to `user_metadata.name` immediately for
that reason. To re-test the first-run path, remove RYZR under *Settings → your
name → Sign in with Apple* on the device.

> The welcome email trigger fires on the `auth.users` insert, which happens a
> moment before that name write lands, so a brand-new Apple user's welcome email
> greets them as "there". The Day 3/7/21 drip reads metadata at send time and
> gets the real name.

---

## 2. Google Cloud

In **console.cloud.google.com → APIs & Services → Credentials**, create three
OAuth 2.0 client IDs under the same project:

| Client type | Needed for | Where it goes |
|---|---|---|
| **Web application** | Supabase validating every ID token | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` |
| **iOS** (bundle `com.ryzr.app`) | the iOS native sheet | `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` + `app.json` |
| **Android** (package `com.ryzr.app` + SHA-1) | the Android native sheet | nothing in code — Google matches it by signature |

The web client is the audience Supabase checks, on *all* platforms — it is
required even though no web app exists.

### iOS client → `app.json`

The iOS client page shows an **iOS URL scheme** (the client ID with its
dot-segments reversed). Paste it into `app.json`, replacing the placeholder:

```jsonc
[
  "@react-native-google-signin/google-signin",
  { "iosUrlScheme": "com.googleusercontent.apps.REPLACE_WITH_IOS_CLIENT_ID" }
]
```

### Android client → the SHA-1 fingerprint

This is the one step that has no in-app equivalent: Google identifies the
Android app by **package name + signing certificate fingerprint**, so the
client will not authenticate until the right SHA-1 is registered.

```bash
eas credentials --platform android
# → production → Keystore → shows the SHA-1 of the upload key
```

Register a separate Android OAuth client for **every** signing key that will
run the app:

- the **EAS upload key** (from the command above) — internal/preview builds
- the **Play App Signing key** — the one real users get. Play Console →
  *Test and release → Setup → App signing → App signing key certificate SHA-1*.
  Miss this and Google sign-in works in your test builds and fails in
  production.
- the **debug keystore**, if you sign in from a local `expo run:android` build.

### Supabase → Authentication → Providers → Google

Enable it, then add **all three** client IDs to **Authorized Client IDs**
(comma-separated): web, iOS, Android. The Client ID / Client Secret fields take
the *web* client's values and, again, only matter for the browser flow.

---

## 3. `.env`

```bash
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=....apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=....apps.googleusercontent.com
```

`isGoogleSignInConfigured()` hides the Google button unless the web client ID is
set (plus the iOS one on iOS), so a build without these falls back cleanly to
email + password instead of showing a button that cannot work. Set the same
values as EAS secrets so cloud builds inline them.

---

## 4. Verify

1. `eas build --profile preview` for the platform you are testing — a new
   binary is required.
2. Sign in with each provider on a fresh install.
3. Supabase → Authentication → Users: the new row should show the provider and
   a populated `name` in its metadata.
4. `funnel_events` should carry `social_signin_started` →
   `social_signin_completed` with `props.provider`.

### When it fails

| Symptom | Cause |
|---|---|
| Google button never appears | client IDs missing from the build's env |
| `DEVELOPER_ERROR` on Android | SHA-1 not registered, or wrong package name |
| Works in test builds, fails from Play | Play App Signing key SHA-1 not registered |
| Supabase rejects a good token | that client ID is not in Authorized Client IDs |
| Apple sheet opens then errors | Sign in with Apple capability off on the App ID |
| Apple user's name is "there" | expected on re-auth — Apple only sends it once |
