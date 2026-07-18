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

        // 3. Flash Putih (via CSS Class - Sinkronisasi durasi 150ms dengan CSS animation)
        flashOverlay.classList.add('flash-active');
        setTimeout(() => flashOverlay.classList.remove('flash-active'), 150);

        // 4. Viewfinder Mengecil (via CSS Class - Sinkronisasi durasi 250ms dengan CSS animation)
        canvas.classList.add('shutter-shrink');
        setTimeout(() => canvas.classList.remove('shutter-shrink'), 250);
        
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
        
        // Langsung tampilkan hasil secara bersih
        resultView.classList.remove('hidden');
        
        // --- LANGSUNG PUTAR OTOMATIS SATU KALI ---
        startPlayback();

        // Jalankan background encoder (Tidak ganggu UI)
        encodeVideoBackground();
    }

    // 5. Playback Logic (Identik Apple: Auto-play 1x, blend to Key Photo, Tap/Hold untuk ulang)
    let isPlaying = false;
    let playbackAnimationId = null;
    let crossfadeId = null;
    
    function startPlayback() {
        if (isPlaying) return;
        isPlaying = true;
        
        // Batalkan transisi fade jika user menekan layar saat foto sedang kembali ke posisi diam
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
                // Gambar frame dengan opacity solid
                playCtx.globalAlpha = 1;
                playCtx.drawImage(allFrames[frameIndex], 0, 0);
                frameIndex++;
                lastPlayTime = timestamp;
            }
            
            if (frameIndex < allFrames.length) {
                playbackAnimationId = requestAnimationFrame(playLoop);
            } else {
                // Selesai memutar 1 kali -> Lakukan smooth crossfade ke Key Photo persis seperti iOS
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
        
        // --- ILUSI APPLE: Crossfade / Ease back ke Key Photo ---
        // Simpan frame terakhir yang sedang tampil di layar sebagai background
        const currentFrameCanvas = document.createElement('canvas');
        currentFrameCanvas.width = canvas.width;
        currentFrameCanvas.height = canvas.height;
        currentFrameCanvas.getContext('2d', { alpha: false }).drawImage(playbackCanvas, 0, 0);

        let startTime = performance.now();
        const duration = 250; // 250ms ease-out crossfade (Timing standar transisi UI iOS)

        function fadeBack(timestamp) {
            let elapsed = timestamp - startTime;
            let progress = Math.min(elapsed / duration, 1);
            
            // Cubic ease-out untuk meminimalisir kesan mekanis/linear
            let ease = 1 - Math.pow(1 - progress, 3);
            
            // Tahan frame terakhir di belakang
            playCtx.globalAlpha = 1;
            playCtx.drawImage(currentFrameCanvas, 0, 0);
            
            // Timpa dengan Key Photo yang memudar masuk perlahan
            playCtx.globalAlpha = ease;
            playCtx.drawImage(livePhotoData.key, 0, 0);
            
            if (progress < 1) {
                crossfadeId = requestAnimationFrame(fadeBack);
            } else {
                playCtx.globalAlpha = 1; // Reset state
                crossfadeId = null;
            }
        }
        crossfadeId = requestAnimationFrame(fadeBack);
    }

    // Gesture Handling
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
        stopPlayback(); // Pastikan animasi berhenti jika ditutup saat sedang jalan
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
