// camera.js - Hardware Interaction
window.CameraManager = (() => {
    let currentStream = null;
    let currentFacingMode = 'environment'; // Rear default
    let videoElement = document.getElementById('camera-view');
    let imageCapture = null; // ImageCapture API if available

    const initCamera = async () => {
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
        }

        const constraints = {
            video: {
                facingMode: currentFacingMode,
                width: { ideal: 4096 }, // Force max res
                height: { ideal: 2160 },
                frameRate: { ideal: 60 }
            },
            audio: false // Live Photo Apple umumnya menyertakan audio, tapi di set false untuk privasi dasar web. Ubah ke true jika butuh.
        };

        try {
            currentStream = await navigator.mediaDevices.getUserMedia(constraints);
            videoElement.srcObject = currentStream;
            
            // Check for advanced hardware capabilities
            const videoTrack = currentStream.getVideoTracks()[0];
            if (window.ImageCapture) {
                imageCapture = new ImageCapture(videoTrack);
            }
            
            // Mulai / Restart Background Buffer
            window.BufferManager.stopBuffering();
            window.BufferManager.resetBuffer();
            window.BufferManager.startBuffering(currentStream);
            
            return currentStream;
        } catch (error) {
            console.error("Camera access failed:", error);
            alert("Harap izinkan akses kamera.");
        }
    };

    const toggleCamera = () => {
        currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
        initCamera();
    };

    const getVideoElement = () => videoElement;
    const getImageCapture = () => imageCapture;

    return { initCamera, toggleCamera, getVideoElement, getImageCapture };
})();
