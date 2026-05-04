const fs = require('fs');
const isNisis = process.env.NISIS_BUILD === 'true';
const isMac = process.platform === 'darwin';
const isWindows = process.platform === 'win32';
const hasIogcBundle = fs.existsSync('IogcPdfGeneratorNode.bundle.js');

// Electron Forge resolves icon extension automatically per platform:
//   Windows → .ico, macOS → .icns, Linux → .png
// Pass the path without extension so Forge picks the right one.
const ICON_BASE = 'assets/icon';

module.exports = {
  packagerConfig: {
    asar: true,
    name: isNisis ? 'NISIS Digital Reporting' : 'X-TES Digital Reporting',
    icon: ICON_BASE,
    executableName: isNisis ? 'NISIS Digital Reporting' : 'X-TES Digital Reporting',
    extraResource: [
      'assets',
      ...(hasIogcBundle ? ['IogcPdfGeneratorNode.bundle.js'] : []),
    ],
    ...(isMac && {
      osxSign: {
        identity: 'Developer ID Application: KOLE KRISTIAN SCHREINER (UUUUG5QGQ9)',
      },
      darwinDarkModeSupport: true,
    }),
    fileAssociations: [
      {
        ext: 'spdfr',
        name: 'SaskPower DFR Project',
        icon: 'assets/SASKPOWERICON',
      },
      {
        ext: 'dfr',
        name: 'X-TES DFR Project',
        icon: 'assets/XTERRAICON',
      },
      {
        ext: 'plog',
        name: 'X-TES Photo Log',
        icon: 'assets/PHOTOLOGICON',
      },
      {
        ext: 'clog',
        name: 'X-TES Combine Logs',
        icon: 'assets/COMBINEDLOGICON',
      }
    ]
  },
  rebuildConfig: {},
  makers: isNisis
    ? [
        {
          name: '@electron-addons/electron-forge-maker-nsis',
          config: {
            icon: 'assets/icon.ico',
            createDesktopShortcut: true,
            createStartMenuShortcut: true,
          },
        },
      ]
    : isMac
    ? [
        {
          name: '@electron-forge/maker-dmg',
          config: {
            icon: 'assets/icon.icns',
            format: 'ULFO',
          },
        },
        {
          name: '@electron-forge/maker-zip',
          platforms: ['darwin'],
        },
      ]
    : [
        {
          name: '@electron-forge/maker-squirrel',
          config: {
            name: 'x-tec-digital-reporting-web',
            exe: 'X-TES Digital Reporting.exe',
            setupIcon: 'assets/icon.ico',
            loadingGif: 'assets/install-loading.gif',
            createDesktopShortcut: true,
          },
        },
      ],
  publishers: [
    {
      name: '@electron-forge/publisher-electron-release-server',
      config: {
        baseUrl: 'https://update.electronjs.org',
        repo: 'kschreiner03/XTES-Digital-Reporting'
      }
    }
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-vite',
      config: {
        // `build` specifies the Vite build configurations for your main process and preload scripts.
        build: [
          {
            // The entry point for your main process.
            entry: 'main.js',
            config: 'vite.main.config.ts',
          },
          {
            entry: 'preload.js',
            config: 'vite.preload.config.ts',
          },
          {
            entry: 'help-preload.js',
            config: 'vite.preload.config.ts',
          },
        ],
        // `renderer` specifies the Vite dev server configurations for renderer processes.
        renderer: [
          {
            name: 'main_window',
            config: 'vite.config.ts',
          },
        ],
      },
    },
  ],
};