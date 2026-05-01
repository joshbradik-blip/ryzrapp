const { withProjectBuildGradle, withAppBuildGradle, withGradleProperties } = require('@expo/config-plugins');

const PRISM_MAVEN = `    maven {
      url = uri("https://maven.pkg.github.com/prismlabs-tech/prismsdk-android")
      credentials {
        username = findProperty("PRISM_GITHUB_USERNAME") ?: System.getenv("PRISM_GITHUB_USERNAME") ?: ""
        password = findProperty("PRISM_GITHUB_TOKEN") ?: System.getenv("PRISM_GITHUB_TOKEN") ?: ""
      }
    }`;

function withPrismMaven(config) {
  return withProjectBuildGradle(config, (mod) => {
    if (mod.modResults.contents.includes('prismlabs-tech')) return mod;
    mod.modResults.contents = mod.modResults.contents.replace(
      "    maven { url 'https://www.jitpack.io' }",
      `    maven { url 'https://www.jitpack.io' }\n${PRISM_MAVEN}`
    );
    return mod;
  });
}

function withPrismDependency(config) {
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.contents.includes('tech.prismlabs:prismsdk')) return mod;
    mod.modResults.contents = mod.modResults.contents.replace(
      '    implementation("com.facebook.react:react-android")',
      '    implementation("com.facebook.react:react-android")\n    implementation("tech.prismlabs:prismsdk:1.0.3")'
    );
    return mod;
  });
}

function withPrismMinSdk(config) {
  return withGradleProperties(config, (mod) => {
    mod.modResults = mod.modResults.filter(
      (item) => !(item.type === 'property' && item.key === 'android.minSdkVersion')
    );
    mod.modResults.push({ type: 'property', key: 'android.minSdkVersion', value: '28' });
    return mod;
  });
}

module.exports = (config) => withPrismMinSdk(withPrismDependency(withPrismMaven(config)));
