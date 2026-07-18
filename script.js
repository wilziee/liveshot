// script.js
document.addEventListener('DOMContentLoaded', async () => {
    // Inisialisasi Database
    await storage.init();
    
    // Inisialisasi Kamera & Buffer
    await camera.init();

    // Event Listener UI Kamera
    document.getElementById('btn-switch-cam').addEventListener('click', () => {
        camera.toggleCamera();
    });

    const shutterBtn = document.getElementById('btn-shutter');
    shutterBtn.addEventListener('click', async () => {
        // Mencegah spam klik
        shutterBtn.disabled = true;
        await capture.takeLiveShot();
        shutterBtn.disabled = false;
    });

    // Gallery Logic
    const galleryView = document.getElementById('gallery-view');
    
    document.getElementById('btn-gallery').addEventListener('click', async () => {
        const shots = await storage.getAllShots();
        renderGalleryGrid(shots);
        if (shots.length > 0) {
            player.loadShot(shots[0]); // Load yang paling baru
        }
        galleryView.classList.remove('hidden');
    });

    document.getElementById('btn-close-gallery').addEventListener('click', () => {
        galleryView.classList.add('hidden');
    });
    
    // Load Thumbnail pertama kali buka web
    const initialShots = await storage.getAllShots();
    if(initialShots.length > 0){
        document.getElementById('btn-gallery').style.backgroundImage = `url(${initialShots[0].photo})`;
    }
});

function renderGalleryGrid(shots) {
    const grid = document.getElementById('gallery-grid');
    grid.innerHTML = '';
    
    shots.forEach(shot => {
        const img = document.createElement('img');
        img.src = shot.photo;
        img.className = 'gallery-item';
        img.addEventListener('click', () => {
            document.querySelectorAll('.gallery-item').forEach(el => el.classList.remove('active'));
            img.classList.add('active');
            player.loadShot(shot);
        });
        grid.appendChild(img);
    });
}
