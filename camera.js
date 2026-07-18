// camera.js
class CameraSystem {
    constructor() {
        this.videoElement = document.getElementById('viewfinder');
        this.currentStream = null;
        this.facingMode = 'user'; // Default kamera depan
    }

    async init() {
        await this.startCamera();
    }

    async startCamera() {
        if (this.currentStream) {
            this.currentStream.getTracks().forEach(track => track.stop());
        }

        try {
            const constraints = {
                video: { 
                    facingMode: this.facingMode,
                    width: { ideal: 1080 },
                    height: { ideal: 1920 } 
                },
                audio: true // Wajib agar audio dari HP ikut direkam ke Live Photo
            };
            
            this.currentStream = await navigator.mediaDevices.getUserMedia(constraints);
            this.videoElement.srcObject = this.currentStream;
            
            // Masukkan stream ke buffer
            if (typeof liveBuffer !== 'undefined') {
                liveBuffer.start(this.currentStream);
            }
        } catch (error) {
            console.error("Gagal mengakses kamera:", error);
            alert("Harap izinkan akses kamera & mikrofon untuk merekam Live Photo.");
        }
    }

    toggleCamera() {
        this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
        this.startCamera();
    }
}

const camera = new CameraSystem();
