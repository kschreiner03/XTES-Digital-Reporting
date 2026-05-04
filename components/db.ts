import { openDB } from 'idb';
import { perfTime } from './perf';

let dbPromise: Promise<any> | null = null;

const DB_NAME = 'XtecProjectsDB';
const IMAGE_STORE_NAME = 'images';
const PROJECT_STORE_NAME = 'projects';
const THUMBNAIL_STORE_NAME = 'thumbnails';

function dataUrlToBlob(dataUrl: string): Blob {
    const [header, data] = dataUrl.split(',');
    const mime = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg';
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
}

const initDB = () => {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 3, {
      upgrade(db: any, oldVersion: number) {
        if (!db.objectStoreNames.contains(IMAGE_STORE_NAME)) {
          db.createObjectStore(IMAGE_STORE_NAME);
        }
        if (oldVersion < 2) {
            if (!db.objectStoreNames.contains(PROJECT_STORE_NAME)) {
                db.createObjectStore(PROJECT_STORE_NAME);
            }
        }
        if (oldVersion < 3) {
            if (!db.objectStoreNames.contains(THUMBNAIL_STORE_NAME)) {
                db.createObjectStore(THUMBNAIL_STORE_NAME);
            }
        }
      },
    });
  }
  return dbPromise;
};

export const storeImage = async (id: string, imageData: string): Promise<void> => {
    const db = await initDB();
    const blob = dataUrlToBlob(imageData);
    await perfTime('DB storeImage', () => db.put(IMAGE_STORE_NAME, blob, id));
};

export const retrieveImage = async (id: string): Promise<string | undefined> => {
    const db = await initDB();
    const stored = await perfTime('DB retrieveImage', () => db.get(IMAGE_STORE_NAME, id));
    if (!stored) return undefined;
    // Legacy: old saves stored raw base64 strings — return as-is
    if (typeof stored === 'string') return stored;
    // New: stored as Blob — create a lightweight object URL
    return URL.createObjectURL(stored);
};

export const revokeImageUrl = (url: string): void => {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
};

/**
 * Deletes an image from IndexedDB.
 * @param id The unique key of the image to delete.
 */
export const deleteImage = async (id: string): Promise<void> => {
    const db = await initDB();
    await db.delete(IMAGE_STORE_NAME, id);
};

/**
 * Stores a project object in IndexedDB.
 * @param id The unique timestamp key for the project.
 * @param projectData The full project data object.
 */
export const storeProject = async (id: number, projectData: object): Promise<void> => {
  const db = await initDB();
  await perfTime('DB storeProject', () => db.put(PROJECT_STORE_NAME, projectData, id));
};

/**
 * Retrieves a project object from IndexedDB.
 * @param id The unique timestamp key of the project.
 * @returns The project data object, or undefined if not found.
 */
export const retrieveProject = async (id: number): Promise<any | undefined> => {
  const db = await initDB();
  return perfTime('DB retrieveProject', () => db.get(PROJECT_STORE_NAME, id));
};

/**
 * Deletes a project from IndexedDB.
 * @param id The unique timestamp key of the project to delete.
 */
export const deleteProject = async (id: number): Promise<void> => {
    const db = await initDB();
    await db.delete(PROJECT_STORE_NAME, id);
};

/**
 * Stores a thumbnail image for a project by its ID.
 */
export const storeThumbnail = async (id: number, thumbnailData: string): Promise<void> => {
    const db = await initDB();
    await db.put(THUMBNAIL_STORE_NAME, thumbnailData, id);
};

export const retrieveThumbnail = async (id: number): Promise<string | undefined> => {
    const db = await initDB();
    return db.get(THUMBNAIL_STORE_NAME, id);
};

export const deleteThumbnail = async (id: number): Promise<void> => {
    const db = await initDB();
    await db.delete(THUMBNAIL_STORE_NAME, id);
};

export const getAllThumbnails = async (): Promise<Map<number, string>> => {
    const db = await initDB();
    const tx = db.transaction(THUMBNAIL_STORE_NAME, 'readonly');
    const store = tx.objectStore(THUMBNAIL_STORE_NAME);
    const keys = await store.getAllKeys();
    const values = await store.getAll();
    const map = new Map<number, string>();
    keys.forEach((key: number, i: number) => {
        map.set(key, values[i]);
    });
    return map;
};

export const getAllProjectKeys = async (): Promise<number[]> => {
    const db = await initDB();
    return db.getAllKeys(PROJECT_STORE_NAME);
};

export const clearDatabase = async (): Promise<void> => {
    const db = await initDB();
    const tx = db.transaction([IMAGE_STORE_NAME, PROJECT_STORE_NAME, THUMBNAIL_STORE_NAME], 'readwrite');
    await Promise.all([
        tx.objectStore(IMAGE_STORE_NAME).clear(),
        tx.objectStore(PROJECT_STORE_NAME).clear(),
        tx.objectStore(THUMBNAIL_STORE_NAME).clear(),
        tx.done
    ]);
};
