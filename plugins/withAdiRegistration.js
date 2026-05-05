const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = (config) =>
  withDangerousMod(config, [
    'android',
    (mod) => {
      const assetsDir = path.join(
        mod.modRequest.platformProjectRoot,
        'app', 'src', 'main', 'assets'
      );
      fs.mkdirSync(assetsDir, { recursive: true });
      fs.writeFileSync(
        path.join(assetsDir, 'adi-registration.properties'),
        'D46W5PBKBQCTWAAAAAAAAAAAAA\n'
      );
      return mod;
    },
  ]);
