// Dynamic overlay on top of app.json. Only exists to conditionally add the
// Meta (Facebook) SDK config plugin with credentials from process.env, per
// this repo's "never hardcode API keys" convention — app.json is static
// JSON and can't read .env itself.
//
// The plugin is appended (not statically declared in app.json) because
// react-native-fbsdk-next's config plugin THROWS during `expo prebuild` /
// `eas build` if appID is empty — so it must be entirely absent until real
// Meta credentials exist, rather than present with placeholder values.
//
// Set EXPO_PUBLIC_FACEBOOK_APP_ID / EXPO_PUBLIC_FACEBOOK_CLIENT_TOKEN in
// .env for local dev, and as EAS project environment variables for builds.

const FACEBOOK_APP_ID = process.env.EXPO_PUBLIC_FACEBOOK_APP_ID;
const FACEBOOK_CLIENT_TOKEN = process.env.EXPO_PUBLIC_FACEBOOK_CLIENT_TOKEN;

module.exports = ({ config }) => {
  if (!FACEBOOK_APP_ID) return config;

  return {
    ...config,
    plugins: [
      ...config.plugins,
      [
        'react-native-fbsdk-next',
        {
          appID: FACEBOOK_APP_ID,
          clientToken: FACEBOOK_CLIENT_TOKEN,
          displayName: 'RYZR',
          scheme: `fb${FACEBOOK_APP_ID}`,
          advertiserIDCollectionEnabled: true,
          autoLogAppEventsEnabled: true,
          isAutoInitEnabled: true,
        },
      ],
    ],
  };
};
