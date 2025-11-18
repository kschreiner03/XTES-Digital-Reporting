// This file uses the 'idb' library, which is loaded via a script tag in index.html.
// It provides a Promise-based API for IndexedDB.
declare const idb: any;

let dbPromise: Promise<any> | null = null;

const DB_NAME = 'XtecProjectsDB';
const IMAGE_STORE_NAME = 'images';
const PROJECT_STORE_NAME = 'projects';

const initDB = () => {
  if (!dbPromise) {
    dbPromise = idb.openDB(DB_NAME, 2, {
      upgrade(db: any, oldVersion: number) {
        if (!db.objectStoreNames.contains(IMAGE_STORE_NAME)) {
          db.createObjectStore(IMAGE_STORE_NAME);
        }
        if (oldVersion < 2) {
            if (!db.objectStoreNames.contains(PROJECT_STORE_NAME)) {
                db.createObjectStore(PROJECT_STORE_NAME);
            }
        }
      },
    });
  }
  return dbPromise;
};

/**
 * Stores image data (base64 string) in IndexedDB.
 * @param id A unique key for the image.
 * @param imageData The base64 string of the image.
 */
export const storeImage = async (id: string, imageData: string): Promise<void> => {
  const db = await initDB();
  await db.put(IMAGE_STORE_NAME, imageData, id);
};

/**
 * Retrieves image data from IndexedDB.
 * @param id The unique key of the image to retrieve.
 * @returns The base64 string of the image, or undefined if not found.
 */
export const retrieveImage = async (id: string): Promise<string | undefined> => {
  const db = await initDB();
  return db.get(IMAGE_STORE_NAME, id);
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
  await db.put(PROJECT_STORE_NAME, projectData, id);
};

/**
 * Retrieves a project object from IndexedDB.
 * @param id The unique timestamp key of the project.
 * @returns The project data object, or undefined if not found.
 */
export const retrieveProject = async (id: number): Promise<any | undefined> => {
  const db = await initDB();
  return db.get(PROJECT_STORE_NAME, id);
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
 * Clears all data from the database stores.
 * Used for freeing up storage space.
 */
export const clearDatabase = async (): Promise<void> => {
    const db = await initDB();
    const tx = db.transaction([IMAGE_STORE_NAME, PROJECT_STORE_NAME], 'readwrite');
    await Promise.all([
        tx.objectStore(IMAGE_STORE_NAME).clear(),
        tx.objectStore(PROJECT_STORE_NAME).clear(),
        tx.done
    ]);
};