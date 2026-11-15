// Restricts Android builds to armeabi-v7a + arm64-v8a by default. The OTA
// preview APK targets x86_64 for Expo's cloud emulator.
//
// Why: Play blocks promotion with "Your app does not support 16 KB memory page
// sizes" because react-native-fast-tflite 1.6.1 extracts two prebuilt
// libraries from com.google.ai.edge.litert:{litert,litert-gpu}:1.0.1 whose
// x86_64 slices Google linked at 4 KB. They are not compiled here, so the
// -DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON flag in patches/ cannot reach them,
// and Play's scan is a static sweep of every .so in the bundle with no
// device-plausibility carve-out: it does not care that no x86_64 Android
// device has 16 KB pages. The only ways out are to stop shipping the ABI or to
// migrate to fast-tflite 3.x, which changes the Form Coach inference path.
//
// The Play release AAB remains ARM-only for the 16 KB page-size check.
//
// Two mechanisms, because they cover different sources of .so files:
//
//   reactNativeArchitectures  stops React Native, Hermes and every autolinked
//                             module from compiling the x86 slices at all.
//   ndk.abiFilters            strips ABIs out of the packaged app regardless
//                             of where they came from, including prebuilt
//                             .so files inside AAR dependencies — which is
//                             exactly what the LiteRT libraries are, and the
//                             only mechanism that removes them.
//
// Reverting this (after a fast-tflite upgrade that ships aligned x86_64) means
// deleting this plugin and its app.json entry. scripts/check-16kb.mjs measures
// whatever ABIs are actually present, so it will hold the new libraries to the
// same 16 KB bar without further changes.

const { withGradleProperties, withAppBuildGradle } = require('@expo/config-plugins');

const ARCHITECTURES = process.env.RYZR_ANDROID_EMULATOR === '1'
  ? ['x86_64']
  : ['armeabi-v7a', 'arm64-v8a'];
const PROPERTY = 'reactNativeArchitectures';
const MARKER = 'RYZR abiFilters';

function withArchitectureProperty(config) {
  return withGradleProperties(config, (mod) => {
    mod.modResults = mod.modResults.filter(
      (item) => !(item.type === 'property' && item.key === PROPERTY),
    );
    mod.modResults.push({
      type: 'property',
      key: PROPERTY,
      value: ARCHITECTURES.join(','),
    });
    return mod;
  });
}

function withAbiFilters(config) {
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') {
      throw new Error(
        `withArm64Only: expected app/build.gradle in groovy, got ${mod.modResults.language}`,
      );
    }
    if (mod.modResults.contents.includes(MARKER)) return mod;

    // Appended as a second `android { }` block rather than edited into the
    // existing defaultConfig: Gradle merges repeated extension blocks, so this
    // needs no anchor inside a file that prebuild regenerates and that other
    // config plugins also rewrite.
    const filters = ARCHITECTURES.map((abi) => `"${abi}"`).join(', ');
    mod.modResults.contents +=
      `\n// ${MARKER} — see plugins/withArm64Only.js.\n` +
      `// Match packaged native libraries to reactNativeArchitectures.\n` +
      `android {\n` +
      `    defaultConfig {\n` +
      `        ndk {\n` +
      `            abiFilters ${filters}\n` +
      `        }\n` +
      `    }\n` +
      `}\n`;

    return mod;
  });
}

module.exports = (config) => withAbiFilters(withArchitectureProperty(config));
