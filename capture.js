// capture.js
class CaptureSystem {
    constructor() {
        this.flashElement = document.getElementById('flash-overlay');
        this.shutterSound = new Audio('https://www.soundjay.com/camera/sounds/camera-shutter-click-01.mp3'); // Simulasi
    }

    triggerFlash() {
        this.flashElement.style.opacity = '1';
        this.flashElement.style.transition = 'none';
        
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                this.flashElement.style.transition = 'opacity 0.4s ease-out';
                this.flashElement.style.opacity = '0';
            });
        });
    }

    async takeLiveShot() {
        if (!camera.currentStream) return;

        // 1. Animasi & Suara Shutter
        this.triggerFlash();
        this.shutterSound.play().catch(e => {}); // Ignore autoplay error

        // 2. Ambil Foto Resolusi Tinggi via Canvas
        const video = camera.videoElement;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Simpan foto sebagai Base64 WebP (lebih efisien)
        const photoDataUrl = canvas.toDataURL('image/webp', 0.9);

        // 3. TUNGGU 2 detik agar kamera merekam masa depan
        document.querySelector('.live-indicator').style.color = "red"; // Indikator merekam
        await new Promise(resolve => setTimeout(resolve, 2000));
        document.querySelector('.live-indicator').style.color = "var(--accent)";

        // 4. Ambil semua buffer (yang berisi 2-3 detik SEBELUM dan 2 detik SESUDAH shutter)
        const videoBlob = await liveBuffer.getCompiledBlob();

        // 5. Simpan ke Database
        const shotData = {
            id: Date.now(),
            date: new Date().toISOString(),
            photo: photoDataUrl,
            video: videoBlob
        };

        await storage.saveShot(shotData);
        
        // Update Thumbnail Gallery
        document.getElementById('btn-gallery').style.backgroundImage = `url(${photoDataUrl})`;
    }
}

const capture = new CaptureSystem();
