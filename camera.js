// camera.js
class Camera {
    constructor() {
        this.videoElement = document.getElementById('viewfinder');
        this.currentStream = null;
        this.facingMode = 'environment'; // Default belakang
    }

    async init() {
        await this.startStream();
    }

    async startStream() {
        if (this.currentStream) {
            this.currentStream.getTracks().forEach(track => track.stop());
        }

        // OPTIMASI: 1080p dan 30fps jauh lebih stabil di browser
        const constraints = {
            video: {
                facingMode: this.facingMode,
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                frameRate: { ideal: 30 }
            },
            audio: true 
        };

        try {
            this.currentStream = await navigator.mediaDevices.getUserMedia(constraints);
            this.videoElement.srcObject = this.currentStream;
            
            // Restart buffer dengan stream baru
            liveBuffer.stop();
            liveBuffer.start(this.currentStream);
            
        } catch (error) {
            console.error("Gagal mengakses kamera:", error);
            alert("Harap izinkan akses kamera dan mikrofon.");
        }
    }

    toggleCamera() {
        this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
        this.startStream();
    }
}

const camera = new Camera();
