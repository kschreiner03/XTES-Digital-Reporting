
const { app, BrowserWindow, ipcMain, dialog, Menu, shell, autoUpdater, nativeTheme, session } = require('electron');
const { spawn, execFile, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Suppress Electron's CSP dev warning — unsafe-eval is only present in dev
// for Vite HMR; it is never included in the packaged build's CSP.
if (!app.isPackaged) process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';

// In packaged builds the self-contained bundle (with jspdf inlined) lives in resources/.
// In development the raw source file is loaded directly (jspdf resolved from node_modules).
const generatorPath = app.isPackaged
  ? path.join(process.resourcesPath, 'IogcPdfGeneratorNode.bundle.js')
  : path.resolve(__dirname, '..', '..', 'IogcPdfGeneratorNode.js');
const { generateIogcPdf } = require(generatorPath);

let mainWindow;
let helpWindow;
let forceClose = false;
let pendingUpdate = false; // true when update downloaded but user chose "Later"
let closeTimeout = null;

// --- Configuration / Secrets ---
// Prefer environment variables for sensitive or environment-specific URLs
const REPO_URL = process.env.GITHUB_REPOSITORY || 'kschreiner03/XTES-Digital-Reporting';
const REPORT_ISSUE_URL = process.env.REPORT_ISSUE_URL || 'https://forms.office.com/r/A0jqm6vHb6';

// --- Security: Allowed Extensions for File Operations ---
const ALLOWED_EXTENSIONS = ['.dfr', '.spdfr', '.plog', '.clog', '.iogc', '.json'];

// --- Squirrel install/update event detection (Windows only, must be checked early) ---
const isSquirrelEvent = process.platform === 'win32' &&
  process.argv.slice(1).some(a => a.startsWith('--squirrel-'));

// --- Single Instance Lock (skip during Squirrel install/update/uninstall events) ---
if (!isSquirrelEvent) {
  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    app.quit();
  } else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
        const filePath = commandLine.find(arg =>
          ALLOWED_EXTENSIONS.some(ext => arg.endsWith(ext))
        );
        if (filePath) {
          mainWindow.webContents.send('open-file-path', filePath);
        }
      }
    });
  }
}

// --- Shortcut creation (Windows only) ---
const updateExe = path.resolve(path.dirname(process.execPath), '..', 'Update.exe');
const exeName = path.basename(process.execPath);

// Handle Squirrel lifecycle events (install, update, uninstall, obsolete)
// process.exit() is used instead of app.quit() here because app.quit() called
// before app.isReady() is unreliable in Electron 40+ and can leave the
// installer loading GIF open indefinitely.
if (isSquirrelEvent) {
  const squirrelArg = process.argv.find(a => a.startsWith('--squirrel-'));

  if (squirrelArg === '--squirrel-install' || squirrelArg === '--squirrel-updated') {
    spawn(updateExe, ['--createShortcut', exeName], { detached: true, stdio: 'ignore' }).unref();
    const appExe = path.resolve(path.dirname(process.execPath), exeName);
    // Pass --squirrel-firstrun so the re-launched app can close the installer window
    spawn(appExe, ['--squirrel-firstrun'], { detached: true, stdio: 'ignore' }).unref();
    process.exit(0);
  } else if (squirrelArg === '--squirrel-uninstall') {
    spawn(updateExe, ['--removeShortcut', exeName], { detached: true, stdio: 'ignore' }).unref();
    setTimeout(() => process.exit(0), 500);
  } else {
    process.exit(0);
  }
}

app.once('ready', () => {
  if (isSquirrelEvent || process.platform !== 'win32') return;

  try {
    const desktopShortcut = path.join(app.getPath('desktop'), 'X-TES Digital Reporting.lnk');
    if (fs.existsSync(updateExe) && !fs.existsSync(desktopShortcut)) {
      console.log('Creating desktop/start menu shortcuts...');
      spawn(updateExe, ['--createShortcut', exeName], { detached: true });
    }
  } catch (err) {
    console.error('Failed to create shortcuts manually:', err);
  }
});

// --- macOS file open handling ---
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  // Security check: Only allow opening files with permitted extensions
  const ext = path.extname(filePath).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) return;

  if (mainWindow) {
    mainWindow.webContents.send('open-file-path', filePath);
  } else {
    process.argv.push(filePath);
  }
});

