const path = require('node:path');

module.exports = {
  packagerConfig: {
    name: 'Taste Atlas',
    executableName: 'taste-atlas',
    appBundleId: 'com.julioam.tasteatlas',
    asar: true,
    icon: path.join(__dirname, 'assets', 'icon'),
    ignore: [/^\/out(?:\/|$)/, /^\/test(?:\/|$)/, /^\/\.github(?:\/|$)/, /^\/scripts(?:\/|$)/],
  },
  makers: [
    { name: '@electron-forge/maker-dmg', platforms: ['darwin'] },
    { name: '@electron-forge/maker-squirrel', platforms: ['win32'], config: { name: 'TasteAtlas', setupIcon: path.join(__dirname, 'assets', 'icon.ico') } },
    { name: '@electron-forge/maker-deb', platforms: ['linux'], config: { options: { maintainer: 'Julio Medina', icon: path.join(__dirname, 'assets', 'icon.png'), categories: ['Utility'] } } },
  ],
};
