document.addEventListener('DOMContentLoaded', async () => {
    const videoCam = document.getElementById('hidden-camera');
    const canvas = document.getElementById('viewfinder');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const btnShutter = document.getElementById('btn-shutter');
    const statusText = document.getElementById('status-text');
    const modal = document.getElementById('result-modal');
    const resultVideo = document.getElementById('result-video');
    const btnDownload = document.getElementById('btn-download');

    // --- KONFIGURASI APPLE LIVE PHOTO ---
    const TARGET_FPS = 60;
    const FRAME_INTERVAL = 1000 / TARGET_FPS;
    const PRE_SHUTTER_DURATION = 1500; // 1.5 detik sebelum shutter (ms)
    const POST_SHUTTER_DURATION = 1500; // 1.5 detik sesudah shutter (ms)
    const MAX_BUFFER_FRAMES = Math.ceil(PRE_SHUTTER_DURATION / FRAME_INTERVAL);
    const POST_SHUTTER_FRAMES = Math.ceil(POST_SHUTTER_DURATION / FRAME_INTERVAL);

    let frameBuffer = []; // Circular buffer di RAM
    let isFlashing = false;
    let isCapturingLive = false;
    let postShutterCount = 0;
    
    let lastDrawTime = 0;
    let finalVideoBlob = null;
    let bestFrameBitmap = null;

    // Audio Shutter (Pastikan URL audio valid/lokal di project Anda)
    const shutterSound = new Audio('https://www.soundjay.com/mechanical/camera-shutter-click-01.mp3'); 
    shutterSound.volume = 1.0;

    // --- SETUP UI MODAL UNTUK LIVE PHOTO BEHAVIOR ---
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
    liveVideo.loop = false; // Mainkan sekali lalu berhenti
    liveVideo.playsInline = true;

    liveContainer.appendChild(liveVideo);
    liveContainer.appendChild(photoImg);
    modal.insertBefore(liveContainer, btnDownload);

    // --- 1. INISIALISASI KAMERA (Request 60 FPS) ---
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

    // --- 2. RENDER LOOP & CIRCULAR BUFFER (Terus Berjalan) ---
    async function drawAndBuffer(timestamp) {
        if (!lastDrawTime) lastDrawTime = timestamp;
        const deltaTime = timestamp - lastDrawTime;

        // Gambar ke canvas view finder
        ctx.drawImage(videoCam, 0, 0, canvas.width, canvas.height);

        // Efek Flash Putih Sangat Cepat (~100ms)
        if (isFlashing) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        // Buffer frame ke RAM sesuai FPS
        if (deltaTime >= FRAME_INTERVAL) {
            lastDrawTime = timestamp;
            
            // Simpan frame saat ini ke memori
            const bitmap = await createImageBitmap(canvas);

            if (!isCapturingLive) {
                // Mode Standby: Jaga buffer tetap memegang 1.5 detik terakhir
                frameBuffer.push(bitmap);
                if (frameBuffer.length > MAX_BUFFER_FRAMES) {
                    const oldFrame = frameBuffer.shift();
                    oldFrame.close(); // Bersihkan RAM
                }
            } else if (postShutterCount < POST_SHUTTER_FRAMES) {
                // Mode Merekam: Tambahkan frame setelah shutter ditekan
                frameBuffer.push(bitmap);
                postShutterCount++;

                if (postShutterCount === POST_SHUTTER_FRAMES) {
                    processLivePhoto(); // Selesai merekam, proses penggabungan
                }
            }
        }

        requestAnimationFrame(drawAndBuffer);
    }

    // --- 3. LOGIKA SHUTTER DITEKAN ---
    btnShutter.addEventListener('click', () => {
        if (isCapturingLive) return;

        btnShutter.disabled = true;
        isCapturingLive = true;
        postShutterCount = 0;
        statusText.innerText = "Memproses Live Photo...";

        // Efek Shutter (Audio & Vibrasi)
        shutterSound.currentTime = 0;
        shutterSound.play();
        if (navigator.vibrate) navigator.vibrate(40);
        
        // Efek Flash Putih (100ms)
        isFlashing = true;
        setTimeout(() => isFlashing = false, 100);

        // Efek Scale Kecil pada Preview (UI Feedback)
        canvas.style.transform = 'scale(0.97)';
        canvas.style.transition = 'transform 0.15s ease-out';
        setTimeout(() => { canvas.style.transform = 'scale(1)'; }, 150);
        
        // Catatan: Perekaman tidak dimulai di sini, melainkan dilanjutkan di dalam drawAndBuffer()
    });

    // --- 4. ANALISIS BEST FRAME (Ketajaman) ---
    function extractBestFrame(frames) {
        let bestIndex = MAX_BUFFER_FRAMES - 1; // Default: Frame tepat saat tombol ditekan
        let maxSharpness = 0;

        // Cek 5 frame di sekitar momen shutter ditekan
        const checkRange = 5; 
        const start = Math.max(0, bestIndex - checkRange);
        const end = Math.min(frames.length - 1, bestIndex + checkRange);

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width / 4; // Downscale agar ringan
        tempCanvas.height = canvas.height / 4;
        const tCtx = tempCanvas.getContext('2d', { willReadFrequently: true });

        for (let i = start; i <= end; i++) {
            tCtx.drawImage(frames[i], 0, 0, tempCanvas.width, tempCanvas.height);
            const imageData = tCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height).data;
            
            // Hitung kontras pixel bersebelahan (estimasi ketajaman)
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

    // --- 5. PROSES PENGGABUNGAN MOTION CLIP ---
    async function processLivePhoto() {
        bestFrameBitmap = extractBestFrame(frameBuffer);
        
        const renderCanvas = document.createElement('canvas');
        renderCanvas.width = canvas.width;
        renderCanvas.height = canvas.height;
        const renderCtx = renderCanvas.getContext('2d');

        const stream = renderCanvas.captureStream(TARGET_FPS);
        const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
        const chunks = [];

        recorder.ondataavailable = e => chunks.push(e.data);
        recorder.onstop = () => {
            finalVideoBlob = new Blob(chunks, { type: 'video/webm' });
            liveVideo.src = URL.createObjectURL(finalVideoBlob);
            
            // Jadikan best frame sebagai thumbnail beku
            renderCtx.drawImage(bestFrameBitmap, 0, 0);
            photoImg.src = renderCanvas.toDataURL('image/jpeg', 0.95);

            // Reset Buffer
            frameBuffer.forEach(bmp => bmp.close());
            frameBuffer = [];
            isCapturingLive = false;
            btnShutter.disabled = false;
            statusText.innerText = "Siap Merekam";

            // Tampilkan Modal
            modal.classList.remove('hidden');
        };

        recorder.start();

        // Render urutan frame ke dalam video secara internal
        for (const frame of frameBuffer) {
            renderCtx.drawImage(frame, 0, 0);
            await new Promise(r => setTimeout(r, FRAME_INTERVAL)); 
        }

        recorder.stop();
    }

    // --- 6. TRANSISI PEMUTARAN (Long Press / Haptic Touch) ---
    function playLivePhoto() {
        if (!finalVideoBlob) return;
        liveVideo.currentTime = 0;
        liveVideo.play();
        
        // Transisi halus: hilangkan foto, kecilkan video sedikit
        photoImg.style.opacity = '0';
        liveVideo.style.transform = 'scale(0.98)';
        
        if (navigator.vibrate) navigator.vibrate(20);
    }

    function stopLivePhoto() {
        liveVideo.pause();
        
        // Kembalikan seketika ke thumbnail
        photoImg.style.opacity = '1';
        liveVideo.style.transform = 'scale(1)';
    }

    // Listener interaksi tekan lama (Desktop & Mobile)
    liveContainer.addEventListener('mousedown', playLivePhoto);
    liveContainer.addEventListener('touchstart', (e) => { e.preventDefault(); playLivePhoto(); });
    
    liveContainer.addEventListener('mouseup', stopLivePhoto);
    liveContainer.addEventListener('mouseleave', stopLivePhoto);
    liveContainer.addEventListener('touchend', stopLivePhoto);

    // Otomatis berhenti jika video habis
    liveVideo.addEventListener('ended', stopLivePhoto);

    // --- 7. TUTUP MODAL ---
    document.getElementById('btn-close-modal').addEventListener('click', () => {
        modal.classList.add('hidden');
        stopLivePhoto();
    });

    // --- 8. DOWNLOAD ---
    btnDownload.addEventListener('click', () => {
        if (!finalVideoBlob) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(finalVideoBlob);
        a.download = `LiveShot_${Date.now()}.webm`;
        a.click();
    });
});