// --- Help window ---
function createHelpWindow() {
  if (helpWindow) {
    helpWindow.focus();
    return;
  }

  helpWindow = new BrowserWindow({
    width: 960,
    height: 720,
    title: 'Help - X-TES Digital Reporting',
    webPreferences: {
      preload: path.join(__dirname, 'help-preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true, // Enable sandbox for extra security
    },
  });
  
  // Handle dev vs. production paths
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    const helpUrl = new URL('help.html', MAIN_WINDOW_VITE_DEV_SERVER_URL);
    helpWindow.loadURL(helpUrl.href).catch(err => console.error('Failed to load help window URL:', err));
  } else {
    helpWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/help.html`))
      .catch(err => console.error('Failed to load help window file:', err));
  }

  // Security: Prevent new windows from being created from within the help window
  helpWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  helpWindow.on('closed', () => {
    helpWindow = null;
  });
}

// --- Application Menu ---
const menuTemplate = [
  ...(process.platform === 'darwin'
    ? [
        {
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideothers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' },
          ],
        },
      ]
    : []),
  {
    label: 'File',
    submenu: [
        {
            label: 'Save',
            click: () => {
                if (mainWindow) {
                    mainWindow.webContents.send('quick-save-shortcut');
                }
            },
            accelerator: 'CmdOrCtrl+S'
        },
        {
            label: 'Save As...',
            click: () => {
                if (mainWindow) {
                    mainWindow.webContents.send('save-project-shortcut');
                }
            },
            accelerator: 'CmdOrCtrl+Shift+S'
        },
        {
            label: 'Export PDF',
            click: () => {
                if (mainWindow) {
                    mainWindow.webContents.send('export-pdf-shortcut');
                }
            },
            accelerator: 'CmdOrCtrl+E'
        },
        { type: 'separator' },
        {
            label: 'Download Photos',
            click: () => {
                if (mainWindow) {
                    mainWindow.webContents.send('download-photos');
                }
            },
            accelerator: 'CmdOrCtrl+D'
        },
        { type: 'separator' },
        {
            label: 'Package Project…',
            click: () => {
                if (mainWindow) {
                    mainWindow.webContents.send('package-project');
                }
            },
        },
        {
            label: 'Open Package…',
            click: () => {
                if (mainWindow) {
                    mainWindow.webContents.send('open-package');
                }
            },
        },
        { type: 'separator' },
        process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' }
    ],
  },
  {
    label: 'Edit',
    submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
    ],
  },
  {
    label: 'Settings',
    submenu: [
      {
        label: 'Preferences...',
        click: () => {
            if (mainWindow) {
                mainWindow.webContents.send('open-settings');
            }
        },
        accelerator: 'CmdOrCtrl+,'
      }
    ]
  },
  {
    label: 'Help',
    submenu: [
      {
        label: 'How to Use',
        click: createHelpWindow,
      },
      {
        label: 'Report Issues',
        click: async () => {
          try {
            // Security: Only allow https protocols
            await shell.openExternal(REPORT_ISSUE_URL);
          } catch (err) {
            console.error('Failed to open issue form:', err);
            dialog.showErrorBox('Error', 'Could not open the issue report form.');
          }
        },
      },
    ],
  },
];

// --- Main Window ---
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 960,
    show: false, // Start hidden to prevent flickering before maximize
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      plugins: true,
      spellcheck: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    if (process.argv.includes('--squirrel-firstrun') && process.platform === 'win32') {
      // Kill the Squirrel installer process so its loading GIF window closes,
      // then show the app a beat later so there's no overlap.
      spawn('taskkill', ['/F', '/IM', 'x-tec-digital-reporting-webSetup.exe'],
        { detached: true, stdio: 'ignore' }).unref();
      setTimeout(() => { mainWindow.maximize(); mainWindow.show(); }, 300);
    } else {
      mainWindow.maximize();
      mainWindow.show();
    }
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
      .catch(err => console.error('Failed to load main window URL:', err));
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`))
      .catch(err => console.error('Failed to load main window file:', err));
  }

  // F12 / Ctrl+Shift+I → toggle DevTools
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const isF12 = input.key === 'F12';
    const isCtrlShiftI = (input.control || input.meta) && input.shift && input.key === 'I';
    if (isF12 || isCtrlShiftI) {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
      }
    }
    // Block Ctrl+P — prevent Chromium from printing the raw HTML app.
    // Reports handle printing themselves by generating a PDF first.
    const isCtrlP = (input.control || input.meta) && input.key === 'p';
    if (isCtrlP) event.preventDefault();
  });

  // Security: Handle external links (e.g. from help docs)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) {
      shell.openExternal(url).catch(err => console.error('Failed to open external URL:', err));
    }
    return { action: 'deny' };
  });

  // Enhanced context menu with spell check support
  mainWindow.webContents.on('context-menu', (event, params) => {
    const menuTemplate = [];

    // Add spell check suggestions if there's a misspelled word
    if (params.misspelledWord) {
      // Add suggestions at the top
      params.dictionarySuggestions.slice(0, 5).forEach(suggestion => {
        menuTemplate.push({
          label: suggestion,
          click: () => mainWindow.webContents.replaceMisspelling(suggestion)
        });
      });

      // Add "Add to Dictionary" option
      if (menuTemplate.length > 0) {
        menuTemplate.push({ type: 'separator' });
      }
      menuTemplate.push({
        label: 'Add to Dictionary',
        click: () => mainWindow.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
      });
      menuTemplate.push({ type: 'separator' });
    }

    // Standard editing options
    menuTemplate.push(
      { role: 'cut', enabled: params.editFlags.canCut },
      { role: 'copy', enabled: params.editFlags.canCopy },
      { role: 'paste', enabled: params.editFlags.canPaste },
      { type: 'separator' },
      { role: 'selectAll', enabled: params.editFlags.canSelectAll }
    );

    const menu = Menu.buildFromTemplate(menuTemplate);
    menu.popup({ window: mainWindow });
  });

  mainWindow.webContents.on('did-finish-load', () => {
    const filePath = process.argv.find(arg =>
        ALLOWED_EXTENSIONS.some(ext => arg.endsWith(ext))
    );
    if (filePath) {
      mainWindow.webContents.send('open-file-path', filePath);
    }
  });

  // Intercept window close to allow renderer to show unsaved changes modal.
  // If the renderer never responds (e.g. race condition during lazy-load), force-close after 10s.
  mainWindow.on('close', (e) => {
    if (!forceClose) {
      e.preventDefault();
      mainWindow.webContents.send('close-attempted');
      if (closeTimeout) clearTimeout(closeTimeout);
      closeTimeout = setTimeout(() => {
        closeTimeout = null;
        forceClose = true;
        mainWindow?.destroy();
      }, 10000);
    }
  });

  ipcMain.removeAllListeners('confirm-close');
  ipcMain.on('confirm-close', () => {
    if (closeTimeout) { clearTimeout(closeTimeout); closeTimeout = null; }
    forceClose = true;
    if (mainWindow) mainWindow.destroy();
  });

  mainWindow.on('closed', () => {
    if (closeTimeout) { clearTimeout(closeTimeout); closeTimeout = null; }
    mainWindow = null;
    forceClose = false;
  });
}

