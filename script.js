// script.js
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Inisialisasi
    await storage.init();
    await camera.init();

    // 2. UI Kamera
    document.getElementById('btn-switch-cam').addEventListener('click', () => {
        camera.toggleCamera();
    });

    const shutterBtn = document.getElementById('btn-shutter');
    shutterBtn.addEventListener('click', async () => {
        shutterBtn.disabled = true;
        await capture.takeLiveShot();
        shutterBtn.disabled = false;
    });

    // 3. UI Galeri
    const galleryView = document.getElementById('gallery-view');
    
    document.getElementById('btn-gallery').addEventListener('click', async () => {
        const shots = await storage.getAllShots();
        renderGalleryGrid(shots);
        if (shots.length > 0) {
            player.loadShot(shots[0]);
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

    // 4. EKSPOR KE TIKTOK (Download Video)
    document.getElementById('btn-export').addEventListener('click', async () => {
        const activeImg = document.querySelector('.gallery-item.active');
        if (!activeImg) {
            alert('Belum ada foto yang dipilih!');
            return;
        }

        const shots = await storage.getAllShots();
        const currentShot = shots.find(shot => shot.photo === activeImg.src);

        if (currentShot && currentShot.video) {
            const videoUrl = URL.createObjectURL(currentShot.video);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = videoUrl;
            a.download = `LivePhoto_TikTok_${currentShot.id}.webm`; 
            
            document.body.appendChild(a);
            a.click(); // Eksekusi download ke HP/PC
            
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(videoUrl);
            }, 100);
        }
    });
});

function renderGalleryGrid(shots) {
    const grid = document.getElementById('gallery-grid');
    grid.innerHTML = '';
    
    shots.forEach((shot, index) => {
        const img = document.createElement('img');
        img.src = shot.photo;
        img.className = 'gallery-item';
        
        // Buat item pertama jadi aktif default
        if (index === 0) img.classList.add('active'); 

        img.addEventListener('click', () => {
            document.querySelectorAll('.gallery-item').forEach(el => el.classList.remove('active'));
            img.classList.add('active');
            player.loadShot(shot);
        });
        grid.appendChild(img);
    });
}
