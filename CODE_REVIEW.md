# X-TES Digital Reporting - Complete Code Review & Architecture Guide

> **Version:** 1.1.4
> **Author:** X-Terra Environmental Services Ltd
> **Stack:** Electron + React 18 + TypeScript + Tailwind CSS + Vite + jsPDF
> **Last Updated:** February 2026

---

## Table of Contents

1. [High-Level Architecture](#1-high-level-architecture)
2. [Project File Structure](#2-project-file-structure)
3. [Dependencies & What They Do](#3-dependencies--what-they-do)
4. [Build Toolchain & Configuration](#4-build-toolchain--configuration)
5. [Electron Main Process (main.js)](#5-electron-main-process-mainjs)
6. [Preload Bridge (preload.js)](#6-preload-bridge-preloadjs)
7. [Renderer Entry Point (index.tsx, App.tsx)](#7-renderer-entry-point-indextsx-apptsx)
8. [Type System (types.ts)](#8-type-system-typests)
9. [Data Layer - IndexedDB (db.ts)](#9-data-layer---indexeddb-dbts)
10. [Theme System (ThemeContext.tsx)](#10-theme-system-themecontexttsx)
11. [Icon System (icons.tsx)](#11-icon-system-iconstsx)
12. [Landing Page (LandingPage.tsx)](#12-landing-page-landingpagetsx)
13. [Report Headers (Header.tsx, DfrHeader.tsx)](#13-report-headers-headertsx-dfrheadertsx)
14. [BulletPointEditor - The Core Text Editor](#14-bulletpointeditor---the-core-text-editor)
15. [Inline Comments System (CommentsRail.tsx)](#15-inline-comments-system-commentsrailtsx)
16. [Photo Entry System (PhotoEntry.tsx)](#16-photo-entry-system-photoentrytsx)
17. [DFR Standard Report (DfrStandard.tsx)](#17-dfr-standard-report-dfrstandardtsx)
18. [DFR SaskPower Report (DfrSaskpower.tsx)](#18-dfr-saskpower-report-dfrsaskpowertsx)
19. [Photo Log (PhotoLog.tsx)](#19-photo-log-photologtsx)
20. [Combined Log (CombinedLog.tsx)](#20-combined-log-combinedlogtsx)
21. [PDF Generation System](#21-pdf-generation-system)
22. [Photo Drag-and-Drop Reordering](#22-photo-drag-and-drop-reordering)
23. [Thumbnail Preview System](#23-thumbnail-preview-system)
24. [Settings Modal (SettingsModal.tsx)](#24-settings-modal-settingsmodaltsx)
25. [Utility Components](#25-utility-components)
26. [Data Flow Diagrams](#26-data-flow-diagrams)
27. [Security Measures](#27-security-measures)
28. [Key Patterns & Conventions](#28-key-patterns--conventions)

---

## 1. High-Level Architecture

This application is a **desktop Electron app** for creating environmental Daily Field Reports (DFRs) and Photographic Logs. It runs as a two-process Electron architecture:

```
+--------------------------------------------------+
|                ELECTRON MAIN PROCESS              |
|                    (main.js)                      |
|                                                   |
|  - Window management (BrowserWindow)              |
|  - Native file dialogs (save/open)                |
|  - Application menu (File, Edit, Settings, Help)  |
|  - Auto-updater (electron autoUpdater)            |
|  - Spell checker configuration                    |
|  - IPC message handlers                           |
|  - Single-instance lock                           |
+---------|-----------|----------------------------+
          |    IPC    |
          | (invoke/  |
          |  send/on) |
+---------|-----------|----------------------------+
|              PRELOAD BRIDGE                       |
|              (preload.js)                         |
|                                                   |
|  contextBridge.exposeInMainWorld("electronAPI")   |
|  - File operations (save, load, read)             |
|  - Menu event listeners                           |
|  - Theme control                                  |
|  - Spell check APIs                               |
|  - User info (OS username)                        |
|  - Window close intercept                         |
+---------|-----------|----------------------------+
          |           |
+---------|-----------|----------------------------+
|            RENDERER PROCESS (React)               |
|                                                   |
|  index.tsx -> ThemeProvider -> App.tsx             |
|                                                   |
|  App.tsx routes between:                          |
|    - LandingPage (home / project selector)        |
|    - DfrStandard (X-Terra DFR report)             |
|    - DfrSaskpower (SaskPower DFR report)          |
|    - PhotoLog (standalone photo log)              |
|    - CombinedLog (merge multiple logs)            |
|                                                   |
|  Data Storage:                                    |
|    - IndexedDB (images, projects, thumbnails)     |
|    - localStorage (recent projects, settings)     |
+--------------------------------------------------+
```

### How the Processes Communicate

The main process and renderer process **never talk directly**. All communication goes through the preload bridge using Electron's IPC (Inter-Process Communication):

```
Renderer                    Preload                     Main Process
---------                   --------                    ------------
window.electronAPI          contextBridge               ipcMain.handle()
  .saveProject(data) -----> ipcRenderer.invoke() -----> dialog.showSaveDialog()
                                                        fs.writeFileSync()
                            <--- result returned ---    return { success, path }
```

**Two IPC patterns are used:**

1. **`invoke`/`handle`** (request-response): Renderer asks main for something, main responds. Used for file operations.
2. **`send`/`on`** (one-way push): Main pushes events to renderer. Used for menu shortcuts, file-open events, window close.

---

## 2. Project File Structure

```
x-tec-digital-reporting/
|
|-- main.js                    # Electron main process (window, menus, IPC, auto-update)
|-- preload.js                 # IPC bridge between main and renderer
|-- help-preload.js            # Minimal preload for the help window
|
|-- index.html                 # HTML shell - just a <div id="root"> + script tag
|-- index.tsx                  # React entry point - renders <App> inside <ThemeProvider>
|-- index.css                  # Tailwind directives + base font family
|-- App.tsx                    # Root component - routes between LandingPage and reports
|-- types.ts                   # All TypeScript interfaces/types for the app
|
|-- components/
|   |-- LandingPage.tsx        # Home screen - project cards, recent projects list
|   |-- Header.tsx             # Simple header for PhotoLog/CombinedLog
|   |-- DfrHeader.tsx          # Extended header for DFR reports (monitor, env file)
|   |-- DfrStandard.tsx        # Full DFR Standard report component (~2300 lines)
|   |-- DfrSaskpower.tsx       # Full SaskPower DFR report component (~2200 lines)
|   |-- PhotoLog.tsx           # Standalone photo log component
|   |-- CombinedLog.tsx        # Merge multiple project photos into one log
|   |
|   |-- PhotoEntry.tsx         # Individual photo card (image + metadata fields)
|   |-- BulletPointEditor.tsx  # Rich text editor with highlights + inline comments
|   |-- CommentsRail.tsx       # Side panel showing all comments across fields
|   |-- SettingsModal.tsx      # App settings (spell check languages)
|   |-- ImageModal.tsx         # Fullscreen image viewer overlay
|   |
|   |-- db.ts                  # IndexedDB wrapper (images, projects, thumbnails)
|   |-- icons.tsx              # Lucide icon wrappers with consistent styling
|   |-- ThemeContext.tsx       # Dark mode context provider + hook
|   |-- pdfPhotoUtils.ts       # Shared PDF photo page generation
|   |-- pdfcanvaspreview.tsx   # PDF preview modal using pdfjs-dist
|   |-- thumbnailUtils.ts      # Canvas-based project thumbnail generator
|   |-- xterraLogo.tsx         # SVG logo component for PDF headers
|   |-- SafeImage.tsx          # Image component with error fallback
|   |-- ActionStatusModal.tsx  # Reusable success/error modal
|   |-- Assetimage.tsx         # Asset image loader (dev vs production paths)
|   |-- SpecialCharacterPalette.tsx  # Special character picker
|   |-- ProjectPreviewTooltip.tsx    # Hover tooltip showing project thumbnail
|   |
|   |-- useComments.ts         # (Unused) Hook for comment state management
|   |-- HighlightableTextarea.tsx    # (Unused) Standalone highlightable textarea
|   |-- HighlightableBulletPointEditor.tsx  # (Unused) Wrapper with highlight toolbar
|   |-- PageCommentsPanel.tsx  # (Unused) Alternative fixed-position comments panel
|
|-- src/types/
|   |-- global.d.ts            # TypeScript declarations for window.electronAPI
|
|-- public/
|   |-- help.html              # Help page content
|   |-- SOP.html               # Standard Operating Procedures page
|   |-- assets/                # Example PDF files for help page
|
|-- assets/                    # App icons, logos, installer resources
|
|-- forge.config.js            # Electron Forge packaging/build configuration
|-- tsconfig.json              # TypeScript compiler options
|-- tailwind.config.js         # Tailwind CSS configuration
|-- postcss.config.js          # PostCSS plugins (Tailwind, Autoprefixer)
|-- package.json               # Dependencies, scripts, app metadata
```

---

## 3. Dependencies & What They Do

### Runtime Dependencies (ship with the app)

| Package | Version | What It Does |
|---------|---------|-------------|
| `react` | ^18.2.0 | UI library - component-based rendering |
| `react-dom` | ^18.2.0 | React's DOM renderer |
| `jspdf` | ^4.0.0 | PDF generation in the browser - creates DFR and Photo Log PDFs |
| `jszip` | ^3.10.1 | Creates ZIP files for batch photo downloads |
| `pdfjs-dist` | ^5.4.449 | Mozilla's PDF viewer - renders PDF preview in-app |
| `lucide-react` | ^0.563.0 | Icon library - provides all UI icons (Plus, Trash, Camera, etc.) |
| `idb` | ^8.0.0 | Promise-based wrapper around IndexedDB browser storage |
| `exifr` | ^7.1.3 | Reads EXIF metadata from photos (orientation, GPS, date taken) |
| `image-clipper` | ^0.4.4 | Image cropping/manipulation utility |
| `@dnd-kit/core` | ^6.3.1 | Drag-and-drop framework (collision detection, drag events) |
| `@dnd-kit/sortable` | ^10.0.0 | Sortable list plugin for @dnd-kit |
| `@dnd-kit/utilities` | ^3.2.2 | CSS transform utilities for drag animations |

### Dev Dependencies (build tools only)

| Package | Version | What It Does |
|---------|---------|-------------|
| `electron` | ^40.0.0 | Desktop app runtime (Chromium + Node.js) |
| `@electron-forge/cli` | ^7.4.0 | Build tool for packaging Electron apps |
| `@electron-forge/maker-squirrel` | ^7.4.0 | Creates Windows .exe installer |
| `@electron-forge/maker-dmg` | ^7.4.0 | Creates macOS .dmg installer |
| `@electron-forge/maker-zip` | ^7.4.0 | Creates ZIP distributions |
| `@electron-forge/plugin-vite` | ^7.4.0 | Integrates Vite bundler with Electron Forge |
| `vite` | ^7.3.1 | Fast build tool & dev server |
| `@vitejs/plugin-react` | ^4.2.1 | Vite plugin for React JSX/Fast Refresh |
| `typescript` | ^5.2.2 | TypeScript compiler |
| `tailwindcss` | ^3.4.19 | Utility-first CSS framework |
| `postcss` | ^8.4.35 | CSS processing pipeline (required by Tailwind) |
| `autoprefixer` | ^10.4.17 | Auto-adds vendor prefixes to CSS |

### How Dependencies Connect

```
User clicks "Export PDF"
        |
        v
    jsPDF  -----> Creates PDF document in memory
        |            |
        |            +--> pdfPhotoUtils.ts layouts photos with text
        |            +--> xterraLogo.tsx provides SVG logo as base64
        |
        v
    preload.js (IPC) --> main.js --> fs.writeFileSync (saves to disk)

User uploads a photo
        |
        v
    exifr  -----> Reads EXIF orientation data
        |
        v
    Canvas API --> Auto-crops/rotates the image
        |
        v
    db.ts (idb) --> Stores base64 image in IndexedDB

User reorders photos
        |
        v
    @dnd-kit/core -----> Detects drag start/end
    @dnd-kit/sortable -> Provides useSortable hook per item
    @dnd-kit/utilities -> CSS.Transform for smooth animations
        |
        v
    arrayMove() -------> Reorders the array in React state
```

---

## 4. Build Toolchain & Configuration

### Build Pipeline

```
Source Files (.tsx, .ts, .css)
        |
        v
    Vite (bundler)
        |-- Uses @vitejs/plugin-react for JSX transform
        |-- Uses PostCSS pipeline:
        |       PostCSS --> Tailwind CSS --> Autoprefixer
        |
        v
    TypeScript Compiler (tsc)
        |-- tsconfig.json: target ES2022, JSX react-jsx
        |-- noEmit: true (Vite handles actual compilation)
        |-- Module resolution: "bundler"
        |
        v
    Electron Forge
        |-- forge.config.js configures:
        |       - plugin-vite (3 build entries: main.js, preload.js, help-preload.js)
        |       - 1 renderer: main_window (the React app)
        |       - maker-squirrel (Windows .exe installer)
        |       - File associations (.dfr, .spdfr, .plog, .clog)
        |
        v
    Output:
        dev: Vite dev server (hot reload)
        build: dist/ folder with bundled HTML/JS/CSS
        make: out/ folder with platform-specific installer
```

### NPM Scripts

```json
"dev": "vite"                    // Start Vite dev server (web-only, no Electron)
"start": "electron-forge start"  // Start Electron app in development mode
"build": "tsc && vite build"     // Type-check then bundle for production
"make": "electron-forge make"    // Package into installable .exe
```

### TypeScript Configuration (tsconfig.json)

```json
{
  "compilerOptions": {
    "target": "ES2022",              // Modern JS features (top-level await, etc.)
    "module": "ESNext",              // ES module syntax (import/export)
    "jsx": "react-jsx",             // Automatic JSX transform (no React import needed)
    "moduleResolution": "bundler",   // Let Vite handle module resolution
    "noEmit": true,                  // Only type-check, Vite does the actual build
    "allowJs": true,                 // Allow .js files (main.js, preload.js)
    "isolatedModules": true,         // Each file must be independently compilable
    "paths": { "@/*": ["./*"] }      // @ alias maps to project root
  },
  "include": ["src", "index.tsx"]
}
```

### Tailwind Configuration (tailwind.config.js)

```js
module.exports = {
  content: [
    "./index.html",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',                  // Toggle dark mode via CSS class on <html>
  theme: {
    extend: {
      colors: {
        'xterra-teal': '#007D8C',     // Brand color used throughout
      }
    },
  },
}
```

**How dark mode works:** The `ThemeProvider` adds/removes the `dark` class on `<html>`. Tailwind's `dark:` variant prefix activates when this class is present. Example: `bg-white dark:bg-gray-800`.

---

## 5. Electron Main Process (main.js)

This is the "backend" of the app - it runs in Node.js with full system access.

### Window Management

```js
// Single instance lock - prevents opening multiple copies
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();  // Second instance quits immediately
}

// Main window creation
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 960,
    show: false,                    // Hidden until maximized (prevents flash)
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,       // Security: renderer can't use Node.js
      contextIsolation: true,       // Security: separate JS contexts
      sandbox: false,               // Needed for fs operations
      plugins: true,                // PDF viewer plugin
      spellcheck: true,             // Built-in spell checking
    },
  });
  mainWindow.maximize();
  mainWindow.show();
}
```

### Application Menu

The menu is built from a template array with 4 top-level items:

```
File                    Edit              Settings          Help
|-- Save (Ctrl+S)      |-- Undo          |-- Preferences   |-- How to Use
|-- Export PDF (Ctrl+E) |-- Redo          |   (Ctrl+,)      |-- Report Issues
|-- Download Photos     |-- Cut/Copy/                          (opens web form)
|   (Ctrl+D)           |   Paste/
|-- Quit               |   Select All
```

Each menu item sends an IPC message to the renderer:

```js
// Menu click sends message to React app
{ label: 'Save Project', accelerator: 'CmdOrCtrl+S',
  click: () => mainWindow.webContents.send('save-project-shortcut') }
```

### IPC Handlers (File Operations)

All file operations go through IPC. Here's the flow for each:

**Save Project:**

```
Renderer: window.electronAPI.saveProject(jsonString, "project.dfr")
  --> preload: ipcRenderer.invoke("save-project", data, defaultPath)
    --> main: ipcMain.handle("save-project", ...)
      1. Determine file filter from extension (.dfr, .spdfr, .plog, .clog)
      2. Show native Save dialog (dialog.showSaveDialog)
      3. Write file with fs.writeFileSync(filePath, data)
      4. Return { success: true, path: filePath }
```

**Load Project:**

```
Renderer: window.electronAPI.loadProject("dfr")
  --> preload: ipcRenderer.invoke("load-project", fileType)
    --> main: ipcMain.handle("load-project", ...)
      1. Build file filter array from fileType
      2. Show native Open dialog (dialog.showOpenDialog)
      3. Read file with fs.readFileSync(filePaths[0], 'utf-8')
      4. Return the raw JSON string
```

**Save PDF:**

```
Renderer: window.electronAPI.savePdf(arrayBuffer, "report.pdf")
  --> preload: ipcRenderer.invoke("save-pdf", data, defaultPath)
    --> main: ipcMain.handle("save-pdf", ...)
      1. Show native Save dialog
      2. Write binary with fs.writeFileSync(filePath, Buffer.from(data))
      3. Return { success: true, path: filePath }
```

### Window Close Intercept (Unsaved Changes Protection)

```js
// main.js: Intercept the close event
mainWindow.on('close', (e) => {
  if (!forceClose) {
    e.preventDefault();                          // Block the close
    mainWindow.webContents.send('close-attempted'); // Ask renderer
  }
});

// When renderer confirms it's OK to close:
ipcMain.on('confirm-close', () => {
  forceClose = true;
  mainWindow.destroy();  // Force-destroy (bypass close event)
});
```

The renderer decides whether to show an "unsaved changes" modal or immediately confirm.

### Auto-Updater

```js
const feedUrl = `https://update.electronjs.org/${REPO_URL}/${process.platform}-${process.arch}/${app.getVersion()}`;
autoUpdater.setFeedURL(feedUrl);

// Check for updates 5 seconds after startup, then every hour
setTimeout(() => autoUpdater.checkForUpdates(), 5000);
setInterval(() => autoUpdater.checkForUpdates(), 60 * 60 * 1000);

// When update is available, tell the renderer (shows a banner)
autoUpdater.on('update-available', () => {
  mainWindow.webContents.send('update-available');
});

// When downloaded, show restart dialog
autoUpdater.on('update-downloaded', () => {
  dialog.showMessageBox({
    buttons: ['Restart', 'Later'],
    title: 'Application Update',
    detail: 'A new version has been downloaded...'
  }).then(result => {
    if (result.response === 0) autoUpdater.quitAndInstall();
  });
});
```

### Context Menu with Spell Check

```js
mainWindow.webContents.on('context-menu', (event, params) => {
  const menuTemplate = [];

  // If there's a misspelled word, show suggestions at the top
  if (params.misspelledWord) {
    params.dictionarySuggestions.slice(0, 5).forEach(suggestion => {
      menuTemplate.push({
        label: suggestion,
        click: () => mainWindow.webContents.replaceMisspelling(suggestion)
      });
    });
    menuTemplate.push({
      label: 'Add to Dictionary',
      click: () => session.addWordToSpellCheckerDictionary(params.misspelledWord)
    });
  }

  // Standard Cut/Copy/Paste/Select All
  menuTemplate.push(
    { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
  );

  Menu.buildFromTemplate(menuTemplate).popup({ window: mainWindow });
});
```

---

## 6. Preload Bridge (preload.js)

The preload script is the **security boundary**. It runs in a privileged context and selectively exposes APIs to the renderer.

```js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // FILE OPERATIONS (invoke = request/response)
  saveProject: (data, path) => ipcRenderer.invoke("save-project", data, path),
  loadProject: (type) => ipcRenderer.invoke("load-project", type),
  savePdf: (data, path) => ipcRenderer.invoke("save-pdf", data, path),
  readFile: (path) => ipcRenderer.invoke("read-file", path),
  saveZipFile: (data, path) => ipcRenderer.invoke("save-zip-file", data, path),
  loadMultipleProjects: () => ipcRenderer.invoke("load-multiple-projects"),

  // MENU EVENTS (on = one-way from main)
  onSaveProjectShortcut: (cb) => ipcRenderer.on("save-project-shortcut", cb),
  onExportPdfShortcut: (cb) => ipcRenderer.on("export-pdf-shortcut", cb),
  onOpenFile: (cb) => ipcRenderer.on("open-file-path", (_, path) => cb(path)),
  onOpenSettings: (cb) => ipcRenderer.on("open-settings", cb),
  onDownloadPhotos: (cb) => ipcRenderer.on("download-photos", cb),
  onUpdateAvailable: (cb) => ipcRenderer.on("update-available", cb),

  // WINDOW CLOSE INTERCEPT
  onCloseAttempted: (cb) => ipcRenderer.on("close-attempted", cb),
  confirmClose: () => ipcRenderer.send("confirm-close"),

  // CLEANUP (remove listeners to prevent leaks)
  removeAllDownloadPhotosListeners: () => ipcRenderer.removeAllListeners("download-photos"),
  removeSaveProjectShortcutListener: () => ipcRenderer.removeAllListeners("save-project-shortcut"),
  // ... etc

  // THEME
  setThemeSource: (theme) => ipcRenderer.invoke("set-theme-source", theme),

  // SPELL CHECK
  setSpellCheckLanguages: (langs) => ipcRenderer.invoke("set-spellcheck-languages", langs),
  getSpellCheckLanguages: () => ipcRenderer.invoke("get-spellcheck-languages"),
  getAvailableSpellCheckLanguages: () => ipcRenderer.invoke("get-available-spellcheck-languages"),

  // USER INFO (synchronous - reads from OS)
  getUserInfo: () => {
    const info = require("os").userInfo();
    return { username: info.username, homedir: info.homedir };
  },
});
```

### Why this pattern matters

The renderer (React app) runs **untrusted web content**. By only exposing specific functions through `contextBridge`, the app prevents the renderer from directly accessing Node.js, the filesystem, or Electron internals.

---

## 7. Renderer Entry Point (index.tsx, App.tsx)

### index.tsx - Bootstrap

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';                        // Tailwind directives
import { ThemeProvider } from './components/ThemeContext';

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <ThemeProvider>    {/* Provides isDarkMode + toggleTheme to entire app */}
        <App />
    </ThemeProvider>
  </React.StrictMode>
);
```

### App.tsx - The Router

The app doesn't use React Router. Instead, `App.tsx` manages a simple `selectedApp` state that determines which component to render:

```tsx
const App: React.FC = () => {
    const [selectedApp, setSelectedApp] = useState<AppType | null>(null);
    const [projectToOpen, setProjectToOpen] = useState<any>(null);

    // null = show LandingPage, otherwise show the selected report
    return (
        <>
            {!selectedApp ? (
                <LandingPage
                    onSelectApp={handleSelectApp}     // User clicks "New DFR"
                    onOpenProject={handleOpenProject}  // User clicks recent project
                />
            ) : (
                // Switch to the selected report component
                selectedApp === 'dfrStandard' ? <DfrStandard onBack={handleBackToHome} initialData={projectToOpen} />
                : selectedApp === 'dfrSaskpower' ? <DfrSaskpower onBack={handleBackToHome} initialData={projectToOpen} />
                : selectedApp === 'photoLog' ? <PhotoLog onBack={handleBackToHome} initialData={projectToOpen} />
                : selectedApp === 'combinedLog' ? <CombinedLog onBack={handleBackToHome} initialData={projectToOpen} />
                : <LandingPage ... />
            )}
        </>
    );
};
```

**AppType** is a union type: `'photoLog' | 'dfrSaskpower' | 'dfrStandard' | 'combinedLog' | 'iogcLeaseAudit'`

### File Association Handling

When a user double-clicks a `.dfr` file in Windows Explorer:

```tsx
// App.tsx registers a listener on mount
useEffect(() => {
    window.electronAPI.onOpenFile(async (filePath) => {
        const result = await window.electronAPI.readFile(filePath);
        if (result.success) {
            const projectData = JSON.parse(result.data);
            const ext = filePath.split('.').pop();
            // Map extension to app type
            let type = ext === 'dfr' ? 'dfrStandard'
                     : ext === 'spdfr' ? 'dfrSaskpower'
                     : ext === 'plog' ? 'photoLog'
                     : ext === 'clog' ? 'combinedLog' : null;

            setProjectToOpen(projectData);
            setSelectedApp(type);  // Navigate to that report component
        }
    });
}, []);
```

### Window Close on Landing Page

When no report is open (user is on landing page), close the window immediately without the unsaved changes dialog:

```tsx
useEffect(() => {
    if (!selectedApp) {
        window.electronAPI.onCloseAttempted(() => {
            window.electronAPI.confirmClose();  // Immediately allow close
        });
    }
}, [selectedApp]);
```

---

## 8. Type System (types.ts)

All data structures are defined in a single file. Here's every interface:

### HeaderData (base for all reports)

```typescript
interface HeaderData {
    proponent: string;      // Company name (e.g., "SaskPower")
    projectName: string;    // Project title
    location: string;       // e.g., "NE-25-42-18 W3M"
    date: string;           // Date string
    projectNumber: string;  // X-Terra project number
}
```

### DfrHeaderData (extends HeaderData for DFR reports)

```typescript
interface DfrHeaderData extends HeaderData {
    monitor: string;        // Environmental monitor name
    envFile?: string;       // Legacy: old env file field
    envFileType: string;    // e.g., "MOE FILE #" or "ENV FILE #"
    envFileValue: string;   // The actual file number
}
```

### LocationActivity (location-specific activity blocks)

```typescript
interface LocationActivity {
    id: number;              // Unique ID within the report
    location: string;        // Location name (e.g., "Structure #1")
    activities: string;      // Detailed timestamped activities (bullet points)
    comment?: string;        // Simple yellow sticky-note comment
    highlights?: {
        activities?: TextHighlight[];  // Color highlights on text
    };
    inlineComments?: {
        activities?: TextComment[];    // Anchored inline comments
    };
}
```

### TextHighlight and TextComment (annotation types)

```typescript
interface TextHighlight {
    start: number;   // Character index where highlight starts
    end: number;     // Character index where highlight ends
    color: string;   // Hex color, e.g., '#FFFF00' (yellow)
}

interface TextComment {
    id: string;              // Unique ID (uuid-like)
    start: number;           // Anchor start in text
    end: number;             // Anchor end in text
    text: string;            // Comment body
    suggestedText?: string;  // Optional text suggestion
    author: string;          // Windows username (NEVER overwritten on load)
    timestamp: Date;         // When comment was created
    resolved: boolean;       // Whether comment is resolved
    replies?: CommentReply[];// Nested replies
}

interface CommentReply {
    id: string;
    text: string;
    author: string;          // Preserved across save/load
    timestamp: Date;
}
```

### PhotoData

```typescript
interface PhotoData {
    id: number;              // Unique photo ID
    photoNumber: string;     // Display number ("1", "2", etc.)
    date: string;            // Photo date
    location: string;        // Photo location
    description: string;     // Photo description text
    imageUrl: string | null; // Base64 data URL of the image
    imageFile?: File;        // (Transient) Raw file object
    imageId?: string;        // IndexedDB key for the stored image
    direction?: string;      // Cardinal direction (N, S, E, W, etc.)
    isMap?: boolean;         // Whether this is a map image (not a photo)
}
```

### DfrStandardBodyData (full DFR Standard report body)

```typescript
interface DfrStandardBodyData {
    generalActivity: string;
    locationActivities: LocationActivity[];
    communication: string;
    weatherAndGroundConditions: string;
    environmentalProtection: string;
    wildlifeObservations: string;
    furtherRestoration: string;
    comments?: { [key: string]: string };  // Simple per-field comments

    // Migration fields (old format compatibility)
    activityBlocks?: ActivityBlock[];
    projectActivities?: string;

    // Not exported to PDF:
    highlights?: {
        generalActivity?: TextHighlight[];
        communication?: TextHighlight[];
        // ... one entry per body field
    };
    inlineComments?: {
        generalActivity?: TextComment[];
        communication?: TextComment[];
        // ... one entry per body field
    };
}
```

### DfrSaskpowerData (SaskPower-specific fields)

```typescript
interface DfrSaskpowerData {
    // Header fields (flat, not using DfrHeaderData)
    proponent: string;
    date: string;
    location: string;
    projectName: string;
    vendorAndForeman: string;
    projectNumber: string;
    environmentalMonitor: string;
    envFileNumber: string;

    // Body fields
    generalActivity: string;
    locationActivities: LocationActivity[];
    totalHoursWorked: string;

    // SaskPower-specific checklist
    completedTailgate: ChecklistOption;  // 'Yes' | 'No' | 'NA' | ''
    reviewedTailgate: ChecklistOption;
    reviewedPermits: ChecklistOption;

    equipmentOnsite: string;
    weatherAndGroundConditions: string;
    environmentalProtection: string;
    wildlifeObservations: string;
    futureMonitoring: string;

    // Same highlights/inlineComments pattern as DfrStandard
    highlights?: { ... };
    inlineComments?: { ... };
}
```

---

## 9. Data Layer - IndexedDB (db.ts)

The app uses **IndexedDB** (via the `idb` wrapper library) for persistent browser storage. This survives page reloads and app restarts, unlike `localStorage` which has a 5MB limit.

### Database Schema

```
Database: "XtecProjectsDB" (version 3)
|
|-- Object Store: "images"
|   Key: string (unique image ID, e.g., "img_1706123456789")
|   Value: string (base64 data URL of the image)
|
|-- Object Store: "projects"  (added in version 2)
|   Key: number (timestamp - e.g., 1706123456789)
|   Value: object (full project JSON - header, body, photos)
|
|-- Object Store: "thumbnails" (added in version 3)
|   Key: number (same timestamp as projects)
|   Value: string (base64 JPEG thumbnail, 200x140px)
```

### Version Upgrades

```typescript
const initDB = () => {
  dbPromise = openDB('XtecProjectsDB', 3, {
    upgrade(db, oldVersion) {
      // Version 1: Create images store
      if (!db.objectStoreNames.contains('images')) {
        db.createObjectStore('images');
      }
      // Version 2: Add projects store
      if (oldVersion < 2) {
        db.createObjectStore('projects');
      }
      // Version 3: Add thumbnails store
      if (oldVersion < 3) {
        db.createObjectStore('thumbnails');
      }
    },
  });
};
```

### API Functions

```typescript
// Images
storeImage(id: string, imageData: string): Promise<void>
retrieveImage(id: string): Promise<string | undefined>
deleteImage(id: string): Promise<void>

// Projects
storeProject(id: number, projectData: object): Promise<void>
retrieveProject(id: number): Promise<any | undefined>
deleteProject(id: number): Promise<void>

// Thumbnails
storeThumbnail(id: number, thumbnailData: string): Promise<void>
retrieveThumbnail(id: number): Promise<string | undefined>
deleteThumbnail(id: number): Promise<void>
getAllThumbnails(): Promise<Map<number, string>>  // Bulk load for prefetching

// Maintenance
clearDatabase(): Promise<void>  // Clears all three stores
```

### How Images Are Stored

Photos are stored as base64 data URLs in IndexedDB separately from the project JSON. This prevents the project save file from becoming enormous:

```
Save Flow:
1. User drops image on PhotoEntry
2. Image is read as base64 data URL
3. Image is stored in photosData state (imageUrl = base64 string)
4. When saving to file (Ctrl+S), images are included in the JSON
5. When saving to IndexedDB (recent project), images go to the "images" store
   with separate keys, and project JSON only stores the image IDs

Load Flow:
1. User clicks recent project in LandingPage
2. retrieveProject(timestamp) loads the project JSON from IndexedDB
3. For each photo with an imageId, retrieveImage(imageId) fetches the base64
4. Images are restored into the photosData array
```

---

## 10. Theme System (ThemeContext.tsx)

Dark mode is implemented using React Context + Tailwind's `class` strategy.

```tsx
const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isDarkMode, setIsDarkMode] = useState(() => {
        // Priority: 1. localStorage setting, 2. System preference
        if (localStorage.getItem('xtec_theme') === 'dark') return true;
        if (!localStorage.getItem('xtec_theme') &&
            window.matchMedia('(prefers-color-scheme: dark)').matches) return true;
        return false;
    });

    useEffect(() => {
        // Apply the dark class to <html>
        if (isDarkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
        localStorage.setItem('xtec_theme', isDarkMode ? 'dark' : 'light');

        // Also tell Electron's native theme system
        window.electronAPI?.setThemeSource(isDarkMode ? 'dark' : 'light');
    }, [isDarkMode]);

    return (
        <ThemeContext.Provider value={{ isDarkMode, toggleTheme: () => setIsDarkMode(p => !p) }}>
            {children}
        </ThemeContext.Provider>
    );
};

// Used in components:
const { isDarkMode, toggleTheme } = useTheme();
```

Every component uses Tailwind's `dark:` prefix for dark mode styling:

```html
<div className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
```

---

## 11. Icon System (icons.tsx)

All icons come from `lucide-react` and are wrapped with consistent styling:

```tsx
import { Plus, Trash2, Camera, ArrowUp, ... } from "lucide-react";

// Each icon is a thin wrapper that sets strokeWidth to 1.25 for consistency
export const PlusIcon = (p: any) => <Plus strokeWidth={1.25} {...p} />;
export const TrashIcon = (p: any) => <X strokeWidth={1.25} {...p} />;  // Uses X icon
export const CameraIcon = (p: any) => <Camera strokeWidth={1.25} color="#007D8C" {...p} />;
export const SaveIcon = (p: any) => <Save strokeWidth={1.25} color="#ffffffff" {...p} />;
export const GripVerticalIcon = (p: any) => <GripVertical strokeWidth={1.25} {...p} />;
// ... 20+ icon exports total
```

The brand color `#007D8C` (X-Terra teal) is hardcoded on several icons.

---

## 12. Landing Page (LandingPage.tsx)

The home screen has three sections:

### 1. App Selection Cards

Four clickable cards for creating new reports:

- **Daily Field Report** (dfrStandard) - StandardDfrIcon (teal clipboard)
- **SaskPower DFR** (dfrSaskpower) - SaskPowerIcon (orange lightning bolt)
- **Photographic Log** (photoLog) - CameraIcon (teal camera)
- **Combine Logs** (combinedLog) - DocumentDuplicateIcon

### 2. Recent Projects List

```tsx
// Stored in localStorage (not IndexedDB)
const RECENT_PROJECTS_KEY = 'xtec_recent_projects';
const MAX_RECENT_PROJECTS = 5;

interface RecentProject {
    type: AppType;        // Which report type
    name: string;         // Project name
    projectNumber: string;// Project number
    timestamp: number;    // Used as the unique ID / IndexedDB key
}
```

Each recent project shows:

- Type badge (icon + color-coded label)
- Project name and number
- Hover thumbnail preview (from IndexedDB thumbnails store)
- Right-click context menu: Open, Remove from list, Delete permanently

### 3. Search & Filtering

```tsx
const [searchTerm, setSearchTerm] = useState('');

const filteredProjects = useMemo(() =>
    recentProjects.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.projectNumber.toLowerCase().includes(searchTerm.toLowerCase())
    ), [recentProjects, searchTerm]
);
```

### Thumbnail Hover Preview

```tsx
// Prefetch all thumbnails on mount
useEffect(() => {
    getAllThumbnails().then(thumbMap => setThumbnails(thumbMap));
}, []);

// 150ms debounce on hover (prevents flickering)
const handleMouseEnter = (timestamp: number) => {
    hoverTimeoutRef.current = setTimeout(() => {
        setHoveredTimestamp(timestamp);
    }, 150);
};
```

---

## 13. Report Headers (Header.tsx, DfrHeader.tsx)

### Header.tsx (PhotoLog / CombinedLog)

A simpler header with 5 fields:

```
| Proponent | Project Name | Location | Date | Project Number |
```

Each is an editable `<input>` with validation borders (red when empty).

### DfrHeader.tsx (DFR Standard / SaskPower)

Extended header with additional fields:

```
| Proponent | Project Name | Location | Date | Project Number |
| Monitor   | Env File Type (dropdown) | Env File Number     |
```

The env file type is a `<select>` dropdown:

```tsx
<select value={data.envFileType} onChange={...}>
    <option value="MOE FILE #">MOE FILE #</option>
    <option value="ENV FILE #">ENV FILE #</option>
    <option value="AEP FILE #">AEP FILE #</option>
    <option value="AER FILE #">AER FILE #</option>
</select>
```

Both headers accept `isInvalid` props and show red borders on empty required fields.

---

## 14. BulletPointEditor - The Core Text Editor

This is the most complex component (~600 lines). It provides a textarea with three overlay layers for annotations. It is the backbone of every text field in DFR reports.

### Architecture

```
+-----------------------------------------------+
|  Three-Dot Menu (...)                          |
|  - Highlight Selected (color picker)           |
|  - Clear All Highlights                        |
|  - Add Comment...                              |
|  - Resolve All Comments                        |
+-----------------------------------------------+
|                                                 |
|  [Highlight Background Layer]  (z-index: 1)    |
|  Colored rectangles behind highlighted text     |
|  Built by buildHighlightedContent() which       |
|  sorts highlights by start position and creates |
|  segments of {text, color} pairs                |
|                                                 |
|  [Selection Layer]             (z-index: 2)    |
|  Shows current text selection with a faint      |
|  background so the user can see what's selected |
|  even though the textarea has no visible bg     |
|                                                 |
|  [Comment Underline Layer]     (z-index: 3)    |
|  Colored underlines with glow-on-hover effect   |
|  Built by buildCommentedContent() which uses    |
|  breakpoint-based segmentation for overlapping  |
|  comments. Each underline has a data-comment-id |
|  attribute for scroll-to-comment targeting.     |
|                                                 |
|  [Textarea]                    (z-index: 4)    |
|  Actual editable text (transparent background)  |
|  Has auto-expanding height (adjustHeight)       |
|  Supports bullet-point auto-formatting          |
|                                                 |
+-----------------------------------------------+
```

### Props Interface

```typescript
interface BulletPointEditorProps {
    label: string;                    // Field label text (shown above editor)
    fieldId: string;                  // Unique ID (e.g., "generalActivity" or "locationActivity_3")
                                      // Used for comment anchoring and anchor position reporting
    value: string;                    // Current text value (controlled component)
    onChange: (value: string) => void; // Called on every keystroke / text change
    rows?: number;                    // Initial textarea rows (default: 3), but auto-expands
    placeholder?: string;             // Placeholder text shown when empty
    isInvalid?: boolean;              // When true, shows a red border (validation failed)
    highlights?: TextHighlight[];     // Array of {start, end, color} ranges to highlight
    onHighlightsChange?: (h: TextHighlight[]) => void;  // Called when highlights are added/removed
                                      // If undefined, the highlight UI is hidden entirely
    inlineComments?: TextComment[];   // Array of text-anchored comments
    onInlineCommentsChange?: (c: TextComment[]) => void; // Called when comments change
                                      // If undefined, the comment UI is hidden entirely
    onAnchorPositionsChange?: (a: CommentAnchorPosition[]) => void;
                                      // Reports viewport-relative positions of comment underlines
                                      // Used by CommentsRail to align comment cards
    hoveredCommentId?: string | null; // When set, the corresponding underline gets a glow effect
                                      // Syncs bidirectionally with CommentsRail hover
}
```

### Internal State

```typescript
const textareaRef = useRef<HTMLTextAreaElement>(null);       // Direct access to the textarea DOM
const containerRef = useRef<HTMLDivElement>(null);            // The outer wrapper div
const underlineRefs = useRef<Map<string, HTMLSpanElement>>(); // Map of commentId -> underline span
const commentInputRef = useRef<HTMLInputElement>(null);       // "Add comment" text input

const [selection, setSelection] = useState({ start: 0, end: 0 }); // Current text selection range
const [newCommentText, setNewCommentText] = useState('');     // Text being typed in comment input
const [currentUsername] = useState(() => getCurrentUsername()); // OS username, set ONCE on mount
// ^^ useState initializer runs only once - prevents re-reading username on every render

const [localHoveredCommentId, setLocalHoveredCommentId] = useState<string | null>(null);
// ^^ Hover from mousing over underlines in THIS editor (vs hoveredCommentId from CommentsRail)

const [darkMode, setDarkMode] = useState(false);  // Tracked independently from ThemeContext
// because this component uses a MutationObserver on the <html> class to detect theme changes
// rather than importing useTheme (keeps it self-contained)

const [showMenu, setShowMenu] = useState(false);           // Whether the "..." dropdown is open
const [showCommentInput, setShowCommentInput] = useState(false); // Whether the comment text input is shown

// Merge external hover (CommentsRail) with local hover (underline mouseover)
// Either source can trigger the glow effect on the underline
const activeHoveredCommentId = hoveredCommentId || localHoveredCommentId;
```

### Comment Color System

Each comment gets a unique color based on its index in the comments array. There are 8 colors that cycle:

```typescript
// Light mode underline/background colors - subtle pastels
const commentColorsLight = [
    '#E3F2FD', // Light Blue      (comment 0, 8, 16, ...)
    '#E8F5E9', // Light Green     (comment 1, 9, 17, ...)
    '#FFF3E0', // Light Orange    (comment 2, 10, 18, ...)
    '#FCE4EC', // Light Pink      (comment 3, 11, 19, ...)
    '#F3E5F5', // Light Purple    (comment 4, 12, 20, ...)
    '#E0F2F1', // Light Teal      (comment 5, 13, 21, ...)
    '#FFF9C4', // Light Yellow    (comment 6, 14, 22, ...)
    '#FFEBEE', // Light Red       (comment 7, 15, 23, ...)
];

// Dark mode versions - semi-transparent with alpha 0.2
const commentColorsDark = [
    'rgba(33, 150, 243, 0.2)',   // Blue
    'rgba(76, 175, 80, 0.2)',    // Green
    // ... etc
];

// Border colors (solid, used for the underline itself)
const commentBorderColors = [
    '#2196F3', '#4CAF50', '#FF9800', '#E91E63',
    '#9C27B0', '#009688', '#FFC107', '#F44336',
];

// Color lookup: finds the comment's index in the array, then % 8
const getCommentColor = (commentId: string): string => {
    const index = inlineComments.findIndex(c => c.id === commentId);
    const colors = darkMode ? commentColorsDark : commentColorsLight;
    return colors[index % colors.length];  // Cycles through 8 colors
};
```

### Bullet Point Auto-Formatting (handleKeyDown)

The editor automatically formats text as bullet-point lists. Here's exactly what happens on each key:

```typescript
const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget;
    const { selectionStart, selectionEnd, value: text } = textarea;

    // Find the boundaries of the current line
    const lineStartIndex = text.lastIndexOf('\n', selectionStart - 1) + 1;
    let lineEndIndex = text.indexOf('\n', selectionStart);
    if (lineEndIndex === -1) lineEndIndex = text.length;
    const currentLine = text.substring(lineStartIndex, lineEndIndex);

    if (e.key === 'Tab') {
        e.preventDefault(); // Don't move focus away from textarea

        if (e.shiftKey) {
            // SHIFT+TAB: Remove 2 spaces of indentation from line start
            // "    - Item" becomes "  - Item"
            if (currentLine.startsWith('  ')) {
                const newText = text.substring(0, lineStartIndex) + text.substring(lineStartIndex + 2);
                onChange(newText);
                // Move cursor back 2 positions to match the removed indent
                setTimeout(() => {
                    textarea.selectionStart = Math.max(lineStartIndex, selectionStart - 2);
                    textarea.selectionEnd = Math.max(lineStartIndex, selectionEnd - 2);
                }, 0);
            }
        } else {
            // TAB: Add 2 spaces of indentation at line start
            // "- Item" becomes "  - Item"
            const newText = text.substring(0, lineStartIndex) + '  ' + text.substring(lineStartIndex);
            onChange(newText);
            setTimeout(() => {
                textarea.selectionStart = selectionStart + 2;
                textarea.selectionEnd = selectionEnd + 2;
            }, 0);
        }

    } else if (e.key === 'Enter') {
        e.preventDefault(); // We handle the newline ourselves

        // Detect the current indentation level
        const indentMatch = currentLine.match(/^\s*/);  // Match leading whitespace
        const currentIndent = indentMatch ? indentMatch[0] : '';

        if (currentLine.trim() === '-') {
            // SPECIAL CASE: The line is JUST a bullet point with no text
            // This means the user pressed Enter on an empty bullet

            if (currentIndent.length >= 2) {
                // If indented, outdent one level (remove 2 spaces)
                // "    -" becomes "  - " (ready for typing at lower indent)
                const newIndent = currentIndent.substring(0, currentIndent.length - 2);
                const newText = text.substring(0, lineStartIndex) + newIndent + '- '
                              + text.substring(lineEndIndex);
                onChange(newText);
            } else {
                // If at root level, remove the empty bullet entirely
                // "- " (empty bullet) is deleted, leaving a blank line
                const newText = text.substring(0, lineStartIndex) + text.substring(lineEndIndex);
                onChange(newText);
            }
        } else {
            // NORMAL CASE: Insert a new line with the same indent + bullet
            // "  - Current item|" becomes:
            // "  - Current item"
            // "  - |"  (cursor here, same indent level)
            const newLine = '\n' + currentIndent + '- ';
            const newText = text.substring(0, selectionStart) + newLine
                          + text.substring(selectionEnd);
            onChange(newText);
            setTimeout(() => {
                textarea.selectionStart = textarea.selectionEnd = selectionStart + newLine.length;
            }, 0);
        }
    }
};

// When the textarea first gets focus and is empty, auto-insert the first bullet
const handleFocus = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    if (e.currentTarget.value.trim() === '') {
        onChange('- ');  // Start with a bullet point ready to type
    }
};
```

### How Highlights Work (Detailed)

1. User selects text in the textarea
2. Clicks "..." menu -> "Highlight Selected"
3. A color picker appears with 5 preset colors (yellow, green, blue, pink, orange)
4. On color click, a new `TextHighlight` is created with the selection's `{start, end, color}`
5. The highlight layer renders colored `<span>` elements behind the text
6. Overlapping highlights merge their visual representation

```typescript
// Step 1: User clicks a color swatch in the dropdown
const applyHighlight = (color: string) => {
    // Only works if text is actually selected and the parent component accepts highlights
    if (selection.start !== selection.end && onHighlightsChange) {
        const newHighlight: TextHighlight = {
            start: selection.start,  // Character index where highlight begins
            end: selection.end,      // Character index where highlight ends
            color,                   // Hex color e.g., '#FFFF00' for yellow
        };
        // Append to existing highlights - they're additive, never replace each other
        const updatedHighlights = [...highlights, newHighlight];
        onHighlightsChange(updatedHighlights);
    }
};

// Step 2: Build visual segments for the highlight overlay layer
const buildHighlightedContent = () => {
    if (!highlights || highlights.length === 0) {
        return [{ text: value, highlight: null }];  // No highlights, just plain text
    }

    const segments: Array<{ text: string; highlight: string | null }> = [];
    let lastIndex = 0;

    // Sort highlights by start position so we process left-to-right
    const sortedHighlights = [...highlights].sort((a, b) => a.start - b.start);

    sortedHighlights.forEach((h) => {
        // Add any unhighlighted text BEFORE this highlight
        if (h.start > lastIndex) {
            segments.push({ text: value.substring(lastIndex, h.start), highlight: null });
        }
        // Add the highlighted text
        segments.push({ text: value.substring(h.start, h.end), highlight: h.color });
        lastIndex = h.end;
    });

    // Add any remaining unhighlighted text after the last highlight
    if (lastIndex < value.length) {
        segments.push({ text: value.substring(lastIndex), highlight: null });
    }

    return segments;
    // Result example: [
    //   { text: "Hello ", highlight: null },
    //   { text: "world", highlight: "#FFFF00" },   <-- yellow highlight
    //   { text: " how are you", highlight: null }
    // ]
};
```

### How Inline Comments Work (Detailed)

1. User selects text, clicks "..." -> "Add comment..."
2. A small input appears below the toolbar
3. User types comment text and presses Enter
4. A `TextComment` is created with `{id, start, end, text, author, timestamp, resolved: false}`
5. The comment underline layer draws a colored bottom-border under the anchored text
6. The comment appears in the CommentsRail sidebar

```typescript
// Step 1: Creating a comment (called when user presses Enter in comment input)
const addComment = (text: string) => {
    // Guard: need text, a selection, and a handler
    if (!text.trim() || selection.start === selection.end || !onInlineCommentsChange) return;

    // Safety: clamp selection to valid range (prevents crashes if text was edited
    // between selecting and clicking "Add comment")
    const clampedStart = Math.max(0, Math.min(selection.start, value.length));
    const clampedEnd = Math.max(0, Math.min(selection.end, value.length));
    if (clampedStart >= clampedEnd) return;

    const newComment: TextComment = {
        // ID format: "comment_1706123456789_a3b8f2c1k"
        // Combines timestamp (uniqueness) + random string (collision avoidance)
        id: `comment_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
        start: clampedStart,        // Where the underline begins in the text
        end: clampedEnd,            // Where the underline ends in the text
        text: text.trim(),          // The actual comment body
        author: currentUsername,    // Windows login username (from preload.js getUserInfo())
        // ^^^ CRITICAL: Only set for NEW comments. When loading from a saved file,
        // the stored author must be preserved - never overwrite it with the current user.
        timestamp: new Date(),
        resolved: false,            // Starts unresolved (visible underline)
    };

    // Defensive: ensure inlineComments is actually an array
    const currentComments = Array.isArray(inlineComments) ? inlineComments : [];
    const updatedComments = [...currentComments, newComment];
    onInlineCommentsChange(updatedComments);  // Bubble up to parent component
    setNewCommentText('');                     // Clear the input
    setSelection({ start: 0, end: 0 });       // Clear the selection
};

// Step 2: Building comment underline segments (breakpoint-based algorithm)
// This handles OVERLAPPING comments correctly by splitting text into micro-segments
const buildCommentedContent = () => {
    // Only show underlines for active (unresolved, valid) comments
    const activeComments = (inlineComments || []).filter(c =>
        c && !c.resolved && c.id &&
        typeof c.start === 'number' && typeof c.end === 'number' &&
        c.start >= 0 && c.end >= c.start
    );

    if (activeComments.length === 0) {
        return [{ text: value, commentId: null, commentIds: [] }];
    }

    // BREAKPOINT ALGORITHM: Collect all start/end positions from all comments
    // Example: Comment A spans [5, 15], Comment B spans [10, 20]
    // Breakpoints: {0, 5, 10, 15, 20, value.length}
    const breakpoints = new Set<number>([0, value.length]);
    activeComments.forEach(comment => {
        const clampedStart = Math.max(0, Math.min(comment.start, value.length));
        const clampedEnd = Math.max(0, Math.min(comment.end, value.length));
        if (clampedStart < clampedEnd) {
            breakpoints.add(clampedStart);
            breakpoints.add(clampedEnd);
        }
    });

    const sortedBreakpoints = Array.from(breakpoints).sort((a, b) => a - b);

    // Build segments between consecutive breakpoints
    // Each segment knows which comments apply to it
    const segments = [];
    for (let i = 0; i < sortedBreakpoints.length - 1; i++) {
        const start = sortedBreakpoints[i];
        const end = sortedBreakpoints[i + 1];
        const text = value.substring(start, end);

        // Which comments cover this segment?
        const applicableComments = activeComments.filter(comment => {
            const cStart = Math.max(0, Math.min(comment.start, value.length));
            const cEnd = Math.max(0, Math.min(comment.end, value.length));
            return cStart <= start && cEnd >= end;
        });

        segments.push({
            text,
            commentId: applicableComments.length > 0 ? applicableComments[0].id : null,
            commentIds: applicableComments.map(c => c.id),
        });
    }

    return segments;
    // Result for overlapping comments A [5,15] and B [10,20]:
    // [0-5]:   no comment
    // [5-10]:  comment A only
    // [10-15]: comment A AND B (overlap zone - uses A's color)
    // [15-20]: comment B only
    // [20-end]: no comment
};
```

### Anchor Position Reporting (Detailed)

Each `BulletPointEditor` reports the screen positions of its comment underlines so the `CommentsRail` can align comment cards next to them. This runs on every scroll/resize using `requestAnimationFrame`:

```typescript
useEffect(() => {
    if (!onAnchorPositionsChange || !fieldId) return;

    const reportPositions = () => {
        try {
            const anchors: CommentAnchorPosition[] = [];

            // For each unresolved comment, find its underline span in the DOM
            inlineComments.forEach(comment => {
                if (!comment || !comment.id || comment.resolved) return;

                // underlineRefs is a Map<string, HTMLSpanElement> that stores refs to
                // each comment's underline <span> element (set during render)
                const underlineEl = underlineRefs.current.get(comment.id);
                if (underlineEl) {
                    // getBoundingClientRect() returns VIEWPORT-RELATIVE coordinates
                    // This is critical - using document-relative would cause drift on scroll
                    const rect = underlineEl.getBoundingClientRect();
                    anchors.push({
                        fieldId,                // Which field this comment belongs to
                        commentId: comment.id,  // Which specific comment
                        top: rect.top,          // Viewport Y position of the underline
                        left: rect.right,       // Viewport X position (right edge)
                        height: rect.height,    // Height of the underline element
                    });
                }
            });

            onAnchorPositionsChange(anchors);  // Report to parent (DfrStandard/DfrSaskpower)
        } catch (error) {
            console.error('Error reporting anchor positions:', error);
        }
    };

    // Use requestAnimationFrame to debounce rapid scroll/resize events
    // This prevents excessive recalculations and keeps the UI smooth
    let rafId: number | null = null;
    const handleUpdate = () => {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(reportPositions);
    };

    // Listen for scroll events on ANY element (capture phase catches nested scrollable containers)
    window.addEventListener('scroll', handleUpdate, { capture: true, passive: true });
    window.addEventListener('resize', handleUpdate, { passive: true });

    // Also observe the container itself for layout changes (e.g., text added, textarea resized)
    const resizeObserver = new ResizeObserver(handleUpdate);
    if (containerRef.current) {
        resizeObserver.observe(containerRef.current);
    }

    // Initial position report on mount
    reportPositions();

    // Cleanup all listeners on unmount
    return () => {
        window.removeEventListener('scroll', handleUpdate, { capture: true });
        window.removeEventListener('resize', handleUpdate);
        resizeObserver.disconnect();
        if (rafId) cancelAnimationFrame(rafId);
    };
}, [fieldId, inlineComments, onAnchorPositionsChange]);
```

### Dark Mode Detection

The BulletPointEditor detects dark mode independently using a `MutationObserver` instead of importing `useTheme()`. This keeps the component self-contained:

```typescript
useEffect(() => {
    const checkDarkMode = () => {
        // Check if the <html> element has the 'dark' class (set by ThemeProvider)
        return document.documentElement.classList.contains('dark') ||
               window.matchMedia('(prefers-color-scheme: dark)').matches;
    };

    const updateTheme = () => setDarkMode(checkDarkMode());
    updateTheme(); // Initial check

    // Watch for class changes on <html> (when ThemeProvider toggles 'dark')
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],  // Only trigger when class attribute changes
    });

    // Also watch for OS-level theme changes (e.g., Windows switching to dark mode)
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', updateTheme);

    return () => {
        observer.disconnect();
        mediaQuery.removeEventListener('change', updateTheme);
    };
}, []);
```

### Auto-Expanding Textarea Height

```typescript
// Called on every text change via useEffect
const adjustHeight = () => {
    if (textareaRef.current) {
        // Step 1: Reset to 'auto' so scrollHeight recalculates based on content
        textareaRef.current.style.height = 'auto';
        // Step 2: Set height to scrollHeight (the full content height)
        // This makes the textarea grow/shrink with content - no scrollbar ever appears
        textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
};

useEffect(() => {
    adjustHeight();
}, [value]); // Re-run whenever the text value changes
```

---

## 15. Inline Comments System (CommentsRail.tsx)

The `CommentsRail` is a side panel that displays all comments from all fields in a filterable list.

### Component Structure

```
+---CommentsRail (sticky sidebar)--+
| [All] [Open] [Resolved]  tabs   |
|                                   |
| +-Comment Card (general act.)--+ |
| | Author avatar + name          | |
| | "Field: General Activity"     | |
| | Comment text...                | |
| | [Reply] [Resolve] [Delete]    | |
| | [Find in text]                 | |
| |                                | |
| | Reply 1: "I agree..."         | |
| | Reply 2: "Fixed."             | |
| +-------------------------------+ |
|                                   |
| +-Comment Card (location #1)---+ |
| | ...                            | |
| +-------------------------------+ |
+-----------------------------------+
```

### Key Interfaces

```typescript
interface FieldComment extends TextComment {
    fieldId: string;       // e.g., "generalActivity" or "locationActivity_1"
    fieldLabel: string;    // e.g., "General Activity" or "Location: Structure #1"
}

interface CommentsRailProps {
    comments: FieldComment[];          // All comments across all fields
    anchors: Map<string, CommentAnchor>; // Screen positions for alignment
    isCollapsed: boolean;
    onDeleteComment: (fieldId, commentId) => void;
    onResolveComment: (fieldId, commentId) => void;
    onUpdateComment: (fieldId, commentId, newText) => void;
    onAddReply?: (fieldId, commentId, replyText) => void;
    onDeleteReply?: (fieldId, commentId, replyId) => void;
    onHoverComment?: (commentId: string | null) => void;
    onFocusComment?: (fieldId, commentId) => void;
    contentShiftAmount: number;  // Pixels to shift main content when rail opens
    railWidth: number;           // Width of the rail in pixels
}
```

### Filter Tabs

```typescript
const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('all');

const filteredComments = useMemo(() => {
    switch (filter) {
        case 'open': return comments.filter(c => !c.resolved);
        case 'resolved': return comments.filter(c => c.resolved);
        default: return comments;
    }
}, [comments, filter]);
```

### Bidirectional Hover Sync

When you hover a comment card in the rail, the corresponding underline in the text editor glows. And vice versa:

```
CommentsRail                          BulletPointEditor
  onMouseEnter(card) ---> setHoveredCommentId ---> hoveredCommentId prop
                                                        |
                                                        v
                                              Underline gets glow effect
                                              (box-shadow, color change)
```

---

## 16. Photo Entry System (PhotoEntry.tsx)

Each photo is rendered as a card with metadata fields on the left and an image upload zone on the right.

### Layout

```
+--PhotoEntry Card-------------------------------------------+
|                                                             |
|  LEFT COLUMN (1/3)           RIGHT COLUMN (2/3)            |
|  +-------------------+      +-------------------------+    |
|  | [Grip] Photo 1 [X]|      |                         |    |
|  |                    |      |                         |    |
|  | Direction: N       |      |    [Photo Image]        |    |
|  | Date: 2024-01-15   |      |    (drag-to-upload)     |    |
|  |   [copy from header]|     |                         |    |
|  | Location: NE-25    |      |    [Expand button]      |    |
|  |   [copy from header]|     |                         |    |
|  | Description:       |      +-------------------------+    |
|  |   Textarea...      |                                     |
|  +-------------------+                                     |
+-------------------------------------------------------------+
```

### Drag-and-Drop Reordering

Each `PhotoEntry` uses `@dnd-kit/sortable`:

```tsx
const {
    attributes,    // ARIA attributes for accessibility
    listeners,     // Mouse/touch event handlers for drag detection
    setNodeRef,    // Ref to attach to the draggable element
    transform,     // Current x/y offset during drag
    transition,    // CSS transition for smooth animation
    isDragging,    // Whether this item is currently being dragged
} = useSortable({ id: data.id, disabled: printable });

// Apply transform as inline style
const sortableStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
};

// The grip handle triggers the drag
<button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
    <GripVerticalIcon className="h-6 w-6" />
</button>
```

### Image Upload

The image zone supports both click-to-upload and drag-to-upload:

```tsx
<div
    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
    onDragLeave={() => setIsDragging(false)}
    onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files?.length) onImageChange(e.dataTransfer.files[0]);
    }}
>
    {/* Invisible file input covers the entire drop zone */}
    <input type="file" accept="image/*" onChange={handleFileChange}
           className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer" />

    {/* Show image or placeholder */}
    {data.imageUrl ? (
        <img src={data.imageUrl} className="absolute inset-0 w-full h-full object-contain" />
    ) : (
        <div className="flex flex-col items-center justify-center">
            <CameraIcon className="h-20 w-20" />
            <p>Click or drag to upload an image</p>
        </div>
    )}
</div>
```

### Copy-from-Header Buttons

The Date and Location fields have small buttons that copy values from the report header:

```tsx
<button onClick={() => headerDate && onDataChange("date", headerDate)}>
    ⎙  {/* Copy symbol */}
</button>
```

---

## 17. DFR Standard Report (DfrStandard.tsx)

This is the largest component (~2300 lines). It manages the entire DFR Standard report lifecycle.

### State Variables

```typescript
// Core data
const [headerData, setHeaderData] = useState<DfrHeaderData>({...});
const [bodyData, setBodyData] = useState<DfrStandardBodyData>({...});
const [photosData, setPhotosData] = useState<PhotoData[]>([]);

// UI state
const [errors, setErrors] = useState(new Set<string>());
const [showValidationErrorModal, setShowValidationErrorModal] = useState(false);
const [enlargedImageUrl, setEnlargedImageUrl] = useState<string | null>(null);
const [pdfPreview, setPdfPreview] = useState<{url, filename, blob} | null>(null);
const [zoomLevel, setZoomLevel] = useState(100);
const [isDirty, setIsDirty] = useState(false);
const [showUnsavedModal, setShowUnsavedModal] = useState(false);

// Comments system
const [commentsCollapsed, setCommentsCollapsed] = useState(false);
const [commentAnchors, setCommentAnchors] = useState<Map<string, CommentAnchor>>(new Map());
const [hoveredCommentId, setHoveredCommentId] = useState<string | null>(null);
```

### Unsaved Changes Protection

```typescript
// Track if anything has changed since last save
const [isDirty, setIsDirty] = useState(false);

// Every data change sets isDirty = true
const handleBodyChange = (field, value) => {
    setBodyData(prev => ({...prev, [field]: value}));
    setIsDirty(true);
};

// Window close intercept
useEffect(() => {
    const api = window.electronAPI;
    api.onCloseAttempted(() => {
        if (isDirty) {
            pendingCloseRef.current = true;
            setShowUnsavedModal(true);  // Show "Unsaved changes" dialog
        } else {
            api.confirmClose();          // Allow close immediately
        }
    });
}, [isDirty]);
```

### LocationBlockEntry Sub-Component

Each location activity block is rendered by an inline component:

```tsx
const LocationBlockEntry = ({ data, onDataChange, onInlineCommentsChange,
    onHighlightsChange, onAnchorPositionsChange, hoveredCommentId,
    onRemove, onMove, isFirst, isLast }) => {

    return (
        <div className="p-4 border rounded-md">
            <h3>Location Specific Activity</h3>
            {/* Yellow sticky-note toggle */}
            <button onClick={() => setIsCommentOpen(!isCommentOpen)}>
                <ChatBubbleLeftIcon />
            </button>
            {/* Move up/down and delete buttons */}
            <button onClick={() => onMove(data.id, 'up')}>↑</button>
            <button onClick={() => onMove(data.id, 'down')}>↓</button>
            <button onClick={() => onRemove(data.id)}>✕</button>

            {/* Location name field */}
            <EditableField label="Location" value={data.location} onChange={...} />

            {/* Activities with full inline comments support */}
            <BulletPointEditor
                fieldId={`locationActivity_${data.id}`}
                value={data.activities}
                highlights={data.highlights?.activities}
                inlineComments={data.inlineComments?.activities}
                onHighlightsChange={h => onHighlightsChange(data.id, h)}
                onInlineCommentsChange={c => onInlineCommentsChange(data.id, c)}
                onAnchorPositionsChange={a => onAnchorPositionsChange(fieldId, a)}
                hoveredCommentId={hoveredCommentId}
            />
        </div>
    );
};
```

### Comment System Integration

The DFR Standard aggregates comments from both body fields AND location activities:

```typescript
// Helper: detect if a fieldId belongs to a location activity
const getLocationActivityId = (fieldId: string): number | null => {
    const match = fieldId.match(/^locationActivity_(\d+)$/);
    return match ? parseInt(match[1], 10) : null;
};

// Unified handler that routes to the correct data structure
const setFieldComments = (fieldId, updater) => {
    const locId = getLocationActivityId(fieldId);
    if (locId !== null) {
        // Update comments on the LocationActivity object
        setBodyData(prev => ({
            ...prev,
            locationActivities: prev.locationActivities.map(block =>
                block.id === locId
                    ? { ...block, inlineComments: {
                        ...block.inlineComments,
                        activities: updater(block.inlineComments?.activities || [])
                      }}
                    : block
            )
        }));
    } else {
        // Update comments on bodyData.inlineComments
        setBodyData(prev => ({
            ...prev,
            inlineComments: { ...prev.inlineComments, [fieldId]: updater(...) },
        }));
    }
};

// All comment actions use this unified handler
const handleDeleteComment = (fieldId, commentId) => {
    setFieldComments(fieldId, comments => comments.filter(c => c.id !== commentId));
};
```

### Body Fields (6 total)

Each body field is a `BulletPointEditor` with full inline comments wired:

```tsx
<BulletPointEditor
    label=""
    fieldId="generalActivity"
    value={bodyData.generalActivity}
    highlights={bodyData.highlights?.generalActivity}
    inlineComments={bodyData.inlineComments?.generalActivity}
    onChange={handleGeneralActivityChange}
    onHighlightsChange={h => handleHighlightsChange('generalActivity', h)}
    onInlineCommentsChange={c => handleInlineCommentsChange('generalActivity', c)}
    onAnchorPositionsChange={a => handleAnchorPositionsChange('generalActivity', a)}
    hoveredCommentId={hoveredCommentId}
    placeholder={dfrPlaceholders.body.generalActivity}
    isInvalid={errors.has('generalActivity')}
/>
```

The six fields are:

1. **General Activity** - Main timestamped activity description
2. **Communication** - Communications and meetings
3. **Weather & Ground Conditions** - Environmental conditions
4. **Environmental Protection** - Protection measures taken
5. **Wildlife Observations** - Any wildlife noted
6. **Further Restoration** - Restoration activities needed

### Save Flow (addRecentProject)

```typescript
const addRecentProject = async (): Promise<void> => {
    const timestamp = initialData?.timestamp || Date.now();

    // 1. Build the project data object
    const projectData = { headerData, bodyData, photosData };

    // 2. Store in IndexedDB
    await storeProject(timestamp, projectData);

    // 3. Generate and store thumbnail
    try {
        const firstPhoto = photosData.find(p => p.imageUrl && !p.isMap);
        const thumbnail = await generateProjectThumbnail({
            type: 'dfrStandard',
            projectName: headerData.projectName,
            firstPhotoUrl: firstPhoto?.imageUrl || null,
        });
        await storeThumbnail(timestamp, thumbnail);
    } catch (e) {
        console.warn('Failed to generate thumbnail:', e);
    }

    // 4. Update localStorage recent projects list
    const recentProjects = JSON.parse(localStorage.getItem(RECENT_PROJECTS_KEY) || '[]');
    const updated = [
        { type: 'dfrStandard', name: headerData.projectName,
          projectNumber: headerData.projectNumber, timestamp },
        ...recentProjects.filter(p => p.timestamp !== timestamp)
    ].slice(0, MAX_RECENT_PROJECTS);
    localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(updated));

    // 5. Clean up old projects beyond the limit
    const removed = recentProjects.filter(p => !updated.find(u => u.timestamp === p.timestamp));
    for (const old of removed) {
        await deleteProject(old.timestamp);
        await deleteThumbnail(old.timestamp);
    }

    setIsDirty(false);
};
```

### Load Flow (parseAndLoadProject)

```typescript
const parseAndLoadProject = async (fileContent: string) => {
    const projectData = JSON.parse(fileContent);
    const { headerData: loadedHeader, bodyData: loadedBody,
            textData: loadedText, photosData: loadedPhotos } = projectData;

    // Migration: Convert old format (textData) to new format (bodyData)
    if (loadedText && !loadedBody) {
        // Old format had flat textData with projectActivities
        finalBodyData = {
            generalActivity: loadedText.projectActivities || '',
            locationActivities: [],
            communication: loadedText.communication || '',
            // ... map all fields
        };
        migrationOccurred = true;
    }

    // Migration: Convert activityBlocks to generalActivity + locationActivities
    if (loadedBody.activityBlocks?.length > 0) {
        const generalBlocks = loadedBody.activityBlocks.filter(b => b.type === 'general');
        const locationBlocks = loadedBody.activityBlocks.filter(b => b.type === 'location');
        // Merge general blocks into generalActivity text
        // Convert location blocks to LocationActivity objects
    }

    setHeaderData(loadedHeader);
    setBodyData(finalBodyData);
    setPhotosData(loadedPhotos);
};
```

### Validation

```typescript
const validateReport = (): boolean => {
    const newErrors = new Set<string>();

    // Required header fields
    if (!headerData.proponent.trim()) newErrors.add('proponent');
    if (!headerData.projectName.trim()) newErrors.add('projectName');
    if (!headerData.location.trim()) newErrors.add('location');
    if (!headerData.date.trim()) newErrors.add('date');

    // Required body field
    if (!bodyData.generalActivity.trim()) newErrors.add('generalActivity');

    setErrors(newErrors);
    return newErrors.size === 0;
};
```

### Keyboard Shortcuts

```typescript
useEffect(() => {
    const api = window.electronAPI;

    api.onSaveProjectShortcut(() => {
        addRecentProject();  // Ctrl+S -> Save
    });

    api.onExportPdfShortcut(() => {
        handleDownloadPdf();  // Ctrl+E -> Export PDF
    });

    return () => {
        api.removeSaveProjectShortcutListener();
        api.removeExportPdfShortcutListener();
    };
}, [headerData, bodyData, photosData]);
```

---

## 18. DFR SaskPower Report (DfrSaskpower.tsx)

Very similar structure to DfrStandard (~2100 lines) but with SaskPower-specific fields, a checklist section, and a different PDF layout.

### State — All Variables

```typescript
const DfrSaskpower = ({ onBack, initialData }): ReactElement => {
    // --- Core Data (single flat object, NOT separate header/body) ---
    const [data, setData] = useState<DfrSaskpowerData>({
        proponent: 'SaskPower',         // Pre-filled — SaskPower is always the proponent
        date: '',
        location: '',
        projectName: '',
        vendorAndForeman: '',           // SaskPower-specific: contractor info
        projectNumber: '',
        environmentalMonitor: '',       // SaskPower-specific: monitor name
        envFileNumber: '',              // SaskPower-specific: environmental file #
        generalActivity: '',            // Main timestamped activity description
        locationActivities: [],         // Location-specific activity blocks
        totalHoursWorked: '',           // SaskPower-specific: e.g., "10.5"
        completedTailgate: '',          // Checklist: 'Yes' | 'No' | 'NA' | ''
        reviewedTailgate: '',           // Checklist
        reviewedPermits: '',            // Checklist
        equipmentOnsite: '',            // Replaces DfrStandard's "communication"
        weatherAndGroundConditions: '',
        environmentalProtection: '',
        wildlifeObservations: '',
        futureMonitoring: '',           // Replaces DfrStandard's "furtherRestoration"
        comments: {},                   // Yellow sticky-note comments (legacy)
    });

    // --- Photo Data ---
    const [photosData, setPhotosData] = useState<PhotoData[]>([]);

    // --- UI State ---
    const [errors, setErrors] = useState(new Set<string>());       // Validation error field IDs
    const [showValidationErrorModal, setShowValidationErrorModal] = useState(false);
    const [showUnsupportedFileModal, setShowUnsupportedFileModal] = useState(false);
    const [showNoInternetModal, setShowNoInternetModal] = useState(false);
    const [showMigrationNotice, setShowMigrationNotice] = useState(false);
    const [enlargedImageUrl, setEnlargedImageUrl] = useState<string | null>(null);
    const [pdfPreview, setPdfPreview] = useState<{url, filename, blob} | null>(null);
    const [showStatusModal, setShowStatusModal] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [openComments, setOpenComments] = useState<Set<string>>(new Set());
    const [zoomLevel, setZoomLevel] = useState(100);               // 70–150%
    const [isDirty, setIsDirty] = useState(false);
    const [showUnsavedModal, setShowUnsavedModal] = useState(false);

    // --- Inline Comments System ---
    const [commentsCollapsed, setCommentsCollapsed] = useState(false);
    const [commentAnchors, setCommentAnchors] = useState<Map<string, CommentAnchor>>(new Map());
    const [hoveredCommentId, setHoveredCommentId] = useState<string | null>(null);
};
```

**Key difference from DfrStandard:** SaskPower uses a single flat `data` object (`DfrSaskpowerData`) instead of separate `headerData` + `bodyData`. This is because the SaskPower report was designed earlier in the project's lifecycle.

### Unique SaskPower Features

#### 1. SaskPower-Specific Header Fields

The PDF header is drawn in a **two-column layout** with these fields:

```typescript
// Left column (col1)                    // Right column (col2)
{ label: 'PROPONENT', value: 'SaskPower' }  { label: 'DATE', value: data.date }
{ label: 'PROJECT', value: data.projectName }  { label: 'X-TERRA PROJECT #', value: data.projectNumber }
{ label: 'LOCATION', value: data.location }  { label: 'MONITOR', value: data.environmentalMonitor }
{ label: 'ENV FILE NUMBER', value: data.envFileNumber }  { label: 'VENDOR', value: data.vendorAndForeman }
```

The two columns are drawn independently, and the final Y position is `Math.max(yPos1, yPos2)` so the taller column determines where body text starts.

#### 2. Checklist Section (Yes/No/N/A Radio Buttons)

Three checklist items rendered as radio-button groups in the UI and as filled/unfilled circles in the PDF:

```tsx
// UI rendering — three options per checklist item
const ChecklistItem = ({ label, value, onChange }) => (
    <div>
        <span>{label}</span>
        {['Yes', 'No', 'NA'].map(option => (
            <label key={option}>
                <input type="radio" checked={value === option}
                    onChange={() => onChange(option)} />
                {option}
            </label>
        ))}
    </div>
);
```

```typescript
// PDF rendering — draws circles with teal fill for selected option
checklistItems.forEach(item => {
    const options: ChecklistOption[] = ['Yes', 'No', 'NA'];
    const circleRadius = 1.5;            // 1.5mm radius circles
    const spaceBetweenOptions = 20;      // 20mm between each option

    // Label on the left
    doc.text(item.label, contentMargin, itemY);

    // Options aligned to the right edge
    let currentX = pageWidth - contentMargin - (options.length * spaceBetweenOptions);

    options.forEach(option => {
        const circleY = itemY - circleRadius / 2;  // Vertically center the circle

        if (option === item.value) {
            // SELECTED: teal filled circle
            doc.setFillColor(0, 125, 140);  // X-Terra teal
            doc.circle(currentX, circleY, circleRadius, 'FD');  // 'FD' = Fill + Draw border
        } else {
            // UNSELECTED: empty circle (outline only)
            doc.circle(currentX, circleY, circleRadius, 'S');   // 'S' = Stroke only
        }

        // Option label ("Yes", "No", "NA") next to circle
        doc.text(option, currentX + circleRadius + 2, itemY);
        currentX += spaceBetweenOptions;
    });
    yPos += 8;  // 8mm between checklist rows
});
```

#### 3. Total Hours Worked

```typescript
// Rendered after checklist in the PDF
const hoursY = yPos + 4;
doc.setFont('times', 'bold');
doc.text(`Total Hours Worked: ${data.totalHoursWorked}`, contentMargin, hoursY);
```

#### 4. Different Body Fields

SaskPower has 5 body text sections (vs. DfrStandard's 6):

| SaskPower Field              | DfrStandard Equivalent |
|------------------------------|------------------------|
| `equipmentOnsite`            | *(no equivalent)*      |
| `weatherAndGroundConditions` | Same                   |
| `environmentalProtection`    | Same                   |
| `wildlifeObservations`       | Same                   |
| `futureMonitoring`           | `furtherRestoration`   |
| *(no equivalent)*            | `communication`        |

### SaskPower Validation

SaskPower validates **more fields** than DfrStandard — 17 required fields total:

```typescript
const validateForm = (): boolean => {
    const requiredFields: (keyof DfrSaskpowerData)[] = [
        'date', 'location', 'projectName', 'vendorAndForeman',
        'projectNumber', 'environmentalMonitor', 'envFileNumber',
        'generalActivity', 'totalHoursWorked', 'equipmentOnsite',
        'weatherAndGroundConditions', 'environmentalProtection',
        'wildlifeObservations', 'futureMonitoring',
        'completedTailgate', 'reviewedTailgate', 'reviewedPermits'  // Checklists required too!
    ];

    requiredFields.forEach(field => {
        const value = data[field];
        // Check for null, undefined, or empty/whitespace string
        if (value === null || value === undefined ||
            (typeof value === 'string' && !value.trim())) {
            newErrors.add(field);
        }
    });

    // Photo validation — same pattern as DfrStandard
    photosData.forEach(photo => {
        const prefix = `photo-${photo.id}-`;
        if (!photo.date) newErrors.add(`${prefix}date`);
        if (!photo.location) newErrors.add(`${prefix}location`);
        if (!photo.description) newErrors.add(`${prefix}description`);
        if (!photo.imageUrl) newErrors.add(`${prefix}imageUrl`);
        if (!photo.isMap && !photo.direction) newErrors.add(`${prefix}direction`);
    });
};
```

### PDF Generation — SaskPower Layout

The SaskPower PDF uses the same `renderTextSection` function as the body text renderer, which handles:

```typescript
// renderTextSection handles ALL the complexity of multi-page text sections:
const renderTextSection = async (doc, currentY, title, content, options) => {
    // 1. Check if title + at least one line of body fits on current page
    if (y + headerHeight + minimumBodyHeight > maxYPos) {
        doc.addPage();           // Start new page
        y = await drawDfrHeader(doc);  // Redraw the header on new page
    }

    // 2. Draw section title (bold, 13pt)
    doc.setFont("times", "bold");
    doc.setFontSize(13);
    doc.text(title, contentMargin, titleY);

    // 3. Process body line by line
    for (const line of content.split("\n")) {
        // Detect bullet points: lines starting with "-"
        const isBullet = line.trim().startsWith("-");

        // Detect indentation: count leading spaces, convert to mm
        const indentLevel = Math.floor(leadingSpaces / 2);
        const indentWidth = indentLevel * 5;  // 5mm per indent level

        // Wrap text to available width
        const split = doc.splitTextToSize(textContent, maxWidth);

        // PAGE BREAK mid-section: if text won't fit, start new page
        if (y + textHeight > maxYPos) {
            doc.addPage();
            y = await drawDfrHeader(doc);
            doc.setFont("times", "normal");  // Reset font (prevents bold bleed)
            doc.setFontSize(12);
        }

        // Draw bullet dash and indented text
        if (isBullet) doc.text("-", bulletX, renderY);
        doc.text(split, textX, renderY);
    }
};
```

The text sections are drawn in this order:

```typescript
// 1. General Activity (first, immediately after header)
yPos = await renderTextSection(doc, yPos,
    'Project Activities (detailed description with timestamps):', data.generalActivity);

// 2–6. Remaining body sections
const otherTextSections = [
    { title: 'X-Terra Equipment Onsite:', content: data.equipmentOnsite },
    { title: 'Weather and Ground Conditions:', content: data.weatherAndGroundConditions },
    { title: 'Environmental Protection Measures and Mitigation:', content: data.environmentalProtection },
    { title: 'Wildlife Observations:', content: data.wildlifeObservations },
    { title: 'Future Monitoring Requirements:', content: data.futureMonitoring },
];

for (const { title, content } of otherTextSections) {
    yPos = await renderTextSection(doc, yPos, title, content);
}

// 7. Checklist section (circles + labels)
// 8. Total Hours Worked (bold text)
// 9. Photo Log section (uses shared drawPhotoLogSection)
```

### Logo Loading (addSafeLogo)

SaskPower loads the X-Terra logo differently from DfrStandard — it uses a runtime fetch instead of an embedded base64 string:

```typescript
const addSafeLogo = async (doc, x, y, w, h) => {
    // 1. Get the asset URL (works in both dev and production)
    const logoUrl = await getAssetUrl("xterra-logo.jpg");

    // 2. Fetch the logo file
    const response = await fetch(logoUrl);
    const blob = await response.blob();

    // 3. Convert blob to base64 (jsPDF requires base64 for addImage)
    const reader = new FileReader();
    reader.readAsDataURL(blob);

    // 4. Once converted, add to PDF
    reader.onloadend = () => {
        const base64data = reader.result as string;
        doc.addImage(base64data, 'JPEG', x, y, w, h);
        // Logo: 40mm wide, 10mm tall, at top-left corner
    };
};
```

### Migration Logic

SaskPower has additional migration complexity due to **three** legacy activity formats:

```typescript
// Three legacy activity formats to handle:
// 1. locationActivities_old (old array format from early SaskPower versions)
// 2. activityBlocks (mixed general/location blocks from mid-version)
// 3. projectActivities (flat string from oldest format)

// All get merged into generalActivity + locationActivities[]
const allLocationActivities: LocationActivity[] = [];

// Format 1: Current locationActivities (newest format — keep as-is)
if (finalData.locationActivities?.length)
    allLocationActivities.push(...finalData.locationActivities);

// Format 2: locationActivities_old (early SaskPower format)
if (finalData.locationActivities_old?.length)
    allLocationActivities.push(...finalData.locationActivities_old);

// Format 3: activityBlocks (mixed general/location — extract location blocks only)
if (finalData.activityBlocks?.length) {
    finalData.activityBlocks.forEach(block => {
        if (block.type === 'location') {
            allLocationActivities.push({
                id: block.id,
                location: block.location || '',
                activities: block.activities
            });
        }
    });
}
```

---

## 19. Photo Log (PhotoLog.tsx)

A standalone photo-only report (~1300 lines) without DFR body text fields. This is the simplest report type — just a header and photos.

### Key Differences from DFR Reports

- Uses `Header` component (simpler — 5 fields: proponent, projectName, location, date, projectNumber)
- **No body text fields**, no BulletPointEditor, no inline comments system
- Photos include a `direction` field (N, S, E, W, NE, NW, SE, SW)
- Supports marking photos as "Map" entries (shown in a separate section of the PDF)
- File extension: `.plog`

### PhotoLog State Variables

```typescript
const PhotoLog: React.FC<PhotoLogProps> = ({ onBack, initialData }) => {
    // --- Header Data (simpler than DFR — no monitor, no env file) ---
    const [headerData, setHeaderData] = useState<HeaderData>({
        proponent: '',       // Client name
        projectName: '',     // Project title
        location: '',        // Site location
        date: '',            // Report date
        projectNumber: '',   // X-Terra project number
    });

    // --- Photos ---
    const [photosData, setPhotosData] = useState<PhotoData[]>([]);

    // --- UI State ---
    const [errors, setErrors] = useState(new Set<string>());
    const [showUnsupportedFileModal, setShowUnsupportedFileModal] = useState(false);
    const [showValidationErrorModal, setShowValidationErrorModal] = useState(false);
    const [enlargedImageUrl, setEnlargedImageUrl] = useState<string | null>(null);
    const [pdfPreview, setPdfPreview] = useState<{url, filename, blob} | null>(null);
    const [showStatusModal, setShowStatusModal] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [isDirty, setIsDirty] = useState(false);
    const [showUnsavedModal, setShowUnsavedModal] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const isDownloadingRef = useRef(false);  // Prevents double-click on download
};
```

### Photo Operations

```typescript
// --- Renumbering: sequential integers, starting at 1 ---
// Unlike DfrStandard which has separate photo/map numbering,
// PhotoLog uses simple sequential numbering for ALL entries
const renumberPhotos = (photos: PhotoData[]) => {
    return photos.map((photo, index) => ({
        ...photo,
        photoNumber: String(index + 1)  // Simple: 1, 2, 3, 4...
    }));
};

// --- Add Photo (optionally at a specific position) ---
const addPhoto = (insertAtIndex?: number) => {
    // ID generation: max existing ID + 1 (never reuses deleted IDs)
    const newId = photosData.length > 0
        ? Math.max(...photosData.map(p => p.id)) + 1
        : 1;

    const newPhoto: PhotoData = {
        id: newId,
        photoNumber: '',        // Will be set by renumberPhotos
        date: '',
        location: '',
        description: '',
        imageUrl: null,
        direction: '',          // PhotoLog-specific: compass direction
    };

    setPhotosData(prev => {
        let newPhotos;
        if (insertAtIndex !== undefined) {
            // Insert AFTER the specified index (used by "Add Below" button)
            const insertionPoint = insertAtIndex + 1;
            newPhotos = [
                ...prev.slice(0, insertionPoint),  // Everything before insertion
                newPhoto,                           // New photo
                ...prev.slice(insertionPoint)       // Everything after
            ];
        } else {
            // Append to end (default "Add Photo" button)
            newPhotos = [...prev, newPhoto];
        }
        return renumberPhotos(newPhotos);  // Always renumber after any change
    });
    setIsDirty(true);
};

// --- Remove Photo ---
const removePhoto = (id: number) => {
    setPhotosData(prev => {
        const photoToRemove = prev.find(p => p.id === id);

        // Clean up IndexedDB cached image (non-blocking, fire-and-forget)
        if (photoToRemove && photoToRemove.imageId) {
            deleteImage(photoToRemove.imageId)
                .catch(err => console.error("Failed to delete image from DB", err));
        }

        return renumberPhotos(prev.filter(photo => photo.id !== id));
    });
    setIsDirty(true);
};
```

### Image Storage Strategy

```typescript
// When saving for recent projects, images are stored TWO ways:
const prepareStateForRecentProjectStorage = async (header, photos) => {
    const photosForStorage = await Promise.all(
        photos.map(async (photo) => {
            if (photo.imageUrl) {
                const imageId = photo.imageId ||
                    `${header.projectNumber || 'proj'}-${photo.id}-${Date.now()}`;

                // WAY 1: IndexedDB cache (optional, for fast retrieval)
                try {
                    await storeImage(imageId, photo.imageUrl);
                } catch (e) {
                    console.warn('Failed to cache image in IndexedDB', e);
                }

                // WAY 2: Keep imageUrl embedded in the JSON (base64 string)
                // This is the PRIMARY storage — project file is self-contained
                return { ...photo, imageId, imageUrl: photo.imageUrl };
            }
            return photo;
        })
    );
};
```

### PhotoLog Validation

```typescript
const validateForm = (): boolean => {
    const newErrors = new Set<string>();

    // All 5 header fields are required
    (Object.keys(headerData) as Array<keyof HeaderData>).forEach(key => {
        if (!headerData[key]) newErrors.add(key);
    });

    // Every photo must have: date, location, description, image
    // Non-map photos also require direction
    photosData.forEach(photo => {
        const prefix = `photo-${photo.id}-`;
        if (!photo.date) newErrors.add(`${prefix}date`);
        if (!photo.location) newErrors.add(`${prefix}location`);
        if (!photo.description) newErrors.add(`${prefix}description`);
        if (!photo.imageUrl) newErrors.add(`${prefix}imageUrl`);
        if (!photo.isMap && !photo.direction) newErrors.add(`${prefix}direction`);
        // ^ Maps don't need a compass direction (they show an area, not a viewpoint)
    });
};
```

### Download Photos as ZIP

The "Download Photos" feature exports all photos as a ZIP archive with a metadata text file:

```typescript
const handleDownloadPhotos = useCallback(async () => {
    // Guard against double-clicks
    if (isDownloadingRef.current) return;
    isDownloadingRef.current = true;

    try {
        // Show progress modal
        setStatusMessage('Checking for photos...');
        setShowStatusModal(true);
        await new Promise(resolve => setTimeout(resolve, 100));  // Let UI render

        const photosWithImages = photosData.filter(p => p.imageUrl);
        if (photosWithImages.length === 0) {
            setStatusMessage('No photos found to download.');
            return;
        }

        setStatusMessage(`Preparing ${photosWithImages.length} photos...`);
        const zip = new JSZip();
        let metadata = '';  // Accumulates metadata for all photos

        // Sanitize filenames: replace non-alphanumeric chars with underscore
        const sanitizeFilename = (name: string) => name.replace(/[^a-z0-9_.\-]/gi, '_');

        for (const photo of photosWithImages) {
            const filename = `${sanitizeFilename(photo.photoNumber)}.jpg`;

            // Build metadata text file (human-readable photo info)
            metadata += `---
File: ${filename}
Photo Number: ${photo.photoNumber}
Date: ${photo.date || 'N/A'}
Location: ${photo.location || 'N/A'}
Direction: ${photo.direction || 'N/A'}
Description: ${photo.description || 'N/A'}
---\n\n`;

            // Convert base64 data URL to blob and add to ZIP
            const response = await fetch(photo.imageUrl!);
            const blob = await response.blob();
            zip.file(filename, blob);
        }

        // Include metadata.txt alongside the photos
        zip.file('metadata.txt', metadata);

        // Generate ZIP and save via Electron
        const zipBlob = await zip.generateAsync({ type: 'arraybuffer' });
        const defaultName = `${headerData.projectName || 'Photos'}_Photos.zip`;
        await window.electronAPI.saveZipFile(zipBlob, defaultName);
    } finally {
        isDownloadingRef.current = false;  // Re-enable button
        setShowStatusModal(false);
    }
}, [photosData, headerData]);
```

---

## 20. Combined Log (CombinedLog.tsx)

This component (~1500 lines) lets users **merge photos from multiple existing project files** into a single photo log. It's the only report type that can import data from other project files.

### CombinedLog State Variables

```typescript
const CombinedLog: React.FC<CombinedLogProps> = ({ onBack, initialData }) => {
    // --- Same header as PhotoLog (5 simple fields) ---
    const [headerData, setHeaderData] = useState<HeaderData>({
        proponent: '', projectName: '', location: '', date: '', projectNumber: '',
    });

    const [photosData, setPhotosData] = useState<PhotoData[]>([]);
    const [projectTimestamp, setProjectTimestamp] = useState<number | null>(null);

    // --- UI State ---
    const [errors, setErrors] = useState(new Set<string>());
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);  // Import dialog
    const [isDirty, setIsDirty] = useState(false);
    const [showUnsavedModal, setShowUnsavedModal] = useState(false);

    // --- Refs ---
    const fileInputRef = useRef<HTMLInputElement>(null);        // Standard file open
    const importFileInputRef = useRef<HTMLInputElement>(null);  // Import file selector
    const isDownloadingRef = useRef(false);
};
```

### How Importing Works

The import flow has two entry points depending on whether the Electron API is available:

```typescript
// Entry Point 1: Electron native dialog (preferred)
const handleImportFromFiles = async () => {
    if (window.electronAPI && window.electronAPI.loadMultipleProjects) {
        // Opens native OS multi-file selection dialog
        // Filters for: .dfr, .spdfr, .plog, .clog, .iogc files
        const result = await window.electronAPI.loadMultipleProjects();
        if (result.success && result.data) {
            await processImportedFiles(result.data);  // result.data = string[]
        }
    } else {
        // Entry Point 2: HTML file input fallback (for development/testing)
        importFileInputRef.current?.click();
    }
};

// HTML fallback handler — reads selected files as text
const handleImportFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const fileContents: string[] = [];
    for (let i = 0; i < files.length; i++) {
        const text = await files[i].text();  // Read each file as text
        fileContents.push(text);
    }

    await processImportedFiles(fileContents);
    event.target.value = '';  // Reset input so same files can be re-selected
};
```

### The Core Import Processing

```typescript
const processImportedFiles = async (fileContents: string[]) => {
    setStatusMessage('Importing photos from files...');
    setShowStatusModal(true);

    try {
        const newPhotos: PhotoData[] = [];

        // Step 1: Parse each file and extract photos
        for (const content of fileContents) {
            try {
                const projectData = JSON.parse(content);

                // Works with ALL project types (.dfr, .spdfr, .plog, .clog)
                // because they all have a photosData array
                if (projectData?.photosData && Array.isArray(projectData.photosData)) {
                    const photos = projectData.photosData as PhotoData[];

                    for (const p of photos) {
                        let imageUrl = p.imageUrl;

                        // Fallback: if imageUrl is missing but imageId exists,
                        // try to retrieve from IndexedDB cache
                        if (!imageUrl && p.imageId) {
                            const storedImg = await retrieveImage(p.imageId);
                            if (storedImg) imageUrl = storedImg;
                        }

                        // Only import photos that have actual image data
                        if (imageUrl) {
                            newPhotos.push({
                                ...p,
                                id: 0,              // Placeholder — will be reassigned below
                                imageId: undefined,  // Clear old imageId (will get new one on save)
                                imageUrl: imageUrl   // Embed the actual image data
                            });
                        }
                    }
                }
            } catch (e) {
                console.error("Error parsing a file", e);
                // Silently skip malformed files — don't block the whole import
            }
        }

        // Step 2: Merge imported photos with existing photos
        if (newPhotos.length > 0) {
            setPhotosData(prev => {
                // Generate unique IDs starting after the highest existing ID
                let nextId = prev.length > 0
                    ? Math.max(...prev.map(item => item.id)) + 1
                    : 1;

                const processedNewPhotos = newPhotos.map(p => ({
                    ...p,
                    id: nextId++,  // Assign sequential unique IDs
                }));

                // Combine: existing photos first, then imported photos
                const combined = [...prev, ...processedNewPhotos];
                return renumberPhotos(combined);  // Renumber display numbers (1, 2, 3...)
            });
        } else {
            alert("No photos found in selected files.");
        }
    } catch (e) {
        console.error("Import process failed", e);
        alert("An error occurred while importing files.");
    }
};
```

### What Makes CombinedLog Different

| Feature                | PhotoLog | CombinedLog        |
|------------------------|----------|--------------------|
| Import from files      | No       | Yes                |
| File extension         | `.plog`  | `.clog`            |
| Import button in UI    | No       | Yes                |
| Multi-file selection   | No       | Yes                |
| Photo add/remove       | Yes      | Yes                |
| Drag-and-drop reorder  | Yes      | Yes                |
| PDF export             | Yes      | Yes (same format)  |
| New photo date default | Empty    | Header date        |

---

## 21. PDF Generation System

PDF generation uses `jsPDF` to create multi-page documents with headers, body text, photos, and maps. The system has two layers: **shared photo utilities** (`pdfPhotoUtils.ts`) used by all report types, and **per-report PDF code** inside each component.

### Shared Photo Layout Constants (pdfPhotoUtils.ts)

```typescript
export const PDF_LAYOUT = {
    PAGE_WIDTH: 215.9,    // 8.5 inches in mm (US Letter width)
    PAGE_HEIGHT: 279.4,   // 11 inches in mm (US Letter height)
    MARGIN: 12.7,         // 0.5 inch margin on all sides
    TEAL_COLOR: [0, 125, 140] as [number, number, number],  // X-Terra brand color
    IMG_W: 132,           // Photo image width in mm (~5.2 inches)
    IMG_H: 99,            // Photo image height in mm (4:3 aspect ratio)
    GAP: 5,               // Gap between text column and image
    RIGHT_INDENT: 1.5     // Small indent from right border for images
};
```

### drawPdfEntry — Single Photo Entry

Each photo entry draws text metadata on the left and the image on the right:

```typescript
export const drawPdfEntry = (doc, photo, y, contentMargin, textWidth, imgX) => {
    // Start text slightly below Y to account for font baseline
    let tY = y + (doc.getTextDimensions('Photo').h * 0.75);

    // Helper: draws a label:value pair, handles text wrapping
    const drawTextField = (label: string, value: string, isDesc = false) => {
        doc.setFont('times', 'bold');    // Label is bold
        doc.setFontSize(12);
        doc.text(label + ':', contentMargin, tY);
        doc.setFont('times', 'normal');  // Value is normal weight

        if (isDesc) {
            // DESCRIPTION: wraps below the label (multi-line capable)
            tY += 5;  // Move down below label
            const dLines = doc.splitTextToSize(value || ' ', textWidth);
            doc.text(dLines, contentMargin, tY);
            tY += doc.getTextDimensions(dLines).h;  // Advance past wrapped text
        } else {
            // INLINE: value appears next to label on same line
            const labelW = doc.getTextWidth(label + ':');
            const lines = doc.splitTextToSize(value || ' ', textWidth - labelW - 2);
            doc.text(lines, contentMargin + labelW + 2, tY);
            tY += doc.getTextDimensions(lines).h + 1.5;  // 1.5mm gap between fields
        }
    };

    // Draw all 5 metadata fields in order:
    drawTextField('Photo', photo.photoNumber);           // "Photo: 1"
    drawTextField('Direction', photo.direction || 'N/A'); // "Direction: NE"
    drawTextField('Date', photo.date);                    // "Date: 2024-01-15"
    drawTextField('Location', photo.location);            // "Location: NE-25-42-1-W3"
    drawTextField('Description', photo.description, true); // Multi-line description

    // Draw the photo image (right side, aligned with top of entry)
    if (photo.imageUrl) {
        doc.addImage(photo.imageUrl, 'JPEG', imgX, y, PDF_LAYOUT.IMG_W, PDF_LAYOUT.IMG_H);
    }
};
```

### drawPhotoLogSection — Photo Pages

This shared function is called by all 4 report types to generate photo pages:

```typescript
export const drawPhotoLogSection = async (doc, photos, drawHeader, drawFooter) => {
    // Separate photos from maps
    const sitePhotos = photos.filter(p => !p.isMap && p.imageUrl);  // Regular photos
    const mapPhotos = photos.filter(p => p.isMap && p.imageUrl);    // Map entries

    // Calculate layout positions
    const TEAL_RIGHT = PDF_LAYOUT.PAGE_WIDTH - PDF_LAYOUT.MARGIN;  // Right edge of content
    const IMG_X = TEAL_RIGHT - PDF_LAYOUT.IMG_W - PDF_LAYOUT.RIGHT_INDENT;  // Image left edge
    const CONTENT_MARGIN = PDF_LAYOUT.MARGIN + 4;    // Text starts 4mm inside margin
    const TEXT_W = IMG_X - CONTENT_MARGIN - PDF_LAYOUT.GAP;  // Available text width

    // --- SITE PHOTOS: 2 per page ---
    if (sitePhotos.length > 0) {
        // Group photos into pairs: [[0,1], [2,3], [4,5], [6]]
        const groups: number[][] = [];
        let currentGroup: number[] = [];
        sitePhotos.forEach((_, i) => {
            currentGroup.push(i);
            if (currentGroup.length === 2) {
                groups.push(currentGroup);
                currentGroup = [];
            }
        });
        if (currentGroup.length > 0) groups.push(currentGroup);  // Don't forget odd last photo

        for (let i = 0; i < groups.length; i++) {
            doc.addPage();                        // Each group gets a new page
            const yStart = await drawHeader(doc);  // Header returns Y position below it
            const pg = groups[i];

            if (pg.length === 1) {
                // Single photo: draw at top of content area
                drawPdfEntry(doc, sitePhotos[pg[0]], yStart + 1, CONTENT_MARGIN, TEXT_W, IMG_X);
            } else {
                // Two photos: first at top, second anchored to bottom
                const photo1 = sitePhotos[pg[0]];
                const photo2 = sitePhotos[pg[1]];

                // Photo 1: positioned at top
                const entry1Y = yStart + 1;
                drawPdfEntry(doc, photo1, entry1Y, CONTENT_MARGIN, TEXT_W, IMG_X);

                // Photo 2: positioned so its bottom edge aligns with page bottom margin
                const entry2Bottom = PDF_LAYOUT.PAGE_HEIGHT - PDF_LAYOUT.MARGIN - 0.5;
                const entry2Y = entry2Bottom - PDF_LAYOUT.IMG_H;

                // Teal divider line: centered between photo 1 bottom and photo 2 top
                const lineY = ((entry1Y + PDF_LAYOUT.IMG_H) + entry2Y) / 2;
                doc.setDrawColor(0, 125, 140);  // X-Terra teal
                doc.setLineWidth(0.5);
                doc.line(PDF_LAYOUT.MARGIN, lineY, TEAL_RIGHT, lineY);

                drawPdfEntry(doc, photo2, entry2Y, CONTENT_MARGIN, TEXT_W, IMG_X);
            }
            drawFooter(doc);
        }
    }

    // --- MAPS: 1 per page, full width ---
    if (mapPhotos.length > 0) {
        for (const map of mapPhotos) {
            doc.addPage();
            const yStart = await drawHeader(doc);

            // Maps fill the available page height (minus space for metadata below)
            const availH = (PDF_LAYOUT.PAGE_HEIGHT - PDF_LAYOUT.MARGIN - 25) - yStart;
            if (map.imageUrl) {
                // Draw map image stretched to full content width
                doc.addImage(map.imageUrl, 'JPEG',
                    CONTENT_MARGIN, yStart,
                    PDF_LAYOUT.PAGE_WIDTH - (CONTENT_MARGIN * 2), availH,
                    undefined, 'FAST');  // 'FAST' = lower quality compression for speed

                // Map metadata text below the image
                drawPdfEntry(doc, map, yStart + availH + 5, CONTENT_MARGIN,
                    PDF_LAYOUT.PAGE_WIDTH - (CONTENT_MARGIN * 2), CONTENT_MARGIN);
            }
            drawFooter(doc);
        }
    }
};
```

### Photo Page Visual Layout

```
+--------------------------------------------+
|          [Header/Logo + Project Info]       |
|                                             |
|  Photo: 1           +==================+   |
|  Direction: N       |                  |   |
|  Date: 2024-01-15   |     IMAGE        |   |
|  Location: NE-25    |   (132 x 99mm)   |   |
|  Description:       |                  |   |
|    Monitoring the    +==================+   |
|    pipeline ROW...                          |
|                                             |
|  ────────────── teal line ──────────────   |
|                                             |
|  Photo: 2           +==================+   |
|  Direction: S       |                  |   |
|  Date: 2024-01-15   |     IMAGE        |   |
|  Location: SW-12    |   (132 x 99mm)   |   |
|  Description:       |                  |   |
|    Restoration       +==================+   |
|    activities...                            |
|                                             |
+--------------------------------------------+
```

### DFR Standard PDF Structure

```
Page 1+: Header + Logo + Body Text
  - X-Terra logo (top-left, 40mm x 10mm)
  - "DAILY FIELD REPORT" title (centered, teal, 18pt)
  - Header fields in two columns with teal border lines
  - Body sections (each with bold 13pt title, normal 12pt body):
    1. General Activity (timestamped)
    2. Location Activities (each location block)
    3. Communication
    4. Weather & Ground Conditions
    5. Environmental Protection
    6. Wildlife Observations
    7. Further Restoration
  - Auto page breaks: if a section title + 1 line won't fit → new page
  - Mid-paragraph breaks: if a line won't fit → new page + header redrawn

Photo Pages: 2 photos per page with text metadata
Map Pages: Full-page map images (1 per page)
```

### PDF Generation Flow (Simplified)

```typescript
const handleDownloadPdf = async () => {
    // Step 1: Validate — all required fields must be filled
    if (!validateReport()) {
        setShowValidationErrorModal(true);
        return;  // Stop — user must fix errors first
    }

    // Step 2: Create jsPDF instance (Letter size, millimeter units)
    const doc = new jsPDF({ unit: 'mm', format: 'letter' });

    // Step 3: Draw the first page header (logo + title + project info)
    let yPos = await drawDfrHeader(doc);

    // Step 4: Draw body text sections with auto page breaks
    yPos = await renderTextSection(doc, yPos,
        'Project Activities:', bodyData.generalActivity);

    // Each renderTextSection call:
    //   - Checks if title + 1 line fits on current page
    //   - If not → doc.addPage() + redraw header
    //   - Draws title in bold 13pt
    //   - Processes body line-by-line, detecting bullets and indentation
    //   - If a line overflows → doc.addPage() + redraw header + reset font

    // Step 5: Draw photo pages using shared utility
    await drawPhotoLogSection(doc, photosData, drawHeader, drawFooter);

    // Step 6: Convert to blob and show preview modal
    const pdfBlob = doc.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);
    setPdfPreview({
        url: pdfUrl,
        filename: `${headerData.projectName}.pdf`,
        blob: pdfBlob
    });
};
```

### PDF Preview Modal (PdfCanvasPreview)

After generating the PDF, a full-screen modal shows a page-by-page preview using `pdfjs-dist`:

```tsx
const PdfCanvasPreview = ({ pdfUrl, filename, onClose, onSave }) => {
    useEffect(() => {
        const loadPdf = async () => {
            // pdfjs-dist parses the PDF blob and renders each page to a <canvas>
            const pdf = await pdfjs.getDocument(pdfUrl).promise;

            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);         // Get page object
                const canvas = canvasRefs[i - 1];          // Get matching <canvas> element
                const context = canvas.getContext('2d');

                // Scale 1.5x for crisp rendering on high-DPI displays
                const viewport = page.getViewport({ scale: 1.5 });
                canvas.width = viewport.width;
                canvas.height = viewport.height;

                // Render the PDF page to the canvas
                await page.render({
                    canvasContext: context,
                    viewport: viewport
                }).promise;
            }
        };
        loadPdf();
    }, [pdfUrl]);

    // UI: scrollable list of canvas elements + toolbar with [Save PDF] [Close]
    // Clicking "Save PDF" calls window.electronAPI.savePdf(arrayBuffer, filename)
    //   → opens native Save dialog → writes file to disk
};
```

### The Buffered Draw Pattern

SaskPower uses a "buffered draw" pattern for elements that need to be drawn after measuring:

```typescript
// Problem: checklist circles and lines need exact Y positions,
// but we don't know the final Y until all text sections are drawn.
// Solution: buffer the draw calls and flush them when the page is finalized.

const bufferedDraws: ((doc: jsPDF) => void)[] = [];

// During layout: just record what to draw
bufferedDraws.push(d => {
    d.circle(currentX, circleY, circleRadius, 'FD');
    d.text(option, currentX + circleRadius + 2, itemY);
});

// After all layout is calculated: execute all draws
const flushDrawBuffer = (doc, y) => {
    bufferedDraws.forEach(draw => draw(doc));
    bufferedDraws.length = 0;  // Clear the buffer
};
```

---

## 22. Photo Drag-and-Drop Reordering

Photos can be reordered by dragging the grip handle (six-dot icon). This feature uses the `@dnd-kit` library — the most popular React drag-and-drop library — and is implemented identically in all 4 report components.

### Library: @dnd-kit (Three Packages)

```
@dnd-kit/core       - The foundation layer:
                       DndContext: wraps the entire drag-and-drop area
                       closestCenter: collision detection algorithm
                       DragEndEvent: TypeScript type for the drag-end callback

@dnd-kit/sortable   - The sortable list layer (built on core):
                       SortableContext: manages a sortable list of items
                       useSortable: per-item hook that provides drag state
                       verticalListSortingStrategy: optimizes for vertical lists
                       arrayMove: utility to reorder arrays

@dnd-kit/utilities  - Helpers:
                       CSS.Transform: converts transform objects to CSS strings
```

### Architecture — How the Pieces Connect

```
DndContext (parent component — e.g., DfrStandard)
    │
    │  Provides: drag event handling, collision detection
    │
    └── SortableContext
            │
            │  Provides: sort order, item IDs, sorting strategy
            │
            ├── PhotoEntry (id=1) ← useSortable hook
            │     └── GripVerticalIcon ← drag handle (attributes + listeners)
            │
            ├── PhotoEntry (id=2) ← useSortable hook
            │     └── GripVerticalIcon ← drag handle
            │
            └── PhotoEntry (id=3) ← useSortable hook
                  └── GripVerticalIcon ← drag handle
```

### Parent Component Code (Same in All 4 Reports)

```tsx
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';

// --- Drag End Handler ---
// Called when user drops a photo at its new position
const handlePhotoDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    // active = the item being dragged (has .id)
    // over   = the item it was dropped onto (has .id)

    if (active.id !== over?.id) {
        // Find the array indices from the item IDs
        const oldIndex = photosData.findIndex(p => p.id === active.id);
        const newIndex = photosData.findIndex(p => p.id === over!.id);

        // arrayMove: creates a NEW array with the item moved
        // renumberPhotos: recalculates display numbers (Photo 1, Photo 2, etc.)
        setPhotosData(renumberPhotos(arrayMove(photosData, oldIndex, newIndex)));
        setIsDirty(true);  // Mark as unsaved
    }
};

// --- JSX Wrapper ---
// DndContext: handles all drag events for this area
// closestCenter: determines which item the dragged item is closest to
// SortableContext: tells children about the sort order and strategy
<DndContext collisionDetection={closestCenter} onDragEnd={handlePhotoDragEnd}>
    <SortableContext
        items={photosData.map(p => p.id)}  // Array of unique IDs
        strategy={verticalListSortingStrategy}  // Vertical list optimization
    >
        {photosData.map((photo, index) => (
            <PhotoEntry
                key={photo.id}  // React key = stable ID (NOT array index)
                data={photo}
                index={index}
                // ... other props
            />
        ))}
    </SortableContext>
</DndContext>
```

### Child Component Code (PhotoEntry.tsx)

```tsx
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const PhotoEntry = ({ data, printable, ... }) => {
    // --- useSortable Hook ---
    // Returns everything needed to make this item draggable:
    const {
        attributes,   // ARIA attributes for accessibility (role, tabIndex, etc.)
        listeners,    // Event handlers for the drag handle (onPointerDown, onKeyDown)
        setNodeRef,   // Ref callback — attach to the container div
        transform,    // Current transform state ({ x, y, scaleX, scaleY })
        transition,   // CSS transition string (smooth animation)
        isDragging    // Boolean: true while this specific item is being dragged
    } = useSortable({
        id: data.id,        // Unique ID matching the SortableContext items array
        disabled: printable  // Disable drag in print/PDF mode
    });

    return (
        // --- Container: moves with the drag transform ---
        <div
            ref={setNodeRef}  // @dnd-kit uses this ref to track the element's position
            style={{
                // CSS.Transform.toString converts {x, y, scaleX, scaleY} to
                // "translate3d(Xpx, Ypx, 0) scaleX(1) scaleY(1)"
                transform: CSS.Transform.toString(transform),
                transition,              // Smooth animation when items slide
                opacity: isDragging ? 0.5 : 1,  // Semi-transparent while dragging
                zIndex: isDragging ? 10 : undefined,  // Dragged item on top
            }}
        >
            {/* --- Drag Handle (six-dot grip icon) --- */}
            {/* Only this button triggers dragging, not the entire card */}
            <button
                {...attributes}  // Spread ARIA props
                {...listeners}   // Spread pointer/keyboard event handlers
                className="cursor-grab active:cursor-grabbing touch-none"
                // cursor-grab: shows grab cursor on hover
                // active:cursor-grabbing: shows closed-hand cursor while dragging
                // touch-none: prevents browser scroll interference on touch devices
            >
                <GripVerticalIcon className="h-6 w-6 text-gray-400" />
            </button>

            {/* ... rest of photo entry UI ... */}
        </div>
    );
};
```

### How arrayMove Works — Step by Step

```typescript
// Starting array (by ID):
//   Index: [0,    1,    2,    3,    4]
//   Data:  [A,    B,    C,    D,    E]
//   Photo: [#1,   #2,   #3,   #4,   #5]

// User drags C (index 2) and drops it after A (index 1):
arrayMove([A, B, C, D, E], 2, 1);
//   1. Remove C from index 2:  [A, B, D, E]
//   2. Insert C at index 1:    [A, C, B, D, E]

// Then renumberPhotos recalculates display numbers:
//   Index: [0,    1,    2,    3,    4]
//   Data:  [A,    C,    B,    D,    E]
//   Photo: [#1,   #2,   #3,   #4,   #5]  ← sequential, no gaps

// Note: internal IDs (A.id, C.id, etc.) never change —
// only the photoNumber (display label) gets recalculated
```

### Collision Detection: closestCenter

```text
During drag, @dnd-kit calculates which item the cursor is closest to:

    +----------+
    |  Photo 1 |  ← center at (100, 50)
    +----------+
         ↑
         │  cursor at (110, 80) — closest to Photo 1 center? Or Photo 2?
         │
    +----------+
    |  Photo 2 |  ← center at (100, 150)
    +----------+

closestCenter measures Euclidean distance from cursor to each item's center point.
The item with the smallest distance becomes the "over" target.
```

---

## 23. Thumbnail Preview System

When you hover over a recent project on the landing page, a small preview thumbnail appears above the project card. The system has three stages: generation, storage, and display.

### Constants

```typescript
const THUMB_WIDTH = 200;    // Thumbnail width in pixels
const THUMB_HEIGHT = 140;   // Thumbnail height in pixels
const THUMB_QUALITY = 0.6;  // JPEG compression quality (0.0 = worst, 1.0 = best)
                             // 0.6 keeps file size small (~5-15 KB per thumbnail)
```

### Helper Functions

```typescript
// Maps the AppType enum to a short label for the badge overlay
function getShortTypeName(type: AppType): string {
    switch (type) {
        case 'photoLog': return 'PHOTO';         // Photographic Log
        case 'dfrStandard': return 'DFR';         // Standard Daily Field Report
        case 'dfrSaskpower': return 'SP-DFR';     // SaskPower Daily Field Report
        case 'combinedLog': return 'COMBINED';     // Combined Logs
        case 'iogcLeaseAudit': return 'IOGC';     // IOGC Lease Audit
        default: return 'REPORT';
    }
}

// Truncates text to fit within a pixel width using Canvas measureText()
// Unlike a character-count truncation, this correctly handles variable-width fonts
function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
    // If the full text fits, return it as-is
    if (ctx.measureText(text).width <= maxWidth) return text;

    // Remove characters from the end one-by-one until "text..." fits
    let truncated = text;
    while (ctx.measureText(truncated + '...').width > maxWidth && truncated.length > 0) {
        truncated = truncated.slice(0, -1);
    }
    return truncated + '...';
    // Example: "Very Long Project Name Here" -> "Very Long Proj..."
}
```

### Placeholder Drawing (No Photo Available)

```typescript
// When the project has no photos, draw a gradient background with a document icon
function drawPlaceholder(ctx: CanvasRenderingContext2D) {
    // Create a gentle teal gradient (top-left to bottom-right)
    const gradient = ctx.createLinearGradient(0, 0, THUMB_WIDTH, THUMB_HEIGHT);
    gradient.addColorStop(0, '#E0F2F1');   // Light teal (top-left)
    gradient.addColorStop(1, '#B2DFDB');   // Slightly darker teal (bottom-right)
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, THUMB_WIDTH, THUMB_HEIGHT);  // Fill entire canvas

    // Draw a document emoji icon in the center
    ctx.fillStyle = '#007D8C';              // X-Terra teal color
    ctx.font = '36px sans-serif';
    ctx.textAlign = 'center';               // Center the emoji horizontally
    ctx.textBaseline = 'middle';            // Center vertically
    ctx.fillText('\u{1F4C4}', THUMB_WIDTH / 2, THUMB_HEIGHT / 2 - 10);
    // ^^ Unicode for the 📄 emoji (rendered as an icon on all platforms)

    // Reset alignment for subsequent text drawing
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
}
```

### Info Overlay Drawing

```typescript
// Draws a semi-transparent black bar at the bottom with a type badge and project name
// This overlay appears on BOTH photo thumbnails and placeholder thumbnails
function drawOverlay(ctx: CanvasRenderingContext2D, input: ThumbnailInput) {
    // --- Semi-transparent black bar at the bottom (36px tall) ---
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';   // 55% opaque black
    ctx.fillRect(0, THUMB_HEIGHT - 36, THUMB_WIDTH, 36);
    // This creates a dark bar so white text is readable over any photo

    // --- Type badge (small colored rectangle with type abbreviation) ---
    const typeLabel = getShortTypeName(input.type);  // e.g., "DFR"
    ctx.font = 'bold 9px Calibri, Arial, sans-serif';
    const badgeWidth = ctx.measureText(typeLabel).width + 8;
    // ^^ Width of badge = text width + 8px padding

    // Draw the teal badge rectangle
    ctx.fillStyle = '#007D8C';               // X-Terra brand teal
    ctx.fillRect(6, THUMB_HEIGHT - 30, badgeWidth, 14);
    // Position: 6px from left, 30px from bottom, dynamically sized

    // Draw the badge text in white
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(typeLabel, 10, THUMB_HEIGHT - 20);
    // Result looks like: [DFR] or [SP-DFR] or [PHOTO]

    // --- Project name (below the badge, truncated to fit) ---
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '11px Calibri, Arial, sans-serif';
    // truncateText uses measureText() to fit within THUMB_WIDTH - 12px
    const truncatedName = truncateText(ctx, input.projectName || 'Untitled', THUMB_WIDTH - 12);
    ctx.fillText(truncatedName, 6, THUMB_HEIGHT - 6);
    // Position: 6px from left, 6px from bottom
}
```

### Main Generation Function

```typescript
export const generateProjectThumbnail = (input: ThumbnailInput): Promise<string> => {
    return new Promise((resolve) => {
        // Create an off-screen canvas (not visible in the DOM)
        const canvas = document.createElement('canvas');
        canvas.width = THUMB_WIDTH;    // 200px
        canvas.height = THUMB_HEIGHT;  // 140px
        const ctx = canvas.getContext('2d')!;

        // Common finish step: draw overlay then export as JPEG
        const finish = () => {
            drawOverlay(ctx, input);  // Add type badge + project name
            resolve(canvas.toDataURL('image/jpeg', THUMB_QUALITY));
            // ^^ Returns a base64-encoded JPEG string like:
            // "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAA..."
            // JPEG at quality 0.6 is typically 5-15 KB
        };

        if (input.firstPhotoUrl) {
            // --- PHOTO MODE: Draw the first project photo as background ---
            const img = new Image();
            img.onload = () => {
                // "Cover" mode scaling: fill the entire canvas, cropping excess
                // This is the same as CSS "object-fit: cover"
                const scale = Math.max(
                    THUMB_WIDTH / img.width,    // Scale needed to fill width
                    THUMB_HEIGHT / img.height   // Scale needed to fill height
                );
                // ^^ Math.max ensures the image fills BOTH dimensions
                //    (Math.min would be "contain" mode with letterboxing)

                const w = img.width * scale;    // Scaled width (may exceed canvas)
                const h = img.height * scale;   // Scaled height (may exceed canvas)

                // Center the scaled image (negative offsets crop the excess)
                ctx.drawImage(img,
                    (THUMB_WIDTH - w) / 2,   // X offset (negative if wider than canvas)
                    (THUMB_HEIGHT - h) / 2,  // Y offset (negative if taller than canvas)
                    w, h                      // Scaled dimensions
                );
                // Example: 4000x3000 photo (4:3)
                // scale = max(200/4000, 140/3000) = max(0.05, 0.047) = 0.05
                // w = 200, h = 150 => slightly taller than canvas
                // yOffset = (140 - 150) / 2 = -5 (crops 5px top and bottom)

                finish();  // Draw overlay and resolve
            };
            img.onerror = () => {
                // If the image fails to load (corrupted base64), fall back to placeholder
                drawPlaceholder(ctx);
                finish();
            };
            img.src = input.firstPhotoUrl;  // Start loading the base64 image
        } else {
            // --- PLACEHOLDER MODE: No photo available ---
            drawPlaceholder(ctx);  // Gradient + document icon
            finish();               // Draw overlay and resolve
        }
    });
};
```

### When Thumbnails Are Generated (Save Flow in Report Components)

Every report component generates a thumbnail after saving the project to IndexedDB:

```typescript
// Inside addRecentProject() in DfrStandard.tsx (and all other report components)
const addRecentProject = async (): Promise<void> => {
    const timestamp = initialData?.timestamp || Date.now();
    const projectData = { headerData, bodyData, photosData };

    // 1. Save the full project data to IndexedDB
    await storeProject(timestamp, projectData);

    // 2. Generate and save a thumbnail (non-critical, wrapped in try/catch)
    try {
        // Find the first photo that ISN'T a map and HAS an image loaded
        const firstPhoto = projectData.photosData?.find(
            (p: any) => p.imageUrl && !p.isMap
        );
        // ^^ Why skip maps? Maps are typically aerial/satellite images that don't
        //    represent the project well as a preview. Site photos are more meaningful.

        const thumbnail = await generateProjectThumbnail({
            type: 'dfrStandard',                          // Report type for badge
            projectName: headerData.projectName,           // For the name overlay
            firstPhotoUrl: firstPhoto?.imageUrl || null,   // Base64 or null
        });
        await storeThumbnail(timestamp, thumbnail);
        // ^^ Stores the ~10KB JPEG base64 in IndexedDB "thumbnails" store
    } catch (e) {
        console.warn('Failed to generate/store thumbnail:', e);
        // Non-critical: if thumbnail generation fails, the project still saves fine
        // The LandingPage will just show "No preview available" on hover
    }

    // 3. Also delete thumbnails when deleting old projects
    // (happens during cleanup of projects beyond MAX_RECENT_PROJECTS)
    for (const old of removedProjects) {
        await deleteProject(old.timestamp);
        await deleteThumbnail(old.timestamp);  // Clean up the thumbnail too
    }
};
```

### Display Flow (LandingPage.tsx)

```typescript
// --- State ---
const [thumbnails, setThumbnails] = useState<Map<number, string>>(new Map());
// ^^ Map of timestamp -> base64 JPEG string. Keyed by project timestamp (same as IndexedDB key)
const [hoveredTimestamp, setHoveredTimestamp] = useState<number | null>(null);
// ^^ Which project card is currently hovered (null = none)
const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
// ^^ Timeout handle for the 150ms hover debounce

// --- Prefetch all thumbnails on mount ---
useEffect(() => {
    getAllThumbnails()
        .then(thumbMap => setThumbnails(thumbMap))
        .catch(e => console.error("Failed to load thumbnails:", e));
    // ^^ getAllThumbnails() does a single IndexedDB transaction:
    //    1. store.getAllKeys() -> [1706123456789, 1706234567890, ...]
    //    2. store.getAll() -> ["data:image/jpeg;base64,...", "data:image/jpeg;base64,...", ...]
    //    3. Zips them into a Map<number, string>
    //    This is faster than doing N individual get() calls
}, []);

// --- Hover handlers with 150ms debounce ---
const handleMouseEnter = (timestamp: number) => {
    // Don't show tooltip immediately - wait 150ms to avoid flicker
    // when the user is just moving the mouse across the list
    hoverTimeoutRef.current = setTimeout(() => {
        setHoveredTimestamp(timestamp);
    }, 150);
};

const handleMouseLeave = () => {
    // Cancel the pending timeout if the user moves away before 150ms
    if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
    }
    setHoveredTimestamp(null);  // Hide the tooltip
};

// --- JSX: Each project list item ---
<li
    onMouseEnter={() => handleMouseEnter(project.timestamp)}
    onMouseLeave={handleMouseLeave}
    className="relative"  // Required for absolute-positioned tooltip
>
    {/* Project info (name, type badge, etc.) */}
    ...

    {/* Tooltip: appears above the list item when hovered */}
    <ProjectPreviewTooltip
        thumbnailUrl={thumbnails.get(project.timestamp) || null}
        // ^^ Look up this project's thumbnail from the prefetched Map
        visible={
            hoveredTimestamp === project.timestamp &&
            openMenuTimestamp !== project.timestamp
            // ^^ Show tooltip only when hovered AND context menu is NOT open
            // (prevents tooltip from overlapping the right-click menu)
        }
    />
</li>
```

### ProjectPreviewTooltip Component

```tsx
interface ProjectPreviewTooltipProps {
    thumbnailUrl: string | null;  // Base64 JPEG or null if no thumbnail exists
    visible: boolean;              // Whether to show the tooltip
}

const ProjectPreviewTooltip: React.FC<ProjectPreviewTooltipProps> = ({ thumbnailUrl, visible }) => {
    if (!visible) return null;  // Don't render anything when hidden

    return (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
            {/* ^^ Positioning:
                bottom-full = above the parent element
                mb-2 = 8px gap between tooltip and parent
                left-1/2 -translate-x-1/2 = horizontally centered
                z-50 = on top of everything
                pointer-events-none = mouse clicks pass through (doesn't block interaction)
            */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl border
                            border-gray-200 dark:border-gray-600 overflow-hidden">
                {thumbnailUrl ? (
                    <img src={thumbnailUrl} alt="Preview" className="w-[200px] h-[140px]" />
                ) : (
                    <div className="w-[200px] h-[140px] flex items-center justify-center
                                    text-gray-400 dark:text-gray-500 text-sm">
                        No preview available
                    </div>
                )}
            </div>
        </div>
    );
};
```

---

## 24. Settings Modal (SettingsModal.tsx)

A modal accessible via Settings > Preferences (Ctrl+,) or from the application menu.

### How It's Triggered

```typescript
// App.tsx listens for the menu event
const [showSettings, setShowSettings] = useState(false);

useEffect(() => {
    window.electronAPI.onOpenSettings(() => {
        setShowSettings(true);  // Show the modal
    });
    return () => window.electronAPI.removeOpenSettingsListener();
}, []);

// Rendered at the top level, overlaying everything
return (
    <>
        {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
        {/* ... rest of app */}
    </>
);
```

### Features

**1. Spell Check Language Selection**

```tsx
// On mount: Load list of available languages from Chromium's spell checker
useEffect(() => {
    const loadLanguages = async () => {
        // Step 1: Get ALL languages Chromium supports (e.g., en-US, en-CA, fr-FR, es-ES, ...)
        const available = await window.electronAPI.getAvailableSpellCheckLanguages();
        setAvailableLanguages(available.languages);

        // Step 2: Get the CURRENTLY active languages (default: en-US, en-CA)
        const current = await window.electronAPI.getSpellCheckLanguages();
        setSelectedLanguages(current.languages);
    };
    loadLanguages();
}, []);

// When user toggles a language on/off and clicks "Save":
const handleSave = async () => {
    // Tell Electron's main process to update Chromium's spell checker
    await window.electronAPI.setSpellCheckLanguages(selectedLanguages);
    // ^^ This calls session.defaultSession.setSpellCheckerLanguages(languages) in main.js

    // Also persist to localStorage so it survives app restarts
    // (LandingPage reads this on mount and re-applies the setting)
    localStorage.setItem('xtec_spellcheck_languages', JSON.stringify(selectedLanguages));
};
```

### 2. Theme Toggle

Uses `useTheme()` hook to call `toggleTheme()`, which does three things:

- Adds/removes the `dark` class on `<html>`
- Saves to `localStorage('xtec_theme')`
- Tells Electron's native theme via `setThemeSource()`

### 3. Clear Database

Calls `clearDatabase()` from db.ts which empties all three IndexedDB stores (images, projects, thumbnails) in a single transaction. This frees storage space but removes all recent project data.

---

## 25. Utility Components

### SafeImage.tsx

Image component with error fallback. When an image fails to load (e.g., corrupted base64 data, missing file), it shows a placeholder instead of a broken image icon:

```tsx
const SafeImage = ({ src, alt, className }) => {
    const [error, setError] = useState(false);
    // ^^ Tracks whether the image has failed to load

    if (error) {
        // Show a styled fallback with a warning icon
        return (
            <div className="flex items-center justify-center bg-gray-100 dark:bg-gray-700
                            text-gray-400 rounded-lg" style={{ width: '100%', height: '100%' }}>
                <span>Image failed to load</span>
            </div>
        );
    }

    return (
        <img
            src={src}
            alt={alt}
            className={className}
            onError={() => setError(true)}
            // ^^ HTML <img> fires onError when the src is invalid/unreachable
            //    Setting error=true triggers a re-render showing the fallback
        />
    );
};

// Used in LandingPage.tsx to safely render project thumbnails:
// <SafeImage src={thumbnailUrl} alt="Project preview" />
```

### ActionStatusModal.tsx

Reusable modal for showing success/error/info messages after actions. It auto-dismisses or waits for user click:

```tsx
// Props interface
interface ActionStatusModalProps {
    isOpen: boolean;         // Whether the modal is visible
    message: string;         // The message to display
    onClose: () => void;     // Callback when modal is dismissed
    type?: 'success' | 'error' | 'info';  // Controls the icon/color
}

// Usage in report components (after saving a file):
const [showStatusModal, setShowStatusModal] = useState(false);
const [statusMessage, setStatusMessage] = useState('');

// After a successful save:
setStatusMessage('Project saved successfully to: C:\\Users\\...');
setShowStatusModal(true);

// In JSX:
<ActionStatusModal
    isOpen={showStatusModal}
    message={statusMessage}
    onClose={() => setShowStatusModal(false)}
/>
```

### ImageModal.tsx

Fullscreen overlay for viewing photos at their original size. Triggered by clicking the expand button (bottom-right corner) on any photo in PhotoEntry:

```tsx
// The modal takes the full viewport with a dark backdrop
// Click anywhere outside the image (or press Escape) to close

interface ImageModalProps {
    imageUrl: string;       // Base64 data URL of the image to show
    onClose: () => void;    // Called when user clicks backdrop or presses Escape
}

// How it's triggered in PhotoEntry.tsx:
<button
    onClick={(e) => {
        e.stopPropagation();  // Don't trigger the file upload underneath
        onImageClick(data.imageUrl!);
        // ^^ This sets enlargedImageUrl state in the parent report component
    }}
>
    <ArrowsPointingOutIcon className="h-5 w-5" />
</button>

// In the parent component (DfrStandard, PhotoLog, etc.):
const [enlargedImageUrl, setEnlargedImageUrl] = useState<string | null>(null);

{enlargedImageUrl && (
    <ImageModal
        imageUrl={enlargedImageUrl}
        onClose={() => setEnlargedImageUrl(null)}
    />
)}
```

### Assetimage.tsx

Loads images from the `assets/` folder, handling the different paths between development and production:

```tsx
const AssetImage = ({ filename, ...props }) => {
    const [src, setSrc] = useState('');

    useEffect(() => {
        // Ask the main process for the correct path to this asset file
        window.electronAPI.getAssetPath(filename).then(setSrc);
        // ^^ In development: returns "http://localhost:5173/assets/filename.png"
        //    (served by Vite dev server)
        // ^^ In production: returns "file:///C:/Users/.../resources/assets/filename.png"
        //    (packaged in the app's resources folder)
    }, [filename]);

    if (!src) return null;  // Don't render until the path is resolved
    return <img src={src} {...props} />;
};

// Used in the help page and landing page to show example images
// <AssetImage filename="example_screenshot.png" className="w-full rounded" />
```

### xterraLogo.tsx

Contains the X-Terra company logo as an inline base64-encoded PNG. This allows the logo to be embedded directly into PDF documents without any network requests or file system access:

```typescript
// The logo is a ~15KB PNG encoded as a base64 data URL
// It's defined as a constant function so it's only loaded into memory when called
export const getXterraLogoBase64 = (): string => {
    return 'data:image/png;base64,iVBORw0KGgo...';
    // ^^ Very long base64 string (~20,000 characters)
    // This is the white X-Terra logo used in PDF headers
};

// Used in PDF generation:
// doc.addImage(getXterraLogoBase64(), 'PNG', x, y, width, height);
```

### SpecialCharacterPalette.tsx

A dropdown palette of special characters commonly needed in environmental reports. Characters include:

- Degree symbol (°) — for temperature readings
- Fractions (½, ¼, ¾) — for measurements
- Arrows (→, ←, ↑, ↓) — for directions
- Math symbols (±, ×, ÷) — for calculations
- Subscript/superscript numbers — for chemical formulas (CO₂, H₂O)

When a character is clicked, it's inserted at the cursor position in the active text field.

---

## 26. Data Flow Diagrams

### Project Save to File

```
User clicks "Save Project" (or Ctrl+S)
    |
    v
addRecentProject()
    |
    +--> Build projectData = { headerData, bodyData, photosData }
    |
    +--> storeProject(timestamp, projectData)     --> IndexedDB "projects" store
    |
    +--> generateProjectThumbnail(...)            --> Canvas-based thumbnail
    |     storeThumbnail(timestamp, thumbnail)    --> IndexedDB "thumbnails" store
    |
    +--> Update localStorage "xtec_recent_projects" array
    |
    +--> Clean up old projects beyond MAX_RECENT_PROJECTS limit
    |
    +--> setIsDirty(false)

User clicks "Save Project" button in toolbar
    |
    v
handleSaveProject()
    |
    +--> addRecentProject()  (as above)
    |
    +--> Build file data string
    |
    +--> window.electronAPI.saveProject(jsonString, defaultFilePath)
    |       |
    |       v
    |   preload.js --> ipcRenderer.invoke("save-project")
    |       |
    |       v
    |   main.js --> dialog.showSaveDialog() --> fs.writeFileSync()
    |
    +--> Show success modal with file path
```

### Project Load from File

```
User clicks "Open Project" (or double-clicks .dfr file)
    |
    v
App.tsx: loadProjectFromFileContent(content, path)
    |
    +--> JSON.parse(content)
    |
    +--> Determine type from file extension
    |       .dfr  --> 'dfrStandard'
    |       .spdfr --> 'dfrSaskpower'
    |       .plog  --> 'photoLog'
    |       .clog  --> 'combinedLog'
    |
    +--> setProjectToOpen(projectData)
    +--> setSelectedApp(type)
    |
    v
DfrStandard/DfrSaskpower/PhotoLog/CombinedLog component mounts
    |
    +--> useEffect detects initialData !== null
    |
    +--> parseAndLoadProject(JSON.stringify(initialData))
    |       |
    |       +--> Check for migration needs (old format -> new format)
    |       |
    |       +--> setHeaderData(loaded header)
    |       +--> setBodyData(loaded body, possibly migrated)
    |       +--> setPhotosData(loaded photos)
    |       |
    |       +--> If migrated: show migration notice modal
```

### PDF Export

```
User clicks "Export PDF" (or Ctrl+E)
    |
    v
handleDownloadPdf()
    |
    +--> validateReport()
    |       |
    |       +--> Check required fields
    |       +--> If invalid: show error modal, return
    |
    +--> Create jsPDF instance (Letter size, mm units)
    |
    +--> Draw header (logo, fields, horizontal rules)
    |
    +--> Draw body sections (each field with teal section headers)
    |       |
    |       +--> splitTextToSize() wraps text to page width
    |       +--> If text overflows page: doc.addPage() + redraw header
    |
    +--> Draw photo log pages (drawPhotoLogSection)
    |       |
    |       +--> Separate photos and maps
    |       +--> 2 photos per page
    |       +--> Full-page maps at the end
    |
    +--> doc.output('blob') --> URL.createObjectURL()
    |
    +--> Show PdfCanvasPreview modal
    |       |
    |       User clicks "Save PDF"
    |       |
    |       v
    |       window.electronAPI.savePdf(arrayBuffer, filename)
    |           --> dialog.showSaveDialog() --> fs.writeFileSync()
```

### Comment Lifecycle

```
User selects text in BulletPointEditor
    |
    +--> Clicks "..." menu --> "Add comment..."
    |
    +--> Types comment text, presses Enter
    |
    v
BulletPointEditor: Creates TextComment {id, start, end, text, author, timestamp, resolved: false}
    |
    +--> onInlineCommentsChange([...existing, newComment])
    |
    v
DfrStandard: handleInlineCommentsChange (or setFieldComments for location activities)
    |
    +--> Updates bodyData.inlineComments[fieldId] (or locationActivity.inlineComments.activities)
    |
    +--> allComments useMemo recalculates: collects from all body fields + all location activities
    |
    +--> CommentsRail receives updated comments array
    |
    v
CommentsRail: Shows comment card with author, text, timestamp
    |
    +--> User can: Reply, Edit, Resolve, Delete, Find in text
    |
    +--> Resolve: toggles comment.resolved (hides underline in text)
    +--> Delete: filters comment from array
    +--> Reply: adds CommentReply to comment.replies array
    +--> Find: scrolls to comment underline in text (scrollIntoView)
```

---

## 27. Security Measures

### Electron Security

1. **`contextIsolation: true`** - Renderer and preload run in separate JavaScript contexts
2. **`nodeIntegration: false`** - Renderer cannot access Node.js APIs directly
3. **`contextBridge`** - Only explicitly exposed functions are available to the renderer
4. **Single-instance lock** - Prevents multiple instances from corrupting data

### File Operation Security

```javascript
// Allowlist of permitted file extensions
const ALLOWED_EXTENSIONS = ['.dfr', '.spdfr', '.plog', '.clog', '.iogc', '.json'];

// Every file read is validated:
ipcMain.handle('read-file', async (event, filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
        console.error(`Blocked attempt to read unauthorized file type: ${filePath}`);
        return { success: false, error: 'Unauthorized file type.' };
    }
    // ... proceed with read
});
```

### PDF Opening Security

```javascript
// Only specific PDF filenames can be opened
const allowedPdfs = ['Example_DFR.pdf', 'Example_DFR_Monitoring.pdf', ...];

ipcMain.handle('open-pdf', async (event, filename) => {
    if (!allowedPdfs.includes(filename)) {
        dialog.showErrorBox('Error', 'The requested file is not a valid example document.');
        return;
    }
    // Path traversal prevention
    const pdfPath = path.normalize(path.join(assetsDir, filename));
    if (!pdfPath.startsWith(assetsDir)) {
        console.error('Path traversal attempt detected');
        return;
    }
});
```

### External Link Security

```javascript
// Only HTTPS links can be opened externally
mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) {
        shell.openExternal(url);
    }
    return { action: 'deny' };  // All new windows are blocked
});
```

---

## 28. Key Patterns & Conventions

### State Management Pattern

The app uses **local component state** (useState) rather than a global store like Redux. Each report component manages its own data independently:

```tsx
const [headerData, setHeaderData] = useState<DfrHeaderData>({...});
const [bodyData, setBodyData] = useState<DfrStandardBodyData>({...});
const [photosData, setPhotosData] = useState<PhotoData[]>([]);
```

**Why this works:** Each report is a self-contained page. There's no need for cross-component data sharing (the landing page and report never render simultaneously).

### Dirty Tracking Pattern

Every data mutation sets a dirty flag:

```tsx
const handleChange = (field, value) => {
    setData(prev => ({...prev, [field]: value}));
    setIsDirty(true);  // Always paired with data changes
};

// isDirty is checked when:
// 1. User tries to close the window
// 2. User tries to navigate back to the landing page
// 3. Before allowing navigation away
```

### Auto-Numbering Pattern

Photos and location activities use auto-incrementing IDs and display numbers:

```tsx
// New ID = max existing ID + 1
const newId = photosData.length > 0 ? Math.max(...photosData.map(p => p.id)) + 1 : 1;

// Display number is recalculated after every add/remove/reorder
const renumberPhotos = (photos: PhotoData[]): PhotoData[] => {
    let photoCount = 0;
    let mapCount = 0;
    return photos.map(p => ({
        ...p,
        photoNumber: p.isMap ? String(++mapCount) : String(++photoCount),
    }));
};
```

### Migration Pattern

Old project formats are automatically converted when loaded:

```tsx
// Check for old format
if (loadedText && !loadedBody) {
    // Convert DfrTextData -> DfrStandardBodyData
    migrationOccurred = true;
}

// Show notice to user
if (migrationOccurred) {
    setShowMigrationNotice(true);
}
```

### IPC Listener Cleanup Pattern

Every IPC listener registered in `useEffect` is cleaned up on unmount to prevent memory leaks:

```tsx
useEffect(() => {
    window.electronAPI.onSaveProjectShortcut(handleSave);
    window.electronAPI.onExportPdfShortcut(handleExport);

    return () => {
        window.electronAPI.removeSaveProjectShortcutListener();
        window.electronAPI.removeExportPdfShortcutListener();
    };
}, [dependencies]);
```

### CSS Pattern: Tailwind + Dark Mode

All components use Tailwind utility classes with dark variants:

```html
<!-- Light: white bg, dark gray text -->
<!-- Dark: dark gray bg, light text -->
<div className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                border border-gray-200 dark:border-gray-700
                hover:bg-gray-50 dark:hover:bg-gray-700
                transition-colors duration-200">
```

The brand color `#007D8C` (X-Terra teal) is used for:

- Interactive elements (links, buttons, borders on focus)
- Section headers in PDFs
- Icon colors for report-type badges
- The `xterra-teal` Tailwind utility: `text-xterra-teal`, `bg-xterra-teal`

---

*This document covers the complete codebase as of version 1.1.4. For questions or updates, refer to the source files directly.*
