
module.exports = {
  packagerConfig: {
    asar: true,
    // Use 'assets/icon' without extension. Forge will use .ico on Win and .icns on Mac.
    icon: 'public/assets/icon',
    executableName: 'X-TES Digital Reporting',
    appBundleId: 'com.xterra.digitalreporting',
    extraResource: [
      'public/assets'
    ],
    fileAssociations: [
      {
        ext: 'spdfr',
        name: 'SaskPower DFR Project',
        icon: 'public/assets/SASKPOWERICON.ico'
      },
      {
        ext: 'dfr',
        name: 'X-TES DFR Project',
        icon: 'public/assets/XTERRAICON.ico'
      },
      {
        ext: 'plog',
        name: 'X-TES Photo Log',
        icon: 'public/assets/PHOTOLOGICON.ico'
      },
      {
        ext: 'clog',
        name: 'X-TES Combine Logs',
        icon: 'public/assets/COMBINEDLOGICON.ico'
      },
      {
        ext: 'iogc',
        name: 'IOGC Audit File',
        icon: 'public/assets/XTERRAICON.ico'
      }
    ]
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        // The name of the application, derived from `productName` in package.json
        name: 'x-tec-digital-reporting-web',
        // The name of the main executable
        exe: 'X-TES Digital Reporting.exe',
        // Path to the .ico file for the installer and shortcuts
        setupIcon: 'public/assets/icon.ico',
        createDesktopShortcut: true
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-dmg',
      config: {
        icon: 'public/assets/icon.icns',
        format: 'ULFO'
      }
    }
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