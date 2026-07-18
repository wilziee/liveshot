// player.js
class LivePlayer {
    constructor() {
        this.container = document.getElementById('player-container');
        this.imgEl = document.getElementById('player-image');
        this.videoEl = document.getElementById('player-video');
        
        this.setupEvents();
    }

    loadShot(shotData) {
        this.imgEl.src = shotData.photo;
        this.imgEl.style.opacity = '1';
        this.videoEl.classList.add('hidden');
        
        // OPTIMASI: Cegah Memory Leak dengan membersihkan URL sebelumnya
        if (this.videoEl.src) {
            URL.revokeObjectURL(this.videoEl.src); 
        }
        
        // Buat URL dari Blob video
        const videoUrl = URL.createObjectURL(shotData.video);
        this.videoEl.src = videoUrl;
    }

    setupEvents() {
        const startPlay = () => {
            this.videoEl.classList.remove('hidden');
            this.videoEl.currentTime = 0;
            
            // OPTIMASI: Hilangkan foto (fade) hanya JIKA video sudah benar-benar play
            this.videoEl.play().then(() => {
                this.imgEl.style.opacity = '0'; // Smooth fade to video
            }).catch(err => {
                console.warn("Video play error/interrupted", err);
            });
        };

        const stopPlay = () => {
            this.imgEl.style.opacity = '1'; // Smooth fade back to photo
            this.videoEl.pause();
            setTimeout(() => this.videoEl.classList.add('hidden'), 300);
        };

        // Support Mouse & Touch Gestures
        this.container.addEventListener('mousedown', startPlay);
        this.container.addEventListener('mouseup', stopPlay);
        this.container.addEventListener('mouseleave', stopPlay);
        
        this.container.addEventListener('touchstart', (e) => {
            e.preventDefault();
            startPlay();
        }, {passive: false});
        
        this.container.addEventListener('touchend', (e) => {
            e.preventDefault();
            stopPlay();
        }, {passive: false});
    }
}

const player = new LivePlayer();
