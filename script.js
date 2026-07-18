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

    // Arsitektur Timing (30 FPS)
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

    const shutterSound = new Audio('https://www.soundjay.com/mechanical/camera-shutter-click-01.mp3');
    shutterSound.preload = 'auto';

    // 1. Setup Kamera Terpusat - UPGRADE KE 1440p (2K SUPER HD)
    async function initCamera() {
        try {
            if (currentStream) {
                currentStream.getTracks().forEach(track => track.stop());
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    facingMode: 'environment', 
                    width: { ideal: 2560 }, // 1440p (Batas maksimal RAM mobile browser sebelum crash)
                    height: { ideal: 1440 },
                    frameRate: { ideal: 30 }
                }
            });
            
            currentStream = stream;
            videoCam.srcObject = stream;
            
            await videoCam.play();

            videoCam.onloadedmetadata = () => {
                canvas.width = videoCam.videoWidth;
                canvas.height = videoCam.videoHeight;
                playbackCanvas.width = videoCam.videoWidth;
                playbackCanvas.height = videoCam.videoHeight;
                
                if (!isCameraLooping) {
                    isCameraLooping = true;
                    requestAnimationFrame(cameraLoop);
                }
            };
        } catch (err) {
            console.error("Camera Init Error:", err);
            alert("Kamera gagal diakses. Pastikan izin diberikan.");
        }
    }

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
            if (resultView.classList.contains('hidden')) initCamera();
        } else {
            if (currentStream) currentStream.getTracks().forEach(track => track.stop());
        }
    });

    initCamera();

    // 2. Continuous Ring Buffer (Direct GPU Capture)
    async function cameraLoop(timestamp) {
        if (!isCameraLooping) return;

        if (timestamp - lastDrawTime >= FRAME_INTERVAL) {
            lastDrawTime = timestamp;
            
            if (videoCam.readyState >= 2 && !videoCam.paused) {
                try {
                    ctx.drawImage(videoCam, 0, 0, canvas.width, canvas.height);
                    
                    // Bypass canvas rendering delay, tangkap pixel mentah langsung dari GPU
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
                } catch (e) {}
            }
        }
        requestAnimationFrame(cameraLoop);
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
        encodeVideoBackground(); 
    }

    // 5. Playback Logic (Smooth Blend)
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

    // 6. ADVANCED BACKGROUND ENCODING (Super HD 10 Mbps)
    async function encodeVideoBackground() {
        btnDownload.disabled = true;
        btnDownload.innerText = "Memproses Super HD...";
        
        const preFrames = livePhotoData.pre;
        const keyFrame = livePhotoData.key;
        const postFrames = livePhotoData.post;
        const mainFrames = [...preFrames, keyFrame, ...postFrames];
        
        const muxer = new WebMMuxer.Muxer({
            target: new WebMMuxer.ArrayBufferTarget(),
            video: { codec: 'V_VP8', width: canvas.width, height: canvas.height, frameRate: FPS }
        });

        const videoEncoder = new VideoEncoder({
            output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
            error: e => console.error("Encoder Error", e)
        });

        // UPGRADE EXTREME: Bitrate dinaikkan ke 10.000.000 (10 Mbps) untuk menampung detail 1440p
        videoEncoder.configure({
            codec: 'vp8', width: canvas.width, height: canvas.height, bitrate: 10000000, framerate: FPS
        });

        let currentTimestamp = 0;
        let frameCount = 0;

        const pushToEncoder = async (imageSource) => {
            const vf = new VideoFrame(imageSource, { timestamp: currentTimestamp });
            videoEncoder.encode(vf, { keyFrame: frameCount % 30 === 0 });
            vf.close();
            currentTimestamp += FRAME_INTERVAL * 1000; 
            frameCount++;
        };

        for (let i = 0; i < mainFrames.length; i++) {
            await pushToEncoder(mainFrames[i]);
        }

        const offscreen = new OffscreenCanvas(canvas.width, canvas.height);
        const oCtx = offscreen.getContext('2d', { alpha: false });
        const lastMotionFrame = mainFrames[mainFrames.length - 1];
        const fadeDuration = 250; 
        const fadeFramesCount = Math.round(fadeDuration / FRAME_INTERVAL); 

        for (let i = 0; i <= fadeFramesCount; i++) {
            let progress = i / fadeFramesCount;
            let ease = 1 - Math.pow(1 - progress, 3); 

            oCtx.globalAlpha = 1;
            oCtx.drawImage(lastMotionFrame, 0, 0); 
            oCtx.globalAlpha = ease;
            oCtx.drawImage(keyFrame, 0, 0);       

            const blendedBitmap = await createImageBitmap(offscreen);
            await pushToEncoder(blendedBitmap);
            blendedBitmap.close();
        }

        const holdFramesCount = Math.round(1500 / FRAME_INTERVAL); 
        for (let i = 0; i < holdFramesCount; i++) {
            await pushToEncoder(keyFrame);
        }

        await videoEncoder.flush();
        muxer.finalize();
        
        const buffer = muxer.target.buffer;
        finalVideoBlob = new Blob([buffer], { type: 'video/webm' });
        
        btnDownload.disabled = false;
        btnDownload.innerText = "Download Super HD Live Photo";
    }

    // 7. Download
    btnDownload.addEventListener('click', () => {
        if (!finalVideoBlob) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(finalVideoBlob);
        a.download = `LivePhoto_SuperHD_${Date.now()}.webm`;
        a.click();
    });

    // 8. Tutup dan Bersihkan Memori (Sangat Penting di Resolusi Tinggi)
    btnBack.addEventListener('click', () => {
        stopPlayback();
        resultView.classList.add('hidden');
        
        [...livePhotoData.pre, ...livePhotoData.post].forEach(bmp => {
            if(bmp && !bmp.isClosed) bmp.close();
        });
        if(livePhotoData.key) livePhotoData.key.close();
        
        livePhotoData = { pre: [], key: null, post: [] };
        finalVideoBlob = null;
        
        if (!currentStream || currentStream.getTracks()[0].readyState === 'ended') {
            initCamera();
        }
    });
});
