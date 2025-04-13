import { Shortcut, keyboardShortcuts } from '@/config/shortcuts';

const DB_NAME = 'hotkeysDB';
const STORE_NAME = 'hotkeys';
const DB_VERSION = 1;

const syncWithServer = async (shortcuts: Shortcut[]) => {
  try {
    await fetch('/api/v1/hotkeys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(shortcuts),
    });
  } catch (error) {
    console.error('Failed to sync hotkeys with server:', error);
  }
};

class HotkeysDB {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        this.initializeDefaultShortcuts().catch(console.error);
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        // Delete old store if it exists
        if (db.objectStoreNames.contains(STORE_NAME)) {
          db.deleteObjectStore(STORE_NAME);
        }
        // Create new store with id as keyPath
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      };

      // Load hotkeys from server
      fetch('/api/v1/hotkeys')
        .then((response) => response.json())
        .then((serverHotkeys: Shortcut[]) => {
          if (serverHotkeys.length > 0) {
            // Save server hotkeys to IndexedDB
            serverHotkeys.forEach((shortcut) => {
              this.saveHotkey(shortcut).catch(console.error);
            });
          }
        })
        .catch((error) => {
          console.error('Failed to load hotkeys from server:', error);
        });
    });
  }

  private async initializeDefaultShortcuts(): Promise<void> {
    // Get all existing shortcuts from IndexedDB
    const existingShortcuts = await this.getAllHotkeys();
    const existingActions = new Set(existingShortcuts.map((s) => s.action));

    // Save any default shortcuts that don't exist in IndexedDB
    const defaultShortcutsToSave = keyboardShortcuts.filter(
      (shortcut) => !existingActions.has(shortcut.action),
    );

    if (defaultShortcutsToSave.length > 0) {
      // Save all shortcuts at once
      const allShortcuts = [...existingShortcuts, ...defaultShortcutsToSave];
      await this.saveAllHotkeys(allShortcuts);

      // Sync with server
      await syncWithServer(allShortcuts);
    }
  }

  async saveHotkey(shortcut: Shortcut): Promise<void> {
    const allHotkeys = await this.getAllHotkeys();
    const updatedHotkeys = allHotkeys.map((s) => (s.action === shortcut.action ? shortcut : s));

    if (!allHotkeys.some((s) => s.action === shortcut.action)) {
      updatedHotkeys.push(shortcut);
    }

    await this.saveAllHotkeys(updatedHotkeys);
    await syncWithServer(updatedHotkeys);
  }

  async getHotkey(action: string): Promise<Shortcut | undefined> {
    const allHotkeys = await this.getAllHotkeys();
    return allHotkeys.find((s) => s.action === action);
  }

  async getAllHotkeys(): Promise<Shortcut[]> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get('shortcuts');

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const data = request.result;
        return resolve(data ? data.shortcuts : []);
      };
    });
  }

  private async saveAllHotkeys(shortcuts: Shortcut[]): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put({ id: 'shortcuts', shortcuts });

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }
}

export const hotkeysDB = new HotkeysDB();
