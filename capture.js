// capture.js - The Shutter Engine
window.CaptureManager = (() => {
    const canvas = document.getElementById('photo-canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let isCapturing = false;

    // --- FITUR BONUS: Deteksi Kualitas Frame Dasar ---
    const calculateBlur = (imageData) => {
        // Algoritma simulasi deteksi blur sederhana (Laplacian variance detection stubs)
        // Dalam implementasi nyata, kita menggunakan WebWorker agar UI tidak lag.
        return true; // Asumsikan selalu tajam untuk demo ini
    };

    const takeLiveShot = async () => {
        if (isCapturing) return;
        isCapturing = true;
        document.body.classList.add('is-capturing');

        // 1. EFEK FLASH UI
        const flash = document.getElementById('flash-overlay');
        flash.classList.add('flash-active');
        setTimeout(() => flash.classList.remove('flash-active'), 300);

        // 2. CAPTURE HIGH-RES PHOTO
        const video = window.CameraManager.getVideoElement();
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Dapatkan Foto dalam bentuk Blob
        const photoBlob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 1.0));

        // 3. AMBIL BUFFER VIDEO (SEBELUM)
        let preChunks = window.BufferManager.extractBuffer();

        // 4. LANJUT REKAM VIDEO (SESUDAH) - Tunggu 2 Detik
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Ambil sisa buffer yang terekam selama 2 detik penantian di atas
        let postChunks = window.BufferManager.extractBuffer(); 
        
        // 5. GABUNGKAN CHUNKS (LiveShot Video)
        // Karena MediaRecorder berjalan terus, chunk ini linear dan valid disatukan
        let allChunks = [...new Set([...preChunks, ...postChunks])]; // Hindari duplikasi referensi
        const videoBlob = new Blob(allChunks, { type: 'video/webm' });

        // 6. SIMPAN KE INDEXEDDB
        const shotId = 'LIVESHOT_' + Date.now();
        await window.StorageDB.saveLiveShot(shotId, photoBlob, videoBlob, {
            width: canvas.width,
            height: canvas.height,
            isHDRSimulated: true
        });

        // Update UI
        document.body.classList.remove('is-capturing');
        isCapturing = false;
        
        // Update Thumbnail Gallery
        const thumbUrl = URL.createObjectURL(photoBlob);
        document.getElementById('btn-gallery').style.backgroundImage = `url(${thumbUrl})`;
        document.getElementById('btn-gallery').style.backgroundSize = 'cover';

        console.log(`✅ LiveShot Disimpan: ${shotId}`);
    };

    return { takeLiveShot };
})();
