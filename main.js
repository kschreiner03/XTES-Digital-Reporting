
const { app, BrowserWindow, ipcMain, dialog, Menu, shell, autoUpdater } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let mainWindow;
let helpWindow;

// --- Single Instance Lock ---
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      const filePath = commandLine.find(arg =>
        arg.endsWith('.dfr') || arg.endsWith('.spdfr') || arg.endsWith('.plog') || arg.endsWith('.clog') || arg.endsWith('.iogc')
      );
      if (filePath) {
        mainWindow.webContents.send('open-file-path', filePath);
      }
    }
  });
}

// --- Shortcut creation (Windows only) ---
const updateExe = path.resolve(path.dirname(process.execPath), '..', 'Update.exe');
const exeName = path.basename(process.execPath);

app.once('ready', () => {
  if (process.platform !== 'win32') return;

  try {
    const desktopShortcut = path.join(app.getPath('desktop'), 'X-TEC Digital Reporting.lnk');
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
    },
  });
  
  // Handle dev vs. production paths
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    const helpUrl = new URL('help.html', MAIN_WINDOW_VITE_DEV_SERVER_URL);
    helpWindow.loadURL(helpUrl.href);
  } else {
    helpWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/help.html`));
  }


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
            label: 'Download Photos',
            click: () => {
                if (mainWindow) {
                    mainWindow.webContents.send('download-photos');
                }
            },
            accelerator: 'CmdOrCtrl+D'
        },
        { type: 'separator' },
        process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' }
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
        }
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
            await shell.openExternal('https://forms.office.com/r/A0jqm6vHb6');
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
    },
  });

  mainWindow.maximize();
  mainWindow.show();
  // mainWindow.webContents.openDevTools();

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  // Basic context menu (cut, copy, paste)
  mainWindow.webContents.on('context-menu', (event, params) => {
    const menu = Menu.buildFromTemplate([
      { role: 'cut', enabled: params.editFlags.canCut },
      { role: 'copy', enabled: params.editFlags.canCopy },
      { role: 'paste', enabled: params.editFlags.canPaste },
      { type: 'separator' },
      { role: 'selectAll', enabled: params.editFlags.canSelectAll },
    ]);
    menu.popup({ window: mainWindow });
  });

  mainWindow.webContents.on('did-finish-load', () => {
    const filePath = process.argv.find(arg =>
      arg.endsWith('.dfr') || arg.endsWith('.spdfr') || arg.endsWith('.plog') || arg.endsWith('.clog') || arg.endsWith('.iogc')
    );
    if (filePath) {
      mainWindow.webContents.send('open-file-path', filePath);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
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
  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  // --- Auto-updater Logic ---
  const repoUrl = 'kschreiner03/XTES-Digital-Reporting';
  const server = 'https://update.electronjs.org';
  const feedUrl = `${server}/${repoUrl}/${process.platform}-${process.arch}/${app.getVersion()}`;

  try {
    autoUpdater.setFeedURL(feedUrl);
  } catch (error) {
    console.error('Failed to set auto-updater feed URL:', error);
  }

  // Check for updates shortly after startup, then every hour
  setTimeout(() => autoUpdater.checkForUpdates(), 5000);
  setInterval(() => autoUpdater.checkForUpdates(), 60 * 60 * 1000);

  // For the banner on the landing page
  autoUpdater.on('update-available', () => {
    if (mainWindow) {
      mainWindow.webContents.send('update-available');
    }
  });

  // For the dialog to restart the app
  autoUpdater.on('update-downloaded', (event, releaseNotes, releaseName) => {
    dialog.showMessageBox({
      type: 'info',
      buttons: ['Restart', 'Later'],
      title: 'Application Update',
      message: process.platform === 'win32' ? releaseNotes : releaseName,
      detail: 'A new version has been downloaded. Restart the application to apply the updates.'
    }).then(returnValue => {
      if (returnValue.response === 0) autoUpdater.quitAndInstall();
    });
  });

  autoUpdater.on('error', (error) => {
    console.error('There was a problem updating the application');
    console.error(error);
  });
  // --- End Auto-updater Logic ---

  ipcMain.handle('open-pdf', async (event, filename) => {
    if (!allowedPdfs.includes(filename)) {
        console.error('Requested PDF is not allowed:', filename);
        dialog.showErrorBox('Error', 'The requested file is not a valid example document.');
        return;
    }

    const assetsDir = app.isPackaged
        ? path.join(process.resourcesPath, 'assets')
        : path.join(app.getAppPath(), 'public', 'assets');
    
    const pdfPath = path.join(assetsDir, filename);

    try {
        await shell.openPath(pdfPath);
    } catch (err) {
        console.error(`Failed to open PDF: ${pdfPath}`, err);
        dialog.showErrorBox('Error', `Could not open the file: ${pdfPath}`);
    }
  });

  ipcMain.handle('get-asset-path', (event, filename) => {
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      return `${MAIN_WINDOW_VITE_DEV_SERVER_URL}/assets/${filename}`;
    } else {
      const assetPath = path.join(process.resourcesPath, 'assets', filename);
      return `file://${assetPath.replace(/\\/g, '/')}`;
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
      try {
        const data = fs.readFileSync(filePaths[0], 'utf-8');
        return data;
      } catch (err) {
        console.error('Failed to read project file:', err);
        return null;
      }
    }
    return null;
  });

  ipcMain.handle('read-file', async (event, filePath) => {
    try {
      const data = fs.readFileSync(filePath, 'utf-8');
      return { success: true, data, path: filePath };
    } catch (err) {
      console.error('Failed to read file:', err);
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

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