const allowedPdfs = [
    'Example_DFR.pdf',
    'Example_DFR_Monitoring.pdf',
    'Example_DFR_NonCompliance.pdf',
    'Example_DFR_Herbicide.pdf',
    'Example_DFR_Construction.pdf',
    'Example_DFR_NestSweep.pdf'
];

// --- Handle file operations ---
app.whenReady().then(() => {
  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception in main process:', err);
    dialog.showErrorBox('Unexpected Error', `An unexpected error occurred:\n\n${err.message}`);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled promise rejection in main process:', reason);
  });
  // Squirrel events are handled entirely in showInstallScreen() — skip normal startup
  if (isSquirrelEvent) return;

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  // --- Spell Checker Configuration ---
  // Enable spell checking for English (US and CA)
  session.defaultSession.setSpellCheckerLanguages(['en-US', 'en-CA']);

  // Enable spell checker
  session.defaultSession.setSpellCheckerEnabled(true);

  // --- Auto-updater Logic (packaged builds only — Squirrel is not present in dev) ---
  if (app.isPackaged) {
    const server = 'https://update.electronjs.org';
    const feedUrl = `${server}/${REPO_URL}/${process.platform}-${process.arch}/${app.getVersion()}`;

    try {
      autoUpdater.setFeedURL(feedUrl);
    } catch (error) {
      console.error('Failed to set auto-updater feed URL:', error);
    }

    // Check for updates shortly after startup, then every hour
    setTimeout(() => autoUpdater.checkForUpdates().catch(err => console.error('Update check failed:', err)), 5000);
    setInterval(() => autoUpdater.checkForUpdates().catch(err => console.error('Update check failed:', err)), 60 * 60 * 1000);

    autoUpdater.on('update-available', () => {
      if (mainWindow) mainWindow.webContents.send('update-available');
    });

    autoUpdater.on('update-downloaded', () => {
      if (mainWindow) mainWindow.webContents.send('update-downloaded');
    });

    ipcMain.on('install-update-now', () => {
      forceClose = true;
      autoUpdater.quitAndInstall();
    });

    ipcMain.on('install-update-later', () => {
      pendingUpdate = true;
    });

    app.on('before-quit', () => {
      if (pendingUpdate) autoUpdater.quitAndInstall();
    });

    autoUpdater.on('error', (error) => {
      console.error('Auto-updater error:', error);
    });
  }
  // --- End Auto-updater Logic ---

  ipcMain.handle('open-pdf', async (event, filename) => {
    // Security: Validate filename against allowlist
    if (!allowedPdfs.some(f => f.toLowerCase() === filename.toLowerCase())) {
        console.error('Requested PDF is not allowed:', filename);
        dialog.showErrorBox('Error', 'The requested file is not a valid example document.');
        return;
    }

    const assetsDir = app.isPackaged
        ? path.join(process.resourcesPath, 'assets')
        : path.join(app.getAppPath(), 'public', 'assets');
    
    // Security: Normalize path to prevent traversal
    const pdfPath = path.normalize(path.join(assetsDir, filename));

    // Use path.sep suffix to prevent prefix-match bypass (e.g. /assets_backup starting with /assets)
    if (!pdfPath.startsWith(assetsDir + path.sep) && pdfPath !== assetsDir) {
        console.error('Path traversal attempt detected');
        return;
    }

    try {
        await shell.openPath(pdfPath);
    } catch (err) {
        console.error(`Failed to open PDF: ${pdfPath}`, err);
        dialog.showErrorBox('Error', `Could not open the file: ${pdfPath}`);
    }
  });

  ipcMain.handle('get-asset-path', (event, filename) => {
    // Security: validate input type
    if (typeof filename !== 'string' || !filename) return '';

    // Normalize to forward slashes, then resolve to catch encoded traversal tricks
    const safeName = filename.replace(/\\/g, '/');
    const normalized = path.normalize(safeName).replace(/\\/g, '/');

    // Block any path traversal after normalization
    if (normalized.startsWith('..') || normalized.includes('/../') || path.isAbsolute(normalized)) {
        console.warn('[security] get-asset-path: blocked traversal attempt:', filename);
        return '';
    }

    // Whitelist allowed asset extensions
    const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.JPG', '.JPEG', '.PNG']);
    const ext = path.extname(normalized);
    if (!ALLOWED_EXTENSIONS.has(ext)) {
        console.warn('[security] get-asset-path: blocked disallowed extension:', ext);
        return '';
    }

    // URL-encode each path segment (handles spaces, commas, etc.) but preserve /
    const encodedName = normalized.split('/').map(s => encodeURIComponent(s)).join('/');

    const assetsRoot = app.isPackaged
      ? path.join(process.resourcesPath, 'assets')
      : path.join(app.getAppPath(), 'assets');
    const assetPath = path.join(assetsRoot, ...normalized.split('/'));
    return encodeURI(`file://${assetPath.replace(/\\/g, '/')}`);
  });

  ipcMain.handle('generate-iogc-pdf', async (event, data) => {
    const assetsDir = app.isPackaged
      ? path.join(process.resourcesPath, 'assets')
      : path.join(app.getAppPath(), 'assets');
    try {
      const result = await generateIogcPdf(data, assetsDir);
      return { success: true, buffer: result.buffer, filename: result.filename };
    } catch (err) {
      console.error('IOGC PDF generation failed:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('save-project', async (event, data, defaultPath) => {
    const window = BrowserWindow.getFocusedWindow();
    let filters = [{ name: 'Project Files', extensions: ['json'] }];
    const ext = defaultPath ? path.extname(defaultPath).toLowerCase() : '';

    if (ext === '.spdfr') filters = [{ name: 'SaskPower DFR Project', extensions: ['spdfr'] }];
    else if (ext === '.dfr') filters = [{ name: 'X-TES DFR Project', extensions: ['dfr'] }];
    else if (ext === '.plog') filters = [{ name: 'X-TES Photo Log', extensions: ['plog'] }];
    else if (ext === '.clog') filters = [{ name: 'X-TES Combine Logs', extensions: ['clog'] }];
    else if (ext === '.iogc') filters = [{ name: 'IOGC Audit File', extensions: ['iogc'] }];

    const { filePath } = await dialog.showSaveDialog(window, {
      title: 'Save Project',
      defaultPath,
      filters,
    });

    if (filePath) {
      try {
        fs.writeFileSync(filePath, data);
        return { success: true, path: filePath };
      } catch (err) {
        console.error('Failed to save project file:', err);
        return { success: false, error: err.message };
      }
    }
    return { success: false };
  });

  ipcMain.handle('load-project', async (event, fileType) => {
    const window = BrowserWindow.getFocusedWindow();
    let filters = [];

    if (fileType === 'plog') filters.push({ name: 'Photo Log Files', extensions: ['plog'] });
    else if (fileType === 'dfr') filters.push({ name: 'DFR Standard Files', extensions: ['dfr'] });
    else if (fileType === 'spdfr') filters.push({ name: 'SaskPower DFR Files', extensions: ['spdfr'] });
    else if (fileType === 'clog') filters.push({ name: 'Combine Logs Files', extensions: ['clog'] });
    else if (fileType === 'iogc') filters.push({ name: 'IOGC Audit Files', extensions: ['iogc'] });
    else filters.push({ name: 'All Project Files', extensions: ['plog', 'dfr', 'spdfr', 'clog', 'iogc'] });

    filters.push({ name: 'All Files', extensions: ['*'] });

    const { filePaths } = await dialog.showOpenDialog(window, {
      title: 'Open Project',
      properties: ['openFile'],
      filters,
    });

    if (filePaths && filePaths.length > 0) {
      const chosenPath = filePaths[0];
      // Defense-in-depth: validate extension even though the dialog already filters
      const ext = path.extname(chosenPath).toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        console.error('Blocked unexpected file type from dialog:', chosenPath);
        return null;
      }
      try {
        const data = fs.readFileSync(chosenPath, 'utf-8');
        return data;
      } catch (err) {
        console.error('Failed to read project file:', err);
        return null;
      }
    }
    return null;
  });

  ipcMain.handle('read-file', async (event, filePath) => {
    // Security: validate type, require absolute path, and check extension allowlist.
    // Requiring an absolute path prevents relative traversal (e.g. ../../sensitive.plog).
    if (!filePath || typeof filePath !== 'string') return { success: false, error: 'Invalid path' };
    if (!path.isAbsolute(filePath)) {
        console.error(`Blocked relative path in read-file: ${filePath}`);
        return { success: false, error: 'Absolute path required.' };
    }

    const ext = path.extname(filePath).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
        console.error(`Blocked attempt to read unauthorized file type: ${filePath}`);
        return { success: false, error: 'Unauthorized file type.' };
    }

    try {
      const data = fs.readFileSync(filePath, 'utf-8');
      return { success: true, data, path: filePath };
    } catch (err) {
      console.error('Failed to read file:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('print-pdf', async (event, data) => {
    try {
      const tempPath = path.join(os.tmpdir(), `xtec_print_${Date.now()}.pdf`);
      fs.writeFileSync(tempPath, Buffer.from(data));

      const printWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        title: 'Print Preview',
        parent: mainWindow,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: false,
          plugins: true,
        },
      });

      // Block navigation away from the PDF
      printWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

      const fileUrl = 'file:///' + tempPath.replace(/\\/g, '/');
      await printWindow.loadURL(fileUrl);

      // Show the window — user prints from the PDF viewer's own toolbar print button,
      // which correctly shows print preview (webContents.print() does not for PDF plugin content).
      printWindow.show();

      printWindow.on('closed', () => {
        try { fs.unlinkSync(tempPath); } catch {}
      });

      return { success: true };
    } catch (err) {
      console.error('Failed to open print preview:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('save-pdf', async (event, data, defaultPath) => {
    const window = BrowserWindow.getFocusedWindow();
    const { filePath } = await dialog.showSaveDialog(window, {
      title: 'Save PDF',
      defaultPath: defaultPath || 'photolog.pdf',
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
    });

    if (filePath) {
      try {
        fs.writeFileSync(filePath, Buffer.from(data));
        return { success: true, path: filePath };
      } catch (err) {
        console.error('Failed to save PDF file:', err);
        return { success: false, error: err.message };
      }
    }
    return { success: false };
  });

  ipcMain.handle('save-zip-file', async (event, data, defaultPath) => {
    const window = BrowserWindow.getFocusedWindow();
    const { filePath } = await dialog.showSaveDialog(window, {
        title: 'Save Photos As...',
        defaultPath: defaultPath,
        filters: [{ name: 'Zip Files', extensions: ['zip'] }],
    });

    if (filePath) {
        try {
            fs.writeFileSync(filePath, Buffer.from(data));
            return { success: true, path: filePath };
        } catch (err) {
            console.error('Failed to save zip file:', err);
            return { success: false, error: err.message };
        }
    }
    return { success: false };
  });

  ipcMain.handle('load-multiple-projects', async (event) => {
    const window = BrowserWindow.getFocusedWindow();
    const { filePaths } = await dialog.showOpenDialog(window, {
      title: 'Import Photos from Files',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'All Project Files', extensions: ['plog', 'dfr', 'spdfr', 'json', 'clog', 'iogc'] },
        { name: 'Photo Log Files', extensions: ['plog', 'clog'] },
        { name: 'DFR Files', extensions: ['dfr', 'spdfr'] },
        { name: 'IOGC Files', extensions: ['iogc'] },
        { name: 'JSON files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (filePaths && filePaths.length > 0) {
      try {
        const filesContent = filePaths.map(filePath => {
          // Verify file extensions even for bulk load
          const ext = path.extname(filePath).toLowerCase();
          if (!ALLOWED_EXTENSIONS.includes(ext)) {
             throw new Error("Unauthorized file type selected");
          }
          return fs.readFileSync(filePath, 'utf-8');
        });
        return { success: true, data: filesContent };
      } catch (err) {
        console.error('Failed to read project files:', err);
        return { success: false, error: err.message };
      }
    }
    return { success: false, data: [] };
  });

  // --- Project Packaging ---

  ipcMain.handle('open-package-file', async (event) => {
    const window = BrowserWindow.getFocusedWindow();
    const { filePaths } = await dialog.showOpenDialog(window, {
      title: 'Open Project Package',
      properties: ['openFile'],
      filters: [
        { name: 'X-TEC Project Package', extensions: ['zip'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (filePaths && filePaths.length > 0) {
      try {
        const buf = fs.readFileSync(filePaths[0]);
        return { success: true, data: buf.toString('base64'), path: filePaths[0] };
      } catch (err) {
        console.error('Failed to read package file:', err);
        return { success: false, error: err.message };
      }
    }
    return { success: false };
  });

  ipcMain.handle('select-extract-folder', async (event) => {
    const window = BrowserWindow.getFocusedWindow();
    const { filePaths } = await dialog.showOpenDialog(window, {
      title: 'Choose Extraction Folder',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (filePaths && filePaths.length > 0) {
      return { success: true, path: filePaths[0] };
    }
    return { success: false };
  });

  ipcMain.handle('extract-package-to-folder', async (event, folderPath, files) => {
    // Security: require absolute path
    if (!folderPath || typeof folderPath !== 'string' || !path.isAbsolute(folderPath)) {
      return { success: false, error: 'Invalid destination folder path.' };
    }
    if (!Array.isArray(files)) {
      return { success: false, error: 'Invalid files list.' };
    }
    const normalizedFolder = path.normalize(folderPath);
    try {
      for (const file of files) {
        if (!file.relativePath || typeof file.relativePath !== 'string') continue;
        // Security: prevent path traversal
        const destPath = path.normalize(path.join(normalizedFolder, file.relativePath));
        if (!destPath.startsWith(normalizedFolder + path.sep) && destPath !== normalizedFolder) {
          console.warn('[security] extract-package: blocked traversal attempt:', file.relativePath);
          continue;
        }
        const destDir = path.dirname(destPath);
        fs.mkdirSync(destDir, { recursive: true });
        const data = Buffer.from(file.dataBase64, 'base64');
        fs.writeFileSync(destPath, data);
      }
      return { success: true };
    } catch (err) {
      console.error('Failed to extract package:', err);
      return { success: false, error: err.message };
    }
  });

  // ── System Media (window title polling via tasklist) ─────────────

  const MEDIA_PATTERNS = [
    { proc: 'Spotify',        re: /^(.+?) - (.+)$/,                   swap: true  },
    { proc: 'TIDAL',          re: /^(.+?) - (.+?) \| TIDAL$/,         swap: false },
    { proc: 'foobar2000',     re: /^\[(.+?)\] (.+?) - foobar2000/,    swap: true  },
    { proc: 'vlc',            re: /^(.+?) - VLC media player$/,        swap: false, noArtist: true },
    { proc: 'iTunes',         re: /^(.+?) - iTunes$/,                  swap: false, noArtist: true },
    { proc: 'chrome',         re: /^(.+?) - YouTube/,                  swap: false, artist: 'YouTube' },
    { proc: 'msedge',         re: /^(.+?) - YouTube/,                  swap: false, artist: 'YouTube' },
    { proc: 'firefox',        re: /^(.+?) - YouTube/,                  swap: false, artist: 'YouTube' },
  ];

  function parseTasklist(csv) {
    // tasklist /V /FO CSV /NH columns:
    // "ImageName","PID","Session","#","Mem Usage","Status","User","CPU Time","Window Title"
    for (const line of csv.split('\n')) {
      const parts = line.trim().match(/^"([^"]+)","[^"]*","[^"]*","[^"]*","[^"]*","[^"]*","[^"]*","[^"]*","([^"]+)"/);
      if (!parts) continue;
      const [, procName, title] = parts;
      if (!title || title === 'N/A') continue;
      for (const p of MEDIA_PATTERNS) {
        if (!procName.toLowerCase().startsWith(p.proc.toLowerCase())) continue;
        const m = title.match(p.re);
        if (!m) continue;
        let t, a;
        if (p.artist) { t = m[1]; a = p.artist; }
        else if (p.noArtist) { t = m[1]; a = ''; }
        else if (p.swap) { a = m[1]; t = m[2]; }
        else { t = m[1]; a = m[2]; }
        return { active: true, isPlaying: true, title: t.trim(), artist: a.trim(), appId: procName, thumbnail: '' };
      }
    }
    return null;
  }

  ipcMain.handle('get-media-info', () => new Promise((resolve) => {
    const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const cmd = [
      `$r=$null;$paused=$false`,
      // Check dedicated media apps — match title for playing, detect process-exists for paused
      `foreach($n in @('Spotify','TIDAL','vlc','foobar2000','iTunes')){$procs=Get-Process -Name $n -EA 0;if($procs){$p=$procs|Where-Object{$_.MainWindowTitle}|Select-Object -First 1;if($p){$r=[PSCustomObject]@{name=$p.ProcessName;title=$p.MainWindowTitle};break}else{$paused=$true;$r=[PSCustomObject]@{name=$n;title=''};break}}}`,
      // Browser YouTube
      `if(-not $r){foreach($n in @('chrome','msedge','firefox')){$p=Get-Process -Name $n -EA 0|Where-Object{$_.MainWindowTitle -match 'YouTube'}|Select-Object -First 1;if($p){$r=[PSCustomObject]@{name=$p.ProcessName;title=$p.MainWindowTitle};break}}}`,
      `if($r){ConvertTo-Json -Compress ([PSCustomObject]@{name=$r.name;title=$r.title;paused=$paused})}else{Write-Output '{"active":false}'}`
    ].join(';');
    execFile(ps, ['-NonInteractive', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', cmd],
      { timeout: 5000, windowsHide: true },
      (err, stdout) => {
        if (err) { resolve({ active: false }); return; }
        const raw = stdout.trim();
        if (!raw) { resolve({ active: false }); return; }
        try {
          const obj = JSON.parse(raw);
          if (obj.active === false) { resolve({ active: false }); return; }
          if (obj.paused) { resolve({ active: true, isPlaying: false, paused: true }); return; }
          const parsed = parseTasklist(`"${obj.name}","","","","","","","","${obj.title}"`);
          if (parsed) { resolve(parsed); return; }
          // Title exists but didn't match a playing pattern — app open but paused (e.g. Spotify shows "Spotify")
          const KNOWN_MEDIA = ['spotify','tidal','vlc','foobar2000','itunes'];
          if (KNOWN_MEDIA.some(n => obj.name.toLowerCase().includes(n))) {
            resolve({ active: true, isPlaying: false, paused: true });
          } else {
            resolve({ active: false });
          }
        } catch { resolve({ active: false }); }
      }
    );
  }));

  // ── Album art lookup (iTunes Search API, no CORS in main process) ─
  ipcMain.handle('get-album-art', async (event, title, artist) => {
    try {
      const q = encodeURIComponent(`${title} ${artist}`);
      const json = await fetch(`https://itunes.apple.com/search?term=${q}&media=music&limit=1`).then(r => r.json());
      const artUrl = json?.results?.[0]?.artworkUrl100;
      if (!artUrl) return null;
      const highRes = artUrl.replace('100x100bb', '300x300bb');
      // Fetch image bytes and return as base64 data URL so canvas can read it (no CORS taint)
      const imgRes = await fetch(highRes);
      const arrayBuf = await imgRes.arrayBuffer();
      const b64 = Buffer.from(arrayBuf).toString('base64');
      const mime = imgRes.headers.get('content-type') || 'image/jpeg';
      return `data:${mime};base64,${b64}`;
    } catch (e) { console.error('[art] error:', e.message); return null; }
  });

  // Media keys via SendKeys VBScript — instant, no PS needed
  const VK = { playpause: 0xB3, next: 0xB0, prev: 0xB1 };
  ipcMain.handle('media-key', (event, key) => new Promise((resolve) => {
    if (!VK[key]) { resolve(false); return; }
    const vbs = `
      Dim WshShell : Set WshShell = CreateObject("WScript.Shell")
      WshShell.SendKeys Chr(${VK[key]})
    `;
    const tmp = path.join(os.tmpdir(), 'xtec_mediakey.vbs');
    try { fs.writeFileSync(tmp, vbs); } catch { resolve(false); return; }
    const cscript = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cscript.exe');
    execFile(cscript, ['//NoLogo', tmp], { windowsHide: true, timeout: 2000 }, () => resolve(true));
  }));

  ipcMain.handle('set-theme-source', (event, theme) => {
    nativeTheme.themeSource = theme;
  });

  ipcMain.handle('set-spellcheck-languages', (event, languages) => {
    try {
      // Validate that languages is an array of strings
      if (!Array.isArray(languages) || !languages.every(lang => typeof lang === 'string')) {
        console.error('Invalid languages parameter');
        return { success: false, error: 'Invalid languages parameter' };
      }
      session.defaultSession.setSpellCheckerLanguages(languages);
      return { success: true, languages };
    } catch (error) {
      console.error('Failed to set spell checker languages:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-spellcheck-languages', () => {
    try {
      const languages = session.defaultSession.getSpellCheckerLanguages();
      return { success: true, languages };
    } catch (error) {
      console.error('Failed to get spell checker languages:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-available-spellcheck-languages', () => {
    try {
      const languages = session.defaultSession.availableSpellCheckerLanguages;
      return { success: true, languages };
    } catch (error) {
      console.error('Failed to get available spell checker languages:', error);
      return { success: false, error: error.message };
    }
  });

  // Install React DevTools in dev mode only
  if (!app.isPackaged) {
    try {
      const { default: installExtension, REACT_DEVELOPER_TOOLS } = require('electron-devtools-installer');
      installExtension(REACT_DEVELOPER_TOOLS, { loadExtensionOptions: { allowFileAccess: true } })
        .then(name => console.log(`[devtools] Installed: ${name}`))
        .catch(err => console.warn('[devtools] Could not install React DevTools:', err.message));
    } catch (e) {
      console.warn('[devtools] electron-devtools-installer not available:', e.message);
    }
  }

  // Production-only: override CSP via session headers to drop unsafe-eval.
  // Only registered when packaged — never touches the Vite dev server.
  if (app.isPackaged) {
    const PROD_CSP = [
      "default-src 'none'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self' blob:",
      "frame-src blob:",
      "worker-src blob: 'self'",
      "object-src 'none'",
      "media-src 'none'",
      "base-uri 'self'",
      "form-action 'none'",
      "frame-ancestors 'none'",
      "manifest-src 'self'",
    ].join('; ');

    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...(details.responseHeaders ?? {}),
          'Content-Security-Policy': [PROD_CSP],
        },
      });
    });
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch(err => {
  console.error('Fatal error during app startup:', err);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});