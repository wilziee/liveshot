// script.js - Entry Point & Event Bindings
document.addEventListener('DOMContentLoaded', async () => {
    
    console.log("🚀 Memulai XAERISOFT LIVESHOT...");

    // 1. Inisialisasi Database
    await window.StorageDB.init();

    // 2. Inisialisasi Kamera & Buffer
    await window.CameraManager.initCamera();

    // 3. Binding Event Listeners Utama
    const btnShutter = document.getElementById('btn-shutter');
    const btnSwitch = document.getElementById('btn-switch-cam');
    const btnGallery = document.getElementById('btn-gallery');
    
    // Cegah zoom di iOS saat tap cepat
    btnShutter.addEventListener('touchstart', e => e.preventDefault(), {passive: false});

    // Capture Trigger
    btnShutter.addEventListener('pointerdown', async (e) => {
        e.preventDefault();
        btnShutter.style.transform = "scale(0.85)";
        await window.CaptureManager.takeLiveShot();
    });
    
    btnShutter.addEventListener('pointerup', (e) => {
        btnShutter.style.transform = "scale(1)";
    });

    // Camera Switch
    btnSwitch.addEventListener('click', () => {
        window.CameraManager.toggleCamera();
    });

    // Gallery Routing
    btnGallery.addEventListener('click', () => {
        window.GalleryManager.openGallery();
    });

    document.getElementById('btn-close-gallery').addEventListener('click', () => {
        window.GalleryManager.closeGallery();
    });

    // Player Routing (Klik kembali untuk tutup)
    document.getElementById('player-modal').addEventListener('dblclick', () => {
        window.PlayerManager.closePlayer();
    });

    // Simulasi Pinch Zoom Hardware
    let currentZoom = 1;
    document.getElementById('camera-view').addEventListener('wheel', (e) => {
        const stream = window.CameraManager.getVideoElement().srcObject;
        if (!stream) return;
        const track = stream.getVideoTracks()[0];
        const capabilities = track.getCapabilities();
        
        if (capabilities.zoom) {
            currentZoom += e.deltaY * -0.01;
            currentZoom = Math.min(Math.max(currentZoom, capabilities.zoom.min), capabilities.zoom.max);
            track.applyConstraints({ advanced: [{ zoom: currentZoom }] });
        }
    });
});
