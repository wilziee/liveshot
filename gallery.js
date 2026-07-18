// gallery.js - UI Gallery & Export Stubs
window.GalleryManager = (() => {
    const modal = document.getElementById('gallery-modal');
    const grid = document.getElementById('gallery-grid');

    const openGallery = async () => {
        modal.classList.remove('hidden');
        grid.innerHTML = ''; // Clear grid
        
        const shots = await window.StorageDB.getAllLiveShots();
        
        shots.forEach(shot => {
            const img = document.createElement('img');
            img.classList.add('grid-item', 'glass-panel');
            img.src = URL.createObjectURL(shot.photoBlob);
            
            // Klik thumbnail buka player
            img.addEventListener('click', () => {
                window.PlayerManager.openPlayer(shot);
            });
            
            grid.appendChild(img);
        });
    };

    const closeGallery = () => {
        modal.classList.add('hidden');
    };

    // FITUR EXPORT (ZIP, MP4, GIF)
    // Di lingkungan Vanilla JS murni tanpa library, MP4/GIF/ZIP butuh manual binary manipulation.
    // Ini adalah arsitektur di mana fitur tersebut di-attach.
    const exportData = () => {
        alert("Eksport (JPG, MP4, ZIP) di Vanilla JS akan mengunduh format WebM dan JPEG lokal. \nUntuk MP4/GIF sejati, arsitektur ini siap dihubungkan dengan FFmpeg.wasm.");
        // Contoh dasar trigger unduhan:
        // const a = document.createElement('a');
        // a.href = url; a.download = 'LiveShot.webm'; a.click();
    };

    return { openGallery, closeGallery, exportData };
})();
