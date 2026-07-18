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
    let playbackAnimationId = null;
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

    // 2. Continuous Ring Buffer (Berjalan Selamanya)
    async function cameraLoop(timestamp) {
        if (timestamp - lastDrawTime >= FRAME_INTERVAL) {
            lastDrawTime = timestamp;
            
            // Gambar frame kamera ke viewfinder
            ctx.drawImage(videoCam, 0, 0, canvas.width, canvas.height);
            
            // Simpan ke memori (Sangat Ringan, 0 Delay)
            const bitmap = await createImageBitmap(canvas);

            if (isCapturing) {
                // Jika sedang post-shutter, kumpulkan frame berikutnya
                postCaptureFrames.push(bitmap);
                if (postCaptureFrames.length >= POST_FRAMES) {
                    finalizeLivePhoto();
                }
            } else {
                // Jika standby, maintenance Ring Buffer
                ringBuffer.push(bitmap);
                if (ringBuffer.length > PRE_FRAMES) {
                    const oldFrame = ringBuffer.shift();
                    oldFrame.close(); // Hapus dari RAM (Wajib!)
                }
            }
        }
        requestAnimationFrame(cameraLoop);
    }

    // 3. Shutter Ditekan (Shutter Experience Apple Live Photo)
    btnShutter.addEventListener('click', async () => {
        if (isCapturing) return;

        // --- MULAI EFEK SHUTTER INSTAN ---
        
        // 1. Audio (Sangat sinkron dengan Key Frame)
        shutterSound.currentTime = 0;
        shutterSound.play().catch(e => console.log("Audio play error:", e));

        // 2. Getaran / Haptic (8-10ms)
        if (navigator.vibrate) navigator.vibrate(10);

        // 3. Flash Putih (via CSS Class - 80ms)
        flashOverlay.classList.add('flash-active');
        setTimeout(() => flashOverlay.classList.remove('flash-active'), 100);

        // 4. Viewfinder Mengecil 0.98x (via CSS Class - 120ms)
        canvas.classList.add('shutter-shrink');
        setTimeout(() => canvas.classList.remove('shutter-shrink'), 150);
        
        // --- SELESAI EFEK SHUTTER ---

        // Kunci State saat ini
        isCapturing = true;
        
        // Frame ini menjadi Key Photo (Thumbnail)
        livePhotoData.key = await createImageBitmap(canvas);
        
        // Pindahkan Ring Buffer ke data pre-shutter
        livePhotoData.pre = [...ringBuffer];
        ringBuffer = []; // Kosongkan buffer untuk iterasi selanjutnya
        
        postCaptureFrames = [];
    });

    // 4. Finalisasi Memori & Tampilkan Hasil
    function finalizeLivePhoto() {
        isCapturing = false;
        livePhotoData.post = [...postCaptureFrames];
        
        // Langsung tampilkan hasil secara bersih tanpa memicu teks penahan/loading tambahan
        resultView.classList.remove('hidden');
        
        // Gambar Key Photo persis seperti saat shutter ditekan
        playCtx.drawImage(livePhotoData.key, 0, 0);

        // Jalankan background encoder (Tidak ganggu UI)
        encodeVideoBackground();
    }

    // 5. Playback Logic (Reverse Engineering Hold/Release Apple)
    let isHolding = false;
    
    function startPlayback() {
        if (isHolding) return;
        isHolding = true;
        
        const allFrames = [...livePhotoData.pre, livePhotoData.key, ...livePhotoData.post];
        let frameIndex = 0;
        let lastPlayTime = performance.now();

        function playLoop(timestamp) {
            if (!isHolding) return; // Langsung mati jika dilepas
            
            if (timestamp - lastPlayTime >= FRAME_INTERVAL) {
                playCtx.drawImage(allFrames[frameIndex], 0, 0);
                frameIndex++;
                lastPlayTime = timestamp;
            }
            
            if (frameIndex < allFrames.length) {
                playbackAnimationId = requestAnimationFrame(playLoop);
            }
        }
        playbackAnimationId = requestAnimationFrame(playLoop);
    }

    function stopPlayback() {
        if (!isHolding) return;
        isHolding = false;
        cancelAnimationFrame(playbackAnimationId);
        
        // Instan: Kembali ke Key Photo persis (Tidak ada delay Tag Video)
        playCtx.drawImage(livePhotoData.key, 0, 0);
    }

    // Event Listener untuk gesture Hold
    playbackCanvas.addEventListener('pointerdown', startPlayback);
    window.addEventListener('pointerup', stopPlayback);
    playbackCanvas.addEventListener('pointerleave', stopPlayback);

    // 6. Background Encoding (WebCodecs) - Valid & Bebas MediaRecorder
    async function encodeVideoBackground() {
        btnDownload.disabled = true;
        btnDownload.innerText = "Memproses...";
        
        const allFrames = [...livePhotoData.pre, livePhotoData.key, ...livePhotoData.post];
        
        const muxer = new WebMMuxer.Muxer({
            target: new WebMMuxer.ArrayBufferTarget(),
            video: { codec: 'V_VP8', width: canvas.width, height: canvas.height, frameRate: FPS }
        });

        const videoEncoder = new VideoEncoder({
            output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
            error: e => console.error("Encoder Error", e)
        });

        videoEncoder.configure({
            codec: 'vp8', width: canvas.width, height: canvas.height, bitrate: 2000000, framerate: FPS
        });

        // Encode seluruh frame dari RAM ke Muxer
        for (let i = 0; i < allFrames.length; i++) {
            // Konversi ImageBitmap ke VideoFrame API
            const vf = new VideoFrame(allFrames[i], { timestamp: i * FRAME_INTERVAL * 1000 });
            videoEncoder.encode(vf, { keyFrame: i % 30 === 0 });
            vf.close();
        }

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
        resultView.classList.add('hidden');
        
        // Bebaskan RAM
        [...livePhotoData.pre, ...livePhotoData.post].forEach(bmp => {
            if(bmp && !bmp.isClosed) bmp.close();
        });
        if(livePhotoData.key) livePhotoData.key.close();
        
        livePhotoData = { pre: [], key: null, post: [] };
        finalVideoBlob = null;
    });
});
