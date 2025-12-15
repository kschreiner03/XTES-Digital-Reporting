
# X-TES Digital Reporting


**X-TES Digital Reporting** is a specialized desktop application designed for X-Terra Environmental Services. It streamlines the creation, management, and export of environmental monitoring reports, including Daily Field Reports (DFRs) and Photographic Logs.

Built with **Electron**, **React**, and **TypeScript**, this application replaces manual Word/Excel workflows with a structured, validated, and offline-capable digital interface.

---

## 🚀 Key Features

*   **Multiple Report Types:**
    *   **Photographic Log:** Simple, photo-centric reports.
    *   **Standard DFR:** Comprehensive daily field reports with activity logs and location-specific tracking.
    *   **SaskPower DFR:** Tailored specifically for SaskPower requirements, including safety checklists.
    *   **Combined Logs:** Merge photos from multiple project files into a single master log.
    *   **IOGC Lease Audit:** (Beta) specialized audit forms.
*   **Offline Capability:** Fully functional without an internet connection. Projects are stored locally using IndexedDB.
*   **Smart Image Handling:**
    *   Automatic image cropping to 4:3 aspect ratio.
    *   Drag-and-drop support.
    *   Integrated photo resizing to ensure manageable PDF file sizes.
    *   Export all photos + metadata to a ZIP file.
*   **PDF Generation:** Client-side PDF generation using `jspdf`. No server required.
*   **Custom File Formats:** Saves editable project files (`.dfr`, `.plog`, `.spdfr`, `.clog`) for future revisions.
*   **Dark Mode:** Native support for light and dark themes based on system preference or user toggle.

---

## 🛠️ Technology Stack

*   **Core:** [Electron](https://www.electronjs.org/), [React](https://react.dev/), [TypeScript](https://www.typescriptlang.org/)
*   **Build Tool:** [Vite](https://vitejs.dev/)
*   **Styling:** [Tailwind CSS](https://tailwindcss.com/)
*   **Persistence:** [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) (via `idb`)
*   **PDF Generation:** [jsPDF](https://github.com/parallax/jsPDF)
*   **Packaging:** [Electron Forge](https://www.electronforge.io/)

---

## 💻 Development Setup

To run this project locally for development:

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/kschreiner03/XTES-Digital-Reporting.git
    cd XTES-Digital-Reporting
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Start the development server:**
    This launches the Electron app with Hot Module Replacement (HMR).
    ```bash
    npm start
    ```

---

## 📦 Building & Packaging

To create a distributable installer (exe/setup) for Windows:

```bash
npm run make
```

This will generate the output in the `out/` directory. The build configuration is handled in `forge.config.js`.

**Note:** The build process automatically copies assets from `public/assets` to the packaged resources folder to ensure images and templates are available in the production build.

---

## 📂 File Formats

The application uses custom JSON-based file extensions to associate specific report types with the application:

| Extension | Report Type | Description |
| :--- | :--- | :--- |
| **.plog** | Photographic Log | Basic photo log with header data. |
| **.dfr** | Standard DFR | Daily Field Report with general and location-specific activities. |
| **.spdfr** | SaskPower DFR | DFR with specific safety checklists and single-block activity logs. |
| **.clog** | Combined Log | Aggregated photos from multiple source files. |
| **.iogc** | IOGC Audit | Lease audit checklist and photo log. |

---

## 🏗️ Project Structure

The project follows a standard Electron Forge + Vite template structure, separating the Main process (Node.js) from the Renderer process (React).

### 📁 Root Directory
*   **`main.js`**: **(Electron Main Process)** The entry point of the application. It runs in a Node.js environment and is responsible for:
    *   Creating and managing application windows (`BrowserWindow`).
    *   Handling system events (app ready, window closed).
    *   Interacting with the operating system (File System access via `fs`, Native Dialogs).
    *   Handling IPC (Inter-Process Communication) messages from the frontend (e.g., `save-project`, `generate-pdf`).
    *   Managing Auto-Updates.
*   **`preload.js`**: **(Preload Script)** Runs before the renderer process is loaded. It acts as a secure bridge, exposing specific, limited capabilities from `main.js` to the frontend via `contextBridge`. This prevents the frontend from having full, unsafe access to Node.js APIs.
*   **`App.tsx`**: **(React Entry)** The main React component that acts as the router. It manages the state for which "Sub-App" (Photo Log, DFR, etc.) is currently active and handles the switching logic.
*   **`types.ts`**: Contains all TypeScript interfaces and type definitions used across the application to ensure type safety for data structures like `HeaderData`, `PhotoData`, and report-specific schemas.

### 📁 components/
This directory contains all React components, split into generic UI elements and specific report logic.

#### Report Modules
These components are the "pages" of the application. Each contains its own state management, validation logic, and PDF generation code.
*   **`PhotoLog.tsx`**: Logic for the standard Photographic Log report.
*   **`DfrStandard.tsx`**: Logic for the comprehensive Daily Field Report.
*   **`DfrSaskpower.tsx`**: Specialized logic for SaskPower specific DFRs, including safety checklists.
*   **`CombinedLog.tsx`**: Logic for merging multiple existing project files into one master photo log.
*   **`IogcLeaseAudit.tsx`**: Logic for the IOGC Lease Audit form.
*   **`LandingPage.tsx`**: The dashboard displayed on startup, listing recent projects and entry points for new reports.

#### Shared UI Components
*   **`Header.tsx` / `DfrHeader.tsx`**: Reusable header forms for report metadata (Client, Location, Date).
*   **`PhotoEntry.tsx`**: The complex component handling individual photo uploads, data entry, drag-and-drop, and reordering.
*   **`SafeImage.tsx`**: A wrapper for `<img>` tags that handles safe file protocol loading in Electron production builds.
*   **`BulletPointEditor.tsx`**: A specialized textarea that handles automatic bullet point insertion and indentation behavior.
*   **`ImageModal.tsx`**: Full-screen preview modal for uploaded images.
*   **`SettingsModal.tsx`**: UI for application preferences and data management.

#### Utilities
*   **`db.ts`**: A wrapper around **IndexedDB** using the `idb` library. It handles the offline storage of large image blobs and project states, enabling the "Recent Projects" feature without bloating `localStorage`.
*   **`ThemeContext.tsx`**: Manages the application's light/dark mode state.
*   **`SpecialCharacterPalette.tsx`**: A floating utility for inserting symbols (°, µ, etc.).

### 📁 public/assets/
Static assets that are copied to the build output.
*   **Icons**: `.ico` files for Windows installers and file associations.
*   **Images**: Logos (`xterra-logo.jpg`) and background images.
*   **Help**: `help.html` and associated SOP documents.

### ⚙️ Configuration Files
*   **`forge.config.js`**: Configuration for **Electron Forge**. Defines how the app is packaged (into `.exe`), which assets are included, and sets up file associations (e.g., opening `.dfr` files launches the app).
*   **`vite.config.ts`**: Configuration for **Vite**, the build tool. Handles compiling React, TypeScript, and HMR (Hot Module Replacement) during development.
*   **`tailwind.config.js`**: Configuration for **Tailwind CSS**, defining the color palette (including the custom X-Terra teal `#007D8C`) and dark mode settings.

---

## 📝 License

Proprietary software developed for **X-Terra Environmental Services Ltd**.
