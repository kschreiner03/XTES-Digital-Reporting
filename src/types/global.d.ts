export interface IElectronAPI {
    saveProject: (data: string, defaultPath: string) => Promise<{ success: boolean; path?: string; error?: string }>;
    loadProject: (fileType: 'plog' | 'dfr' | 'spdfr' | 'clog' | 'iogc') => Promise<string | null>;
    loadMultipleProjects: () => Promise<{ success: boolean; data?: string[]; error?: string }>;
    savePdf: (data: ArrayBuffer, defaultPath: string) => Promise<{ success: boolean; path?: string; error?: string }>;
    readFile: (filePath: string) => Promise<{ success: boolean; data?: string; path?: string; error?: string }>;
    onOpenFile: (callback: (filePath: string) => void) => void;
    onDownloadPhotos: (callback: () => void) => void;
    removeDownloadPhotosListener: (callback: () => void) => void;
    removeAllDownloadPhotosListeners: () => void;
    saveZipFile: (data: ArrayBuffer, defaultPath: string) => Promise<{ success: boolean; path?: string; error?: string }>;
    onUpdateAvailable: (callback: () => void) => void;
    removeUpdateAvailableListener: () => void;
    onUpdateDownloaded: (callback: () => void) => void;
    removeUpdateDownloadedListener: () => void;
    installUpdateNow: () => void;
    installUpdateLater: () => void;
    onOpenSettings: (callback: () => void) => void;
    removeOpenSettingsListener: () => void;
    getAssetPath: (filename: string) => Promise<string>;
    setThemeSource: (theme: 'system' | 'light' | 'dark') => Promise<void>;

    // Keyboard shortcut listeners
    onSaveProjectShortcut: (callback: () => void) => void;
    removeSaveProjectShortcutListener: () => void;
    onExportPdfShortcut: (callback: () => void) => void;
    removeExportPdfShortcutListener: () => void;

    // Spell check
    setSpellCheckLanguages: (languages: string[]) => Promise<{ success: boolean; languages?: string[]; error?: string }>;
    getSpellCheckLanguages: () => Promise<{ success: boolean; languages?: string[]; error?: string }>;
    getAvailableSpellCheckLanguages: () => Promise<{ success: boolean; languages?: string[]; error?: string }>;

    // Window close intercept
    onCloseAttempted: (callback: () => void) => void;
    removeCloseAttemptedListener: () => void;
    confirmClose: () => void;

    // User info
    getUserInfo: () => { username: string; homedir: string };
}

declare global {
    interface Window {
        electronAPI: IElectronAPI;
        helpAPI?: {
            openPdf: (filename: string) => Promise<void>;
            getAssetPath: (filename: string) => Promise<string>;
        };
    }
}


declare module "*.css";
declare module "*.scss";
declare module "*.sass";
declare module "*.less";

declare module "*?url" {
  const src: string;
  export default src;
}
