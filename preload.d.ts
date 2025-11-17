// This file is not used in the web application version.
export interface IElectronAPI {
    saveProject: (data: string, defaultPath: string) => Promise<{ success: boolean; path?: string; error?: string }>,
    loadProject: (fileType: 'plog' | 'dfr' | 'spdfr' | 'clog') => Promise<string | null>,
    loadMultipleProjects: () => Promise<{ success: boolean; data?: string[]; error?: string }>,
    savePdf: (defaultPath: string) => Promise<{ success: boolean; path?: string; error?: string }>,
    readFile: (filePath: string) => Promise<{ success: boolean; data?: string; path?: string; error?: string }>,
    onOpenFile: (callback: (filePath: string) => void) => void,
    onDownloadPhotos: (callback: () => void) => void,
    removeDownloadPhotosListener: (callback: () => void) => void,
    removeAllDownloadPhotosListeners: () => void,
    saveZipFile: (data: ArrayBuffer, defaultPath: string) => Promise<{ success: boolean; path?: string; error?: string }>,
    onUpdateAvailable: (callback: () => void) => void,
    removeUpdateAvailableListener: () => void,
}

declare global {
    interface Window {
        electronAPI: IElectronAPI
    }
}
export {};