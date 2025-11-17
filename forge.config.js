module.exports = {
  packagerConfig: {
    asar: true,
    icon: 'assets/icon.ico',
    executableName: 'X-TES Digital Reporting',
    fileAssociations: [
      {
        ext: 'spdfr',
        name: 'SaskPower DFR Project',
        icon: 'assets/SASKPOWERICON.ico'
      },
      {
        ext: 'dfr',
        name: 'X-TES DFR Project',
        icon: 'assets/XTERRAICON.ico'
      },
      {
        ext: 'plog',
        name: 'X-TES Photo Log',
        icon: 'assets/PHOTOLOGICON.ico'
      },
      {
        ext: 'clog',
        name: 'X-TES Combine Logs',
        icon: 'assets/COMBINEDLOGICON.ico'
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
        setupIcon: 'assets/icon.ico',
        createDesktopShortcut: true
      },
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