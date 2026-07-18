document.addEventListener('DOMContentLoaded', async () => {
    const videoCam = document.getElementById('hidden-camera');
    const canvas = document.getElementById('viewfinder');
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    const playbackCanvas = document.getElementById('playback-canvas');
    const playCtx = playbackCanvas.getContext('2d', { alpha: false, desynchronized: true });
    
    const btnShutter = document.getElementById('btn-shutter');
    const flashOverlay = document.getElementById('flash-overlay');
    const resultView = document.getElementById('result-view');
    const btnBack = document.getElementById('btn-back');
    const btnDownload = document.getElementById('btn-download');

    // Arsitektur Timing
    const FPS = 30;
    const FRAME_INTERVAL = 1000 / FPS;
    const PRE_FRAMES = 45;  
    const POST_FRAMES = 45; 

    let ringBuffer = [];
    let isCapturing = false;
    let postCaptureFrames = [];
    let livePhotoData = { pre: [], key: null, post: [] };
    
    let lastDrawTime = 0;
    let finalVideoBlob = null;
    let currentStream = null;
    let isCameraLooping = false;
    let cameraLoopId = null; 
    
    // VARIABEL BARU: Pengendali *Crash* & *Memory Leak*
    let isEncoding = false;
    let abortEncoding = false;

    const shutterSound = new Audio('https://www.soundjay.com/mechanical/camera-shutter-click-01.mp3');
    shutterSound.preload = 'auto';

    // 1. Setup Kamera
    async function initCamera() {
        try {
            if (currentStream) {
                currentStream.getTracks().forEach(track => track.stop());
            }
            
            if (cameraLoopId) cancelAnimationFrame(cameraLoopId);
            isCameraLooping = false;

            const stream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    facingMode: 'environment',
                    width: { ideal: 2560 }, // Foto tetap 2K
                    height: { ideal: 1440 },
                    frameRate: { ideal: 30 }
                }
            });
            
            currentStream = stream;
            videoCam.srcObject = stream;
            
            videoCam.onplaying = () => {
                if (videoCam.videoWidth > 0) {
                    canvas.width = videoCam.videoWidth;
                    canvas.height = videoCam.videoHeight;
                    playbackCanvas.width = videoCam.videoWidth;
                    playbackCanvas.height = videoCam.videoHeight;
                    
                    if (!isCameraLooping) {
                        isCameraLooping = true;
                        cameraLoopId = requestAnimationFrame(cameraLoop);
                    }
                } else {
                    setTimeout(() => videoCam.dispatchEvent(new Event('playing')), 150);
                }
            };

            await videoCam.play();

        } catch (err) {
            console.error("Camera Init Error:", err);
        }
    }

    // Penanganan Pindah Tab yang Lebih Aman (Mencegah Layar Hitam)
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
            if (resultView.classList.contains('hidden')) {
                // Beri jeda 300ms agar hardware kamera HP sempat "bangun"
                setTimeout(initCamera, 300); 
            }
        } else {
            isCameraLooping = false;
            if (cameraLoopId) {
                cancelAnimationFrame(cameraLoopId);
                cameraLoopId = null;
            }
            if (currentStream) {
                currentStream.getTracks().forEach(track => track.stop());
                currentStream = null;
            }
            videoCam.srcObject = null;
            videoCam.load(); // Kosongkan state video
        }
    });

    initCamera();

    // 2. Continuous Ring Buffer (Pengambilan Frame)
    async function cameraLoop(timestamp) {
        if (!isCameraLooping) return;

        if (timestamp - lastDrawTime >= FRAME_INTERVAL) {
            lastDrawTime = timestamp;
            
            if (videoCam.readyState >= 2 && !videoCam.paused) {
                try {
                    ctx.drawImage(videoCam, 0, 0, canvas.width, canvas.height);
                    const bitmap = await createImageBitmap(videoCam);

                    if (isCapturing) {
                        postCaptureFrames.push(bitmap);
                        if (postCaptureFrames.length >= POST_FRAMES) finalizeLivePhoto();
                    } else {
                        ringBuffer.push(bitmap);
                        if (ringBuffer.length > PRE_FRAMES) {
                            const oldFrame = ringBuffer.shift();
                            oldFrame.close();
                        }
                    }
                } catch (e) {
                    // Abaikan frame yang gagal agar sistem tidak hang
                }
            }
        }
        
        if (isCameraLooping) {
            cameraLoopId = requestAnimationFrame(cameraLoop);
        }
    }

    // 3. Shutter Ditekan
    btnShutter.addEventListener('click', async () => {
        if (isCapturing || videoCam.readyState < 2) return;

        shutterSound.currentTime = 0;
        shutterSound.play().catch(e => console.log("Audio error:", e));
        if (navigator.vibrate) navigator.vibrate(10);

        flashOverlay.classList.add('flash-active');
        setTimeout(() => flashOverlay.classList.remove('flash-active'), 150);
        canvas.classList.add('shutter-shrink');
        setTimeout(() => canvas.classList.remove('shutter-shrink'), 250);

        isCapturing = true;
        livePhotoData.key = await createImageBitmap(videoCam);
        livePhotoData.pre = [...ringBuffer];
        ringBuffer = [];
        postCaptureFrames = [];
    });

    // 4. Finalisasi
    function finalizeLivePhoto() {
        isCapturing = false;
        livePhotoData.post = [...postCaptureFrames];
        resultView.classList.remove('hidden');
        
        startPlayback();
        encodeVideoBackground(); // Menjalankan proses render
    }

    // 5. Playback Logic
    let isPlaying = false;
    let playbackAnimationId = null;
    let crossfadeId = null;
    
    function startPlayback() {
        if (isPlaying) return;
        isPlaying = true;
        
        if (crossfadeId) {
            cancelAnimationFrame(crossfadeId);
            crossfadeId = null;
            playCtx.globalAlpha = 1;
        }
        
        const allFrames = [...livePhotoData.pre, livePhotoData.key, ...livePhotoData.post];
        let frameIndex = 0;
        let lastPlayTime = performance.now();

        function playLoop(timestamp) {
            if (!isPlaying) return;
            
            if (timestamp - lastPlayTime >= FRAME_INTERVAL) {
                playCtx.globalAlpha = 1;
                playCtx.drawImage(allFrames[frameIndex], 0, 0);
                frameIndex++;
                lastPlayTime = timestamp;
            }
            
            if (frameIndex < allFrames.length) {
                playbackAnimationId = requestAnimationFrame(playLoop);
            } else {
                stopPlayback();
            }
        }
        playbackAnimationId = requestAnimationFrame(playLoop);
    }

    function stopPlayback() {
        if (!isPlaying && !playbackAnimationId) return;
        isPlaying = false;
        
        if (playbackAnimationId) cancelAnimationFrame(playbackAnimationId);
        playbackAnimationId = null;
        
        const currentFrameCanvas = document.createElement('canvas');
        currentFrameCanvas.width = canvas.width;
        currentFrameCanvas.height = canvas.height;
        currentFrameCanvas.getContext('2d', { alpha: false }).drawImage(playbackCanvas, 0, 0);

        let startTime = performance.now();
        const duration = 250;

        function fadeBack(timestamp) {
            let elapsed = timestamp - startTime;
            let progress = Math.min(elapsed / duration, 1);
            let ease = 1 - Math.pow(1 - progress, 3);
            
            playCtx.globalAlpha = 1;
            playCtx.drawImage(currentFrameCanvas, 0, 0);
            
            playCtx.globalAlpha = ease;
            playCtx.drawImage(livePhotoData.key, 0, 0);
            
            if (progress < 1) {
                crossfadeId = requestAnimationFrame(fadeBack);
            } else {
                playCtx.globalAlpha = 1;
                crossfadeId = null;
            }
        }
        crossfadeId = requestAnimationFrame(fadeBack);
    }

    playbackCanvas.addEventListener('pointerdown', startPlayback);
    window.addEventListener('pointerup', stopPlayback);
    playbackCanvas.addEventListener('pointerleave', stopPlayback);

    // 6. RENDER ENGINE (PERBAIKAN KECEPATAN & ANTI-FREEZE)
    async function encodeVideoBackground() {
        isEncoding = true;
        abortEncoding = false;
        btnDownload.disabled = true;
        btnDownload.innerText = "Memproses Video (0%)...";
        
        const mainFrames = [...livePhotoData.pre, livePhotoData.key, ...livePhotoData.post];
        const totalFrames = mainFrames.length;
        
        // Mencegah HP Freeze: Downscale video menjadi maksimal ukuran 720p 
        // (Sisi terpanjang diset max 1280px)
        const maxDim = Math.max(canvas.width, canvas.height);
        const scale = maxDim > 1280 ? (1280 / maxDim) : 1;
        const encWidth = Math.floor((canvas.width * scale) / 2) * 2;
        const encHeight = Math.floor((canvas.height * scale) / 2) * 2;

        const encodeCanvas = new OffscreenCanvas(encWidth, encHeight);
        const encodeCtx = encodeCanvas.getContext('2d', { alpha: false });
        
        const muxer = new WebMMuxer.Muxer({
            target: new WebMMuxer.ArrayBufferTarget(),
            video: { codec: 'V_VP8', width: encWidth, height: encHeight, frameRate: FPS }
        });

        const videoEncoder = new VideoEncoder({
            output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
            error: e => console.error("Encoder Error", e)
        });

        // Bitrate diturunkan ke 3.5 Mbps (Cukup tajam untuk format video 720p di HP)
        videoEncoder.configure({
            codec: 'vp8', width: encWidth, height: encHeight, bitrate: 3500000, framerate: FPS
        });

        let currentTimestamp = 0;
        let frameCount = 0;

        const pushToEncoder = async (imageSource) => {
            // Berhenti merender jika tombol tutup ditekan atau gambar sudah terhapus
            if (abortEncoding || !imageSource || imageSource.isClosed) return;
            
            // Batasi antrean ke GPU agar RAM HP tidak penuh
            while (videoEncoder.encodeQueueSize >= 3) {
                await new Promise(resolve => setTimeout(resolve, 15));
            }

            // Gambar ulang ke ukuran 720p sebelum di-encode (kunci agar proses instan)
            encodeCtx.drawImage(imageSource, 0, 0, encWidth, encHeight);
            
            const vf = new VideoFrame(encodeCanvas, { timestamp: currentTimestamp });
            videoEncoder.encode(vf, { keyFrame: frameCount % 30 === 0 });
            vf.close();
            currentTimestamp += FRAME_INTERVAL * 1000;
            frameCount++;
        };

        try {
            for (let i = 0; i < mainFrames.length; i++) {
                if (abortEncoding) break;
                await pushToEncoder(mainFrames[i]);
                
                // Update persentase UI
                if (i % 5 === 0) {
                    let progress = Math.round((i / totalFrames) * 100);
                    btnDownload.innerText = `Memproses Video (${progress}%)...`;
                }
            }

            if (!abortEncoding) {
                await videoEncoder.flush();
                muxer.finalize();
                
                const buffer = muxer.target.buffer;
                finalVideoBlob = new Blob([buffer], { type: 'video/webm' });
                
                btnDownload.disabled = false;
                btnDownload.innerText = "Download Live Photo";
            }
        } catch (e) {
            console.error("Encoding failed", e);
        } finally {
            isEncoding = false;
            if (abortEncoding) videoEncoder.close();
        }
    }

    // 7. Download
    btnDownload.addEventListener('click', () => {
        if (!finalVideoBlob) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(finalVideoBlob);
        a.download = `LivePhoto_SuperHD_${Date.now()}.webm`;
        a.click();
    });

    // 8. Bersihkan Memori (Pencegah Crash Terpenting)
    btnBack.addEventListener('click', () => {
        abortEncoding = true; // Langsung hentikan render jika masih berjalan
        
        stopPlayback();
        resultView.classList.add('hidden');
        btnDownload.innerText = "Download Live Photo";
        
        // Beri jeda 100ms agar loop VideoEncoder benar-benar mati sebelum kita menghapus RAM gambarnya
        setTimeout(() => {
            [...livePhotoData.pre, ...livePhotoData.post].forEach(bmp => {
                if (bmp && !bmp.isClosed) bmp.close();
            });
            if (livePhotoData.key && !livePhotoData.key.isClosed) livePhotoData.key.close();
            
            livePhotoData = { pre: [], key: null, post: [] };
            finalVideoBlob = null;
            
            if (!currentStream || currentStream.getTracks()[0].readyState === 'ended') {
                initCamera();
            }
        }, 100);
    });
});
