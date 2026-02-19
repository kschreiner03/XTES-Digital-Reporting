"use strict";
const { app, BrowserWindow, ipcMain, dialog, Menu, shell, autoUpdater, nativeTheme, session } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
let mainWindow;
let helpWindow;
let forceClose = false;
let pendingUpdate = false;
const REPO_URL = process.env.GITHUB_REPOSITORY || "kschreiner03/XTES-Digital-Reporting";
const REPORT_ISSUE_URL = process.env.REPORT_ISSUE_URL || "https://forms.office.com/r/A0jqm6vHb6";
const ALLOWED_EXTENSIONS = [".dfr", ".spdfr", ".plog", ".clog", ".iogc", ".json"];
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      const filePath = commandLine.find(
        (arg) => ALLOWED_EXTENSIONS.some((ext) => arg.endsWith(ext))
      );
      if (filePath) {
        mainWindow.webContents.send("open-file-path", filePath);
      }
    }
  });
}
const updateExe = path.resolve(path.dirname(process.execPath), "..", "Update.exe");
const exeName = path.basename(process.execPath);
app.once("ready", () => {
  if (process.platform !== "win32") return;
  try {
    const desktopShortcut = path.join(app.getPath("desktop"), "X-TEC Digital Reporting.lnk");
    if (fs.existsSync(updateExe) && !fs.existsSync(desktopShortcut)) {
      console.log("Creating desktop/start menu shortcuts...");
      spawn(updateExe, ["--createShortcut", exeName], { detached: true });
    }
  } catch (err) {
    console.error("Failed to create shortcuts manually:", err);
  }
});
app.on("open-file", (event, filePath) => {
  event.preventDefault();
  const ext = path.extname(filePath).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) return;
  if (mainWindow) {
    mainWindow.webContents.send("open-file-path", filePath);
  } else {
    process.argv.push(filePath);
  }
});
function createHelpWindow() {
  if (helpWindow) {
    helpWindow.focus();
    return;
  }
  helpWindow = new BrowserWindow({
    width: 960,
    height: 720,
    title: "Help - X-TES Digital Reporting",
    webPreferences: {
      preload: path.join(__dirname, "help-preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
      // Enable sandbox for extra security
    }
  });
  {
    const helpUrl = new URL("help.html", "http://localhost:5173");
    helpWindow.loadURL(helpUrl.href);
  }
  helpWindow.webContents.setWindowOpenHandler(() => {
    return { action: "deny" };
  });
  helpWindow.on("closed", () => {
    helpWindow = null;
  });
}
const menuTemplate = [
  ...process.platform === "darwin" ? [
    {
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideothers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" }
      ]
    }
  ] : [],
  {
    label: "File",
    submenu: [
      {
        label: "Save Project",
        click: () => {
          if (mainWindow) {
            mainWindow.webContents.send("save-project-shortcut");
          }
        },
        accelerator: "CmdOrCtrl+S"
      },
      {
        label: "Export PDF",
        click: () => {
          if (mainWindow) {
            mainWindow.webContents.send("export-pdf-shortcut");
          }
        },
        accelerator: "CmdOrCtrl+E"
      },
      { type: "separator" },
      {
        label: "Download Photos",
        click: () => {
          if (mainWindow) {
            mainWindow.webContents.send("download-photos");
          }
        },
        accelerator: "CmdOrCtrl+D"
      },
      { type: "separator" },
      process.platform === "darwin" ? { role: "close" } : { role: "quit" }
    ]
  },
  {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "selectAll" }
    ]
  },
  {
    label: "Settings",
    submenu: [
      {
        label: "Preferences...",
        click: () => {
          if (mainWindow) {
            mainWindow.webContents.send("open-settings");
          }
        },
        accelerator: "CmdOrCtrl+,"
      }
    ]
  },
  {
    label: "Help",
    submenu: [
      {
        label: "How to Use",
        click: createHelpWindow
      },
      {
        label: "Report Issues",
        click: async () => {
          try {
            await shell.openExternal(REPORT_ISSUE_URL);
          } catch (err) {
            console.error("Failed to open issue form:", err);
            dialog.showErrorBox("Error", "Could not open the issue report form.");
          }
        }
      }
    ]
  }
];
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 960,
    show: false,
    // Start hidden to prevent flickering before maximize
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      // Cannot be fully sandboxed due to node:fs usage in main process handlers interacting with dialogs
      plugins: true,
      // Enable PDF viewer plugin
      spellcheck: true
      // Enable spell checking
    }
  });
  mainWindow.maximize();
  mainWindow.show();
  {
    mainWindow.loadURL("http://localhost:5173");
  }
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https:")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });
  mainWindow.webContents.on("context-menu", (event, params) => {
    const menuTemplate2 = [];
    if (params.misspelledWord) {
      params.dictionarySuggestions.slice(0, 5).forEach((suggestion) => {
        menuTemplate2.push({
          label: suggestion,
          click: () => mainWindow.webContents.replaceMisspelling(suggestion)
        });
      });
      if (menuTemplate2.length > 0) {
        menuTemplate2.push({ type: "separator" });
      }
      menuTemplate2.push({
        label: "Add to Dictionary",
        click: () => mainWindow.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
      });
      menuTemplate2.push({ type: "separator" });
    }
    menuTemplate2.push(
      { role: "cut", enabled: params.editFlags.canCut },
      { role: "copy", enabled: params.editFlags.canCopy },
      { role: "paste", enabled: params.editFlags.canPaste },
      { type: "separator" },
      { role: "selectAll", enabled: params.editFlags.canSelectAll }
    );
    const menu = Menu.buildFromTemplate(menuTemplate2);
    menu.popup({ window: mainWindow });
  });
  mainWindow.webContents.on("did-finish-load", () => {
    const filePath = process.argv.find(
      (arg) => ALLOWED_EXTENSIONS.some((ext) => arg.endsWith(ext))
    );
    if (filePath) {
      mainWindow.webContents.send("open-file-path", filePath);
    }
  });
  mainWindow.on("close", (e) => {
    if (!forceClose) {
      e.preventDefault();
      mainWindow.webContents.send("close-attempted");
    }
  });
  ipcMain.removeAllListeners("confirm-close");
  ipcMain.on("confirm-close", () => {
    forceClose = true;
    if (mainWindow) {
      mainWindow.destroy();
    }
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
    forceClose = false;
  });
}
const allowedPdfs = [
  "Example_DFR.pdf",
  "Example_DFR_Monitoring.pdf",
  "Example_DFR_NonCompliance.pdf",
  "Example_DFR_Herbicide.pdf",
  "Example_DFR_Construction.pdf",
  "Example_DFR_NestSweep.pdf"
];
app.whenReady().then(() => {
  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);
  session.defaultSession.setSpellCheckerLanguages(["en-US", "en-CA"]);
  session.defaultSession.setSpellCheckerEnabled(true);
  const server = "https://update.electronjs.org";
  const feedUrl = `${server}/${REPO_URL}/${process.platform}-${process.arch}/${app.getVersion()}`;
  try {
    autoUpdater.setFeedURL(feedUrl);
  } catch (error) {
    console.error("Failed to set auto-updater feed URL:", error);
  }
  setTimeout(() => autoUpdater.checkForUpdates(), 5e3);
  setInterval(() => autoUpdater.checkForUpdates(), 60 * 60 * 1e3);
  autoUpdater.on("update-available", () => {
    if (mainWindow) {
      mainWindow.webContents.send("update-available");
    }
  });
  autoUpdater.on("update-downloaded", () => {
    if (mainWindow) {
      mainWindow.webContents.send("update-downloaded");
    }
  });
  ipcMain.on("install-update-now", () => {
    forceClose = true;
    autoUpdater.quitAndInstall();
  });
  ipcMain.on("install-update-later", () => {
    pendingUpdate = true;
  });
  app.on("before-quit", () => {
    if (pendingUpdate) {
      autoUpdater.quitAndInstall();
    }
  });
  autoUpdater.on("error", (error) => {
    console.error("There was a problem updating the application");
    console.error(error);
  });
  ipcMain.handle("open-pdf", async (event, filename) => {
    if (!allowedPdfs.some((f) => f.toLowerCase() === filename.toLowerCase())) {
      console.error("Requested PDF is not allowed:", filename);
      dialog.showErrorBox("Error", "The requested file is not a valid example document.");
      return;
    }
    const assetsDir = app.isPackaged ? path.join(process.resourcesPath, "assets") : path.join(app.getAppPath(), "public", "assets");
    const pdfPath = path.normalize(path.join(assetsDir, filename));
    if (!pdfPath.startsWith(assetsDir)) {
      console.error("Path traversal attempt detected");
      return;
    }
    try {
      await shell.openPath(pdfPath);
    } catch (err) {
      console.error(`Failed to open PDF: ${pdfPath}`, err);
      dialog.showErrorBox("Error", `Could not open the file: ${pdfPath}`);
    }
  });
  ipcMain.handle("get-asset-path", (event, filename) => {
    if (filename.includes("..")) {
      return "";
    }
    const safeName = filename.replace(/\\/g, "/");
    const encodedName = safeName.split("/").map((s) => encodeURIComponent(s)).join("/");
    {
      return `${"http://localhost:5173"}/assets/${encodedName}`;
    }
  });
  ipcMain.handle("save-project", async (event, data, defaultPath) => {
    const window = BrowserWindow.getFocusedWindow();
    let filters = [{ name: "Project Files", extensions: ["json"] }];
    const ext = defaultPath ? path.extname(defaultPath).toLowerCase() : "";
    if (ext === ".spdfr") filters = [{ name: "SaskPower DFR Project", extensions: ["spdfr"] }];
    else if (ext === ".dfr") filters = [{ name: "X-TES DFR Project", extensions: ["dfr"] }];
    else if (ext === ".plog") filters = [{ name: "X-TES Photo Log", extensions: ["plog"] }];
    else if (ext === ".clog") filters = [{ name: "X-TES Combine Logs", extensions: ["clog"] }];
    else if (ext === ".iogc") filters = [{ name: "IOGC Audit File", extensions: ["iogc"] }];
    const { filePath } = await dialog.showSaveDialog(window, {
      title: "Save Project",
      defaultPath,
      filters
    });
    if (filePath) {
      try {
        fs.writeFileSync(filePath, data);
        return { success: true, path: filePath };
      } catch (err) {
        console.error("Failed to save project file:", err);
        return { success: false, error: err.message };
      }
    }
    return { success: false };
  });
  ipcMain.handle("load-project", async (event, fileType) => {
    const window = BrowserWindow.getFocusedWindow();
    let filters = [];
    if (fileType === "plog") filters.push({ name: "Photo Log Files", extensions: ["plog"] });
    else if (fileType === "dfr") filters.push({ name: "DFR Standard Files", extensions: ["dfr"] });
    else if (fileType === "spdfr") filters.push({ name: "SaskPower DFR Files", extensions: ["spdfr"] });
    else if (fileType === "clog") filters.push({ name: "Combine Logs Files", extensions: ["clog"] });
    else if (fileType === "iogc") filters.push({ name: "IOGC Audit Files", extensions: ["iogc"] });
    else filters.push({ name: "All Project Files", extensions: ["plog", "dfr", "spdfr", "clog", "iogc"] });
    filters.push({ name: "All Files", extensions: ["*"] });
    const { filePaths } = await dialog.showOpenDialog(window, {
      title: "Open Project",
      properties: ["openFile"],
      filters
    });
    if (filePaths && filePaths.length > 0) {
      try {
        const data = fs.readFileSync(filePaths[0], "utf-8");
        return data;
      } catch (err) {
        console.error("Failed to read project file:", err);
        return null;
      }
    }
    return null;
  });
  ipcMain.handle("read-file", async (event, filePath) => {
    if (!filePath || typeof filePath !== "string") return { success: false, error: "Invalid path" };
    const ext = path.extname(filePath).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      console.error(`Blocked attempt to read unauthorized file type: ${filePath}`);
      return { success: false, error: "Unauthorized file type." };
    }
    try {
      const data = fs.readFileSync(filePath, "utf-8");
      return { success: true, data, path: filePath };
    } catch (err) {
      console.error("Failed to read file:", err);
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle("save-pdf", async (event, data, defaultPath) => {
    const window = BrowserWindow.getFocusedWindow();
    const { filePath } = await dialog.showSaveDialog(window, {
      title: "Save PDF",
      defaultPath: defaultPath || "photolog.pdf",
      filters: [{ name: "PDF Files", extensions: ["pdf"] }]
    });
    if (filePath) {
      try {
        fs.writeFileSync(filePath, Buffer.from(data));
        return { success: true, path: filePath };
      } catch (err) {
        console.error("Failed to save PDF file:", err);
        return { success: false, error: err.message };
      }
    }
    return { success: false };
  });
  ipcMain.handle("save-zip-file", async (event, data, defaultPath) => {
    const window = BrowserWindow.getFocusedWindow();
    const { filePath } = await dialog.showSaveDialog(window, {
      title: "Save Photos As...",
      defaultPath,
      filters: [{ name: "Zip Files", extensions: ["zip"] }]
    });
    if (filePath) {
      try {
        fs.writeFileSync(filePath, Buffer.from(data));
        return { success: true, path: filePath };
      } catch (err) {
        console.error("Failed to save zip file:", err);
        return { success: false, error: err.message };
      }
    }
    return { success: false };
  });
  ipcMain.handle("load-multiple-projects", async (event) => {
    const window = BrowserWindow.getFocusedWindow();
    const { filePaths } = await dialog.showOpenDialog(window, {
      title: "Import Photos from Files",
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "All Project Files", extensions: ["plog", "dfr", "spdfr", "json", "clog", "iogc"] },
        { name: "Photo Log Files", extensions: ["plog", "clog"] },
        { name: "DFR Files", extensions: ["dfr", "spdfr"] },
        { name: "IOGC Files", extensions: ["iogc"] },
        { name: "JSON files", extensions: ["json"] },
        { name: "All Files", extensions: ["*"] }
      ]
    });
    if (filePaths && filePaths.length > 0) {
      try {
        const filesContent = filePaths.map((filePath) => {
          const ext = path.extname(filePath).toLowerCase();
          if (!ALLOWED_EXTENSIONS.includes(ext)) {
            throw new Error("Unauthorized file type selected");
          }
          return fs.readFileSync(filePath, "utf-8");
        });
        return { success: true, data: filesContent };
      } catch (err) {
        console.error("Failed to read project files:", err);
        return { success: false, error: err.message };
      }
    }
    return { success: false, data: [] };
  });
  ipcMain.handle("set-theme-source", (event, theme) => {
    nativeTheme.themeSource = theme;
  });
  ipcMain.handle("set-spellcheck-languages", (event, languages) => {
    try {
      if (!Array.isArray(languages) || !languages.every((lang) => typeof lang === "string")) {
        console.error("Invalid languages parameter");
        return { success: false, error: "Invalid languages parameter" };
      }
      session.defaultSession.setSpellCheckerLanguages(languages);
      return { success: true, languages };
    } catch (error) {
      console.error("Failed to set spell checker languages:", error);
      return { success: false, error: error.message };
    }
  });
  ipcMain.handle("get-spellcheck-languages", () => {
    try {
      const languages = session.defaultSession.getSpellCheckerLanguages();
      return { success: true, languages };
    } catch (error) {
      console.error("Failed to get spell checker languages:", error);
      return { success: false, error: error.message };
    }
  });
  ipcMain.handle("get-available-spellcheck-languages", () => {
    try {
      const languages = session.defaultSession.availableSpellCheckerLanguages;
      return { success: true, languages };
    } catch (error) {
      console.error("Failed to get available spell checker languages:", error);
      return { success: false, error: error.message };
    }
  });
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
