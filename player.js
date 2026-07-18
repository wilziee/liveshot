// player.js - Seamless Playback Logic
window.PlayerManager = (() => {
    const modal = document.getElementById('player-modal');
    const imgEl = document.getElementById('player-image');
    const vidEl = document.getElementById('player-video');
    let currentLiveShot = null;
    let pressTimer;

    const openPlayer = (liveShotData) => {
        currentLiveShot = liveShotData;
        imgEl.src = URL.createObjectURL(liveShotData.photoBlob);
        vidEl.src = URL.createObjectURL(liveShotData.videoBlob);
        
        modal.classList.remove('hidden');
        
        // Setup Video
        vidEl.load();
        vidEl.currentTime = 0; // Pastikan mulai dari awal (buffer -2 detik)
    };

    const closePlayer = () => {
        modal.classList.add('hidden');
        vidEl.pause();
        currentLiveShot = null;
    };

    // --- INTERAKSI APPLE LIVE PHOTO (Tekan Lama) ---
    const startPlayback = () => {
        modal.classList.add('playing');
        vidEl.play().catch(e => console.log("Autoplay blocked:", e));
        
        // Fitur Player: Loop sekali (berhenti saat selesai dan kembali ke foto)
        vidEl.onended = () => {
            stopPlayback();
        };
    };

    const stopPlayback = () => {
        modal.classList.remove('playing');
        vidEl.pause();
        vidEl.currentTime = 0; 
    };

    // Event Listener untuk Gesture di Modal Player
    modal.addEventListener('pointerdown', startPlayback);
    modal.addEventListener('pointerup', stopPlayback);
    modal.addEventListener('pointerleave', stopPlayback);
    modal.addEventListener('contextmenu', e => e.preventDefault()); // Matikan klik kanan

    return { openPlayer, closePlayer };
})();
