// storage.js - IndexedDB wrapper
window.StorageDB = (() => {
    const DB_NAME = 'XAERISOFT_DB';
    const DB_VERSION = 1;
    const STORE_NAME = 'liveshots';
    let db;

    const init = () => {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = (e) => reject('IndexedDB error: ' + e.target.error);
            request.onsuccess = (e) => { db = e.target.result; resolve(true); };
            request.onupgradeneeded = (e) => {
                let tempDb = e.target.result;
                if (!tempDb.objectStoreNames.contains(STORE_NAME)) {
                    tempDb.createObjectStore(STORE_NAME, { keyPath: 'id' });
                }
            };
        });
    };

    const saveLiveShot = (id, photoBlob, videoBlob, metadata) => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_NAME], 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const item = { id, photoBlob, videoBlob, timestamp: Date.now(), ...metadata };
            store.add(item);
            tx.oncomplete = () => resolve(item);
            tx.onerror = () => reject(tx.error);
        });
    };

    const getAllLiveShots = () => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_NAME], 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result.sort((a,b) => b.timestamp - a.timestamp));
            request.onerror = () => reject(request.error);
        });
    };

    return { init, saveLiveShot, getAllLiveShots };
})();
