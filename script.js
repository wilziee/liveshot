document.addEventListener('DOMContentLoaded', async () => {
    const videoCam = document.getElementById('hidden-camera');
    const canvas = document.getElementById('viewfinder');
    const ctx = canvas.getContext('2d', { alpha: false });
    const playbackCanvas = document.getElementById('playback-canvas');
    const playCtx = playbackCanvas.getContext('2d', { alpha: false });
    
    const btnShutter = document.getElementById('btn-shutter');
    const flashOverlay = document.getElementById('flash-overlay');
    const resultView = document.getElementById('result-view');
    const btnBack = document.getElementById('btn-back');
    const btnDownload = document.getElementById('btn-download');

    // Arsitektur Timing (30 FPS)
    const FPS = 30;
    const FRAME_INTERVAL = 1000 / FPS;
    const PRE_FRAMES = 45;  // 1.5 detik sebelum
    const POST_FRAMES = 45; // 1.5 detik sesudah

    // State & Memori
    let ringBuffer = [];
    let isCapturing = false;
    let postCaptureFrames = [];
    let livePhotoData = { pre: [], key: null, post: [] };
    
    let lastDrawTime = 0;
    let finalVideoBlob = null;

    // Audio Shutter (Preload untuk respon 0ms)
    const shutterSound = new Audio('https://www.soundjay.com/mechanical/camera-shutter-click-01.mp3');
    shutterSound.preload = 'auto';

    // 1. Setup Kamera
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        videoCam.srcObject = stream;
        videoCam.onloadedmetadata = () => {
            canvas.width = videoCam.videoWidth;
            canvas.height = videoCam.videoHeight;
            playbackCanvas.width = videoCam.videoWidth;
            playbackCanvas.height = videoCam.videoHeight;
            requestAnimationFrame(cameraLoop);
        };
    } catch (err) {
        alert("Akses kamera ditolak.");
    }

    // 2. Continuous Ring Buffer
    async function cameraLoop(timestamp) {
        if (timestamp - lastDrawTime >= FRAME_INTERVAL) {
            lastDrawTime = timestamp;
            ctx.drawImage(videoCam, 0, 0, canvas.width, canvas.height);
            const bitmap = await createImageBitmap(canvas);

            if (isCapturing) {
                postCaptureFrames.push(bitmap);
                if (postCaptureFrames.length >= POST_FRAMES) {
                    finalizeLivePhoto();
                }
            } else {
                ringBuffer.push(bitmap);
                if (ringBuffer.length > PRE_FRAMES) {
                    const oldFrame = ringBuffer.shift();
                    oldFrame.close();
                }
            }
        }
        requestAnimationFrame(cameraLoop);
    }

    // 3. Shutter Ditekan
    btnShutter.addEventListener('click', async () => {
        if (isCapturing) return;

        shutterSound.currentTime = 0;
        shutterSound.play().catch(e => console.log("Audio play error:", e));

        if (navigator.vibrate) navigator.vibrate(10);

        flashOverlay.classList.add('flash-active');
        setTimeout(() => flashOverlay.classList.remove('flash-active'), 150);

        canvas.classList.add('shutter-shrink');
        setTimeout(() => canvas.classList.remove('shutter-shrink'), 250);

        isCapturing = true;
        livePhotoData.key = await createImageBitmap(canvas);
        livePhotoData.pre = [...ringBuffer];
        ringBuffer = [];
        postCaptureFrames = [];
    });

    // 4. Finalisasi Memori & Tampilkan Hasil
    function finalizeLivePhoto() {
        isCapturing = false;
        livePhotoData.post = [...postCaptureFrames];
        resultView.classList.remove('hidden');
        
        startPlayback();
        encodeVideoBackground(); // Proses pemanggangan dimulai di background
    }

    // 5. Playback Logic di Layar (Interactive Canvas View)
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

    // 6. ADVANCED BACKGROUND ENCODING (Memanggang Sensasi Live Photo langsung ke File Video)
    async function encodeVideoBackground() {
        btnDownload.disabled = true;
        btnDownload.innerText = "Memproses...";
        
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

        videoEncoder.configure({
            codec: 'vp8', width: canvas.width, height: canvas.height, bitrate: 2500000, framerate: FPS
        });

        let currentTimestamp = 0;
        let frameCount = 0;

        // Helper untuk memasukkan frame ke pipa WebCodecs secara berurutan
        const pushToEncoder = async (imageSource) => {
            const vf = new VideoFrame(imageSource, { timestamp: currentTimestamp });
            videoEncoder.encode(vf, { keyFrame: frameCount % 30 === 0 });
            vf.close();
            currentTimestamp += FRAME_INTERVAL * 1000; // Microseconds
            frameCount++;
        };

        // KELOMPOK 1: Panggang gerakan asli (Pre -> Key -> Post)
        for (let i = 0; i < mainFrames.length; i++) {
            await pushToEncoder(mainFrames[i]);
        }

        // KELOMPOK 2: Panggang Transisi Crossfade (Ilusi visual kembali ke Key Photo secara anggun)
        const offscreen = new OffscreenCanvas(canvas.width, canvas.height);
        const oCtx = offscreen.getContext('2d', { alpha: false });
        const lastMotionFrame = mainFrames[mainFrames.length - 1];

        const fadeDuration = 250; // 250ms transisi balik
        const fadeFramesCount = Math.round(fadeDuration / FRAME_INTERVAL); // ~7 sampai 8 frame

        for (let i = 0; i <= fadeFramesCount; i++) {
            let progress = i / fadeFramesCount;
            let ease = 1 - Math.pow(1 - progress, 3); // Kurva cubic ease-out Apple

            oCtx.globalAlpha = 1;
            oCtx.drawImage(lastMotionFrame, 0, 0); // Base layer (frame terakhir berhenti)
            oCtx.globalAlpha = ease;
            oCtx.drawImage(keyFrame, 0, 0);       // Blend layer (Key Photo masuk)

            const blendedBitmap = await createImageBitmap(offscreen);
            await pushToEncoder(blendedBitmap);
            blendedBitmap.close();
        }

        // KELOMPOK 3: Panggang Static Freeze (Menahan Key Photo agar diam selama 1.5 detik di akhir)
        const holdFramesCount = Math.round(1500 / FRAME_INTERVAL); // 45 frame diam
        for (let i = 0; i < holdFramesCount; i++) {
            await pushToEncoder(keyFrame);
        }

        // Finalisasi data video
        await videoEncoder.flush();
        muxer.finalize();
        
        const buffer = muxer.target.buffer;
        finalVideoBlob = new Blob([buffer], { type: 'video/webm' });
        
        btnDownload.disabled = false;
        btnDownload.innerText = "Download Live Photo";
    }

    // 7. Download Action
    btnDownload.addEventListener('click', () => {
        if (!finalVideoBlob) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(finalVideoBlob);
        a.download = `LivePhoto_${Date.now()}.webm`;
        a.click();
    });

    // 8. Tutup dan Bersihkan Memori
    btnBack.addEventListener('click', () => {
        stopPlayback();
        resultView.classList.add('hidden');
        
        [...livePhotoData.pre, ...livePhotoData.post].forEach(bmp => {
            if(bmp && !bmp.isClosed) bmp.close();
        });
        if(livePhotoData.key) livePhotoData.key.close();
        
        livePhotoData = { pre: [], key: null, post: [] };
        finalVideoBlob = null;
    });
});
