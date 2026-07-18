document.addEventListener('DOMContentLoaded', async () => {
    const videoCam = document.getElementById('hidden-camera');
    const canvas = document.getElementById('viewfinder');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const btnShutter = document.getElementById('btn-shutter');
    const statusText = document.getElementById('status-text');
    const modal = document.getElementById('result-modal');
    const resultVideo = document.getElementById('result-video');
    const btnDownload = document.getElementById('btn-download');

    // KONFIGURASI APPLE LIVE PHOTO
    const TARGET_FPS = 60;
    const FRAME_INTERVAL = 1000 / TARGET_FPS;
    const PRE_SHUTTER_DURATION = 1500; // 1.5 detik sebelum (ms)
    const POST_SHUTTER_DURATION = 1500; // 1.5 detik sesudah (ms)
    const MAX_BUFFER_FRAMES = Math.ceil(PRE_SHUTTER_DURATION / FRAME_INTERVAL);
    const POST_SHUTTER_FRAMES = Math.ceil(POST_SHUTTER_DURATION / FRAME_INTERVAL);

    let frameBuffer = []; // Circular buffer di RAM
    let isFlashing = false;
    let isCapturingLive = false;
    let postShutterCount = 0;
    
    let lastDrawTime = 0;
    let finalVideoBlob = null;
    let bestFrameBitmap = null;

    // Audio Shutter
    const shutterSound = new Audio('https://www.soundjay.com/mechanical/camera-shutter-click-01.mp3'); // Ganti dengan aset lokal Anda
    shutterSound.volume = 1.0;

    // Setup UI Modal untuk Live Photo Behavior
    resultVideo.style.display = 'none'; // Sembunyikan player bawaan
    const liveContainer = document.createElement('div');
    liveContainer.style.position = 'relative';
    liveContainer.style.width = '100%';
    liveContainer.style.height = '100%';
    liveContainer.style.flexGrow = '1';
    liveContainer.style.overflow = 'hidden';
    liveContainer.style.background = '#000';
    
    const photoImg = document.createElement('img');
    photoImg.style.position = 'absolute';
    photoImg.style.width = '100%';
    photoImg.style.height = '100%';
    photoImg.style.objectFit = 'contain';
    photoImg.style.zIndex = '2';
    photoImg.style.transition = 'opacity 0.3s ease-in-out, transform 0.3s ease-out'; // Crossfade halus
    
    const liveVideo = document.createElement('video');
    liveVideo.style.position = 'absolute';
    liveVideo.style.width = '100%';
    liveVideo.style.height = '100%';
    liveVideo.style.objectFit = 'contain';
    liveVideo.style.zIndex = '1';
    liveVideo.muted = false;
    liveVideo.loop = false; // Mainkan sekali
    liveVideo.playsInline = true;

    liveContainer.appendChild(liveVideo);
    liveContainer.appendChild(photoImg);
    modal.insertBefore(liveContainer, btnDownload);

    // 1. Inisialisasi Kamera (Request 60 FPS)
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } },
            audio: true
        });
        videoCam.srcObject = stream;
        
        videoCam.onloadedmetadata = () => {
            canvas.width = videoCam.videoWidth;
            canvas.height = videoCam.videoHeight;
            requestAnimationFrame(drawAndBuffer);
        };
    } catch (err) {
        alert("Gagal mengakses kamera. Pastikan izin diberikan.");
    }

    // 2. Render Loop & Circular Buffer (Berjalan terus menerus)
    async function drawAndBuffer(timestamp) {
        if (!lastDrawTime) lastDrawTime = timestamp;
        const deltaTime = timestamp - lastDrawTime;

        // Gambar ke canvas view finder
        ctx.drawImage(videoCam, 0, 0, canvas.width, canvas.height);

        // Efek Flash Shutter (Sangat Cepat ~100ms)
        if (isFlashing) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        // Buffer frame ke RAM jika saatnya
        if (deltaTime >= FRAME_INTERVAL) {
            lastDrawTime = timestamp;
            const bitmap = await createImageBitmap(canvas);

            if (!isCapturingLive) {
                // Mode Standby: Jaga buffer tetap di 1.5 detik terakhir
                frameBuffer.push(bitmap);
                if (frameBuffer.length > MAX_BUFFER_FRAMES) {
                    const oldFrame = frameBuffer.shift();
                    oldFrame.close(); // Bersihkan RAM
                }
            } else if (postShutterCount < POST_SHUTTER_FRAMES) {
                // Mode Merekam (Setelah shutter ditekan)
                frameBuffer.push(bitmap);
                postShutterCount++;

                if (postShutterCount === POST_SHUTTER_FRAMES) {
                    processLivePhoto(); // Selesai merekam
                }
            }
        }

        requestAnimationFrame(drawAndBuffer);
    }

    // 3. Logika Shutter
    btnShutter.addEventListener('click', () => {
        if (isCapturingLive) return;

        btnShutter.disabled = true;
        isCapturingLive = true;
        postShutterCount = 0;
        statusText.innerText = "Memproses Live Photo...";

        // Efek Shutter Visual & Fisik
        shutterSound.currentTime = 0;
        shutterSound.play(); // Sinkron audio shutter
        
        if (navigator.vibrate) navigator.vibrate(40); // Getaran halus
        
        // Flash 100ms
        isFlashing = true;
        setTimeout(() => isFlashing = false, 100);

        // Scale kecil preview
        canvas.style.transform = 'scale(0.97)';
        canvas.style.transition = 'transform 0.15s ease-out';
        setTimeout(() => { canvas.style.transform = 'scale(1)'; }, 150);
        
        // Kamera/Video TIDAK DIHENTIKAN. Terus merekam di background.
    });

    // 4. Analisis Frame (Mencari Gambar Paling Tajam & Exposure Terbaik)
    function extractBestFrame(frames) {
        // Karena proses deteksi mata/wajah butuh ML (lambat), 
        // kita ambil frame saat shutter ditekan sebagai baseline, 
        // dan mengecek sharpness sederhana (varian kontras) di 5 frame sekitarnya.
        let bestIndex = MAX_BUFFER_FRAMES - 1; // Default: Frame tepat saat ditekan
        let maxSharpness = 0;

        const checkRange = 5; 
        const start = Math.max(0, bestIndex - checkRange);
        const end = Math.min(frames.length - 1, bestIndex + checkRange);

        // Hidden canvas untuk kalkulasi pixel
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width / 4; // Downscale untuk performa
        tempCanvas.height = canvas.height / 4;
        const tCtx = tempCanvas.getContext('2d', { willReadFrequently: true });

        for (let i = start; i <= end; i++) {
            tCtx.drawImage(frames[i], 0, 0, tempCanvas.width, tempCanvas.height);
            const imageData = tCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height).data;
            
            // Estimasi sharpness (sederhana) dari selisih pixel berdekatan
            let sharpness = 0;
            for (let j = 0; j < imageData.length - 4; j += 4) {
                sharpness += Math.abs(imageData[j] - imageData[j+4]);
            }

            if (sharpness > maxSharpness) {
                maxSharpness = sharpness;
                bestIndex = i;
            }
        }
        return frames[bestIndex];
    }

    // 5. Proses Penggabungan (Motion Clip)
    async function processLivePhoto() {
        // Ambil Best Frame sebagai Thumbnail
        bestFrameBitmap = extractBestFrame(frameBuffer);
        
        // Buat canvas sementara untuk merender ulang video dari buffer
        const renderCanvas = document.createElement('canvas');
        renderCanvas.width = canvas.width;
        renderCanvas.height = canvas.height;
        const renderCtx = renderCanvas.getContext('2d');

        // Render buffer menjadi satu Video Clip
        const stream = renderCanvas.captureStream(TARGET_FPS);
        const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
        const chunks = [];

        recorder.ondataavailable = e => chunks.push(e.data);
        recorder.onstop = () => {
            finalVideoBlob = new Blob(chunks, { type: 'video/webm' });
            liveVideo.src = URL.createObjectURL(finalVideoBlob);
            
            // Set Thumbnail
            renderCtx.drawImage(bestFrameBitmap, 0, 0);
            photoImg.src = renderCanvas.toDataURL('image/jpeg', 0.95);

            // Bersihkan Buffer untuk shoot berikutnya
            frameBuffer.forEach(bmp => bmp.close());
            frameBuffer = [];
            isCapturingLive = false;
            btnShutter.disabled = false;
            statusText.innerText = "Siap Merekam";

            // Tampilkan Modal
            modal.classList.remove('hidden');
        };

        recorder.start();

        // Mainkan frame ke render canvas (tanpa terlihat user)
        for (const frame of frameBuffer) {
            renderCtx.drawImage(frame, 0, 0);
            await new Promise(r => setTimeout(r, FRAME_INTERVAL)); // Sinkronisasi timing 60fps
        }

        recorder.stop();
    }

    // 6. Transisi Apple Live Photo (Haptic Touch / Long Press)
    function playLivePhoto() {
        if (!finalVideoBlob) return;
        liveVideo.currentTime = 0;
        liveVideo.play();
        
        // Efek Crossfade dan scale kecil
        photoImg.style.opacity = '0';
        liveVideo.style.transform = 'scale(0.98)';
        
        // Vibrasi kecil saat mulai
        if (navigator.vibrate) navigator.vibrate(20);
    }

    function stopLivePhoto() {
        liveVideo.pause();
        
        // Kembali ke Thumbnail persis di frame terbaik
        photoImg.style.opacity = '1';
        liveVideo.style.transform = 'scale(1)';
    }

    // Event Listener untuk Long Press di Container Live Photo
    liveContainer.addEventListener('mousedown', playLivePhoto);
    liveContainer.addEventListener('touchstart', (e) => { e.preventDefault(); playLivePhoto(); });
    
    liveContainer.addEventListener('mouseup', stopLivePhoto);
    liveContainer.addEventListener('mouseleave', stopLivePhoto);
    liveContainer.addEventListener('touchend', stopLivePhoto);

    // Pastikan video berakhir di frame thumbnail jika tidak dilepas
    liveVideo.addEventListener('ended', stopLivePhoto);

    // 7. Tutup Modal
    document.getElementById('btn-close-modal').addEventListener('click', () => {
        modal.classList.add('hidden');
        stopLivePhoto();
    });

    // 8. Download
    btnDownload.addEventListener('click', () => {
        if (!finalVideoBlob) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(finalVideoBlob);
        a.download = `LivePhoto_${Date.now()}.webm`;
        a.click();
    });
});
