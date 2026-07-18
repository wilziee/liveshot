// storage.js
class StorageSystem {
    constructor() {
        this.dbName = 'LiveShotDB';
        this.dbVersion = 1;
        this.db = null;
    }

    init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onupgradeneeded = (e) => {
                this.db = e.target.result;
                if (!this.db.objectStoreNames.contains('shots')) {
                    this.db.createObjectStore('shots', { keyPath: 'id' });
                }
            };

            request.onsuccess = (e) => {
                this.db = e.target.result;
                resolve();
            };

            request.onerror = (e) => reject(e);
        });
    }

    async saveShot(data) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['shots'], 'readwrite');
            const store = transaction.objectStore('shots');
            const request = store.add(data);
            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e);
        });
    }

    async getAllShots() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['shots'], 'readonly');
            const store = transaction.objectStore('shots');
            const request = store.getAll();
            request.onsuccess = () => {
                // Urutkan dari yang terbaru
                resolve(request.result.sort((a, b) => b.id - a.id));
            };
            request.onerror = (e) => reject(e);
        });
    }
}

const storage = new StorageSystem();
