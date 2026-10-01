const path = require('node:path');

const signMac = process.platform === 'darwin' && (process.env.TASTEMATE_SIGN_MACOS === '1' || process.env.TASTE_ATLAS_SIGN_MACOS === '1');
if (signMac) {
  for (const name of ['MACOS_SIGN_IDENTITY', 'MACOS_KEYCHAIN_PATH', 'APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER']) {
    if (!process.env[name]) throw new Error(`Signed macOS builds require ${name}.`);
  }
}

module.exports = {
  packagerConfig: {
    name: 'TasteMate',
    executableName: 'tastemate',
    appBundleId: 'com.julioam.tastemate',
    // Electron 44 requires macOS 13+. This is a minimum; it does not cap future macOS releases.
    extendInfo: { LSMinimumSystemVersion: '13.0.0' },
    asar: true,
    icon: path.join(__dirname, 'assets', 'icon'),
    ignore: [/^\/out(?:\/|$)/, /^\/test(?:\/|$)/, /^\/website(?:\/|$)/, /^\/\.github(?:\/|$)/, /^\/scripts(?:\/|$)/],
    ...(signMac ? {
      osxSign: { identity: process.env.MACOS_SIGN_IDENTITY, keychain: process.env.MACOS_KEYCHAIN_PATH },
      osxNotarize: {
        appleApiKey: process.env.APPLE_API_KEY,
        appleApiKeyId: process.env.APPLE_API_KEY_ID,
        appleApiIssuer: process.env.APPLE_API_ISSUER,
      },
    } : {}),
  },
  makers: [
    { name: '@electron-forge/maker-zip', platforms: ['darwin'] },
    { name: '@electron-forge/maker-squirrel', platforms: ['win32'], config: { name: 'TasteMate', setupIcon: path.join(__dirname, 'assets', 'icon.ico') } },
    { name: '@electron-forge/maker-deb', platforms: ['linux'], config: { options: { maintainer: 'Julio Medina', icon: path.join(__dirname, 'assets', 'icon.png'), categories: ['Utility'] } } },
  ],
};
