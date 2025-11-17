const { app, autoUpdater, BrowserWindow, ipcMain, dialog, Menu, shell, Notification } = require('electron');
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
        arg.endsWith('.dfr') || arg.endsWith('.spdfr') || arg.endsWith('.plog') || arg.endsWith('.clog')
      );
      if (filePath) {
        mainWindow.webContents.send('open-file-path', filePath);
      }
    }
  });
}

// --- Squirrel Startup (Windows installer) ---
try {
  if (require('electron-squirrel-startup')) {
    app.quit();
  }
} catch (e) {
  console.log('No electron-squirrel-startup found, continuing...');
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
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

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
      arg.endsWith('.dfr') || arg.endsWith('.spdfr') || arg.endsWith('.plog') || arg.endsWith('.clog')
    );
    if (filePath) {
      mainWindow.webContents.send('open-file-path', filePath);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// --- Handle file operations ---
app.whenReady().then(() => {
  // --- Auto-update logic ---
  // Replaces the 'update-electron-app' package with a direct implementation
  // to avoid module resolution issues in the packaged app.
  try {
    const server = 'https://update.electronjs.org';
    // The repository details are from your package.json
    const repo = 'kschreiner03/XTES-Digital-Reporting';
    const feedURL = `${server}/${repo}/${process.platform}/${app.getVersion()}`;

    autoUpdater.setFeedURL({ url: feedURL });

    autoUpdater.on('update-available', () => {
        new Notification({
            title: 'Update Available',
            body: 'A new version is being downloaded in the background. You will be notified when it is ready to install.'
        }).show();
    });

    // Check for updates every hour
    setInterval(() => {
      autoUpdater.checkForUpdates();
    }, 60 * 60 * 1000);
    
    // Check for updates on startup as well
    autoUpdater.checkForUpdates();

    autoUpdater.on('update-downloaded', (event, releaseNotes, releaseName) => {
      const dialogOpts = {
        type: 'info',
        buttons: ['Restart', 'Later'],
        title: 'Application Update',
        message: releaseName || 'A new version is ready',
        detail: 'A new version has been downloaded. Restart the application to apply the updates.'
      };

      dialog.showMessageBox(dialogOpts).then((returnValue) => {
        if (returnValue.response === 0) autoUpdater.quitAndInstall();
      });
    });

    autoUpdater.on('error', (error) => {
      // Silently log errors. Don't bother the user.
      console.error('There was a problem updating the application');
      console.error(error);
    });
  } catch (error) {
    console.error('Error setting up auto-updater:', error.message);
  }

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  ipcMain.handle('save-project', async (event, data, defaultPath) => {
    const window = BrowserWindow.getFocusedWindow();
    let filters = [{ name: 'Project Files', extensions: ['json'] }];
    const ext = defaultPath ? path.extname(defaultPath).toLowerCase() : '';

    if (ext === '.spdfr') filters = [{ name: 'SaskPower DFR Project', extensions: ['spdfr'] }];
    else if (ext === '.dfr') filters = [{ name: 'X-TES DFR Project', extensions: ['dfr'] }];
    else if (ext === '.plog') filters = [{ name: 'X-TES Photo Log', extensions: ['plog'] }];
    else if (ext === '.clog') filters = [{ name: 'X-TES Combined Log', extensions: ['clog'] }];

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
    else if (fileType === 'clog') filters.push({ name: 'Combined Log Files', extensions: ['clog'] });
    else filters.push({ name: 'All Project Files', extensions: ['plog', 'dfr', 'spdfr', 'clog'] });

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
        { name: 'All Project Files', extensions: ['plog', 'dfr', 'spdfr', 'json', 'clog'] },
        { name: 'Photo Log Files', extensions: ['plog', 'clog'] },
        { name: 'DFR Files', extensions: ['dfr', 'spdfr'] },
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