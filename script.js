document.addEventListener('DOMContentLoaded', async () => {
    const videoCam = document.getElementById('hidden-camera');
    const canvas = document.getElementById('viewfinder');
    const ctx = canvas.getContext('2d');
    const btnShutter = document.getElementById('btn-shutter');
    const statusText = document.getElementById('status-text');
    const modal = document.getElementById('result-modal');
    const resultVideo = document.getElementById('result-video');
    const btnDownload = document.getElementById('btn-download');

    let isFlashing = false;
    let isFrozen = false;
    let renderStream;
    let finalVideoBlob = null;

    // 1. Inisialisasi Kamera
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
            audio: true // Merekam suara juga biar seperti video asli
        });
        videoCam.srcObject = stream;
        
        // Atur ukuran canvas menyesuaikan kamera
        videoCam.onloadedmetadata = () => {
            canvas.width = videoCam.videoWidth;
            canvas.height = videoCam.videoHeight;
        };
    } catch (err) {
        alert("Gagal mengakses kamera/mic. Pastikan izin diberikan.");
    }

    // 2. Render Loop (Menggambar Kamera ke Canvas secara Real-time)
    function drawToCanvas() {
        if (!isFrozen) {
            // Jika tidak freeze, gambar video langsung ke canvas
            ctx.drawImage(videoCam, 0, 0, canvas.width, canvas.height);
        }
        
        if (isFlashing) {
            // Efek Flash Putih tiba-tiba
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        requestAnimationFrame(drawToCanvas);
    }
    // Mulai loop visual
    drawToCanvas();

    // 3. Logika Tren "Foto Live" saat tombol ditekan
    btnShutter.addEventListener('click', async () => {
        btnShutter.disabled = true;
        statusText.innerText = "🔴 MEREKAM...";
        statusText.classList.add('recording');

        // Setup MediaRecorder untuk merekam isi Canvas
        const canvasStream = canvas.captureStream(30); // 30 FPS
        
        // Gabungkan track video dari canvas dengan track audio dari mic
        const audioTracks = videoCam.srcObject.getAudioTracks();
        const combinedStream = new MediaStream([...canvasStream.getTracks(), ...audioTracks]);
        
        const recorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm' });
        const chunks = [];
        recorder.ondataavailable = e => chunks.push(e.data);
        
        recorder.start();

        // SCENE 1: Biarkan video berjalan normal selama 2 detik
        await new Promise(r => setTimeout(r, 2000));

        // SCENE 2: EFEK FLASH (100 milidetik)
        isFlashing = true;
        await new Promise(r => setTimeout(r, 100));
        isFlashing = false;

        // SCENE 3: FREEZE FRAME (Membeku menunjukkan hasil)
        isFrozen = true; 
        
        // Biarkan membeku selama 3 detik sambil terus direkam
        await new Promise(r => setTimeout(r, 3000));

        // SCENE 4: Selesai merekam
        recorder.stop();
        isFrozen = false; // Kembalikan kamera ke normal
        statusText.innerText = "Siap Merekam";
        statusText.classList.remove('recording');

        // Proses hasil video
        recorder.onstop = () => {
            finalVideoBlob = new Blob(chunks, { type: 'video/webm' });
            const videoUrl = URL.createObjectURL(finalVideoBlob);
            
            // Tampilkan ke Modal
            resultVideo.src = videoUrl;
            modal.classList.remove('hidden');
            btnShutter.disabled = false;
        };
    });

    // 4. Tutup Modal
    document.getElementById('btn-close-modal').addEventListener('click', () => {
        modal.classList.add('hidden');
        resultVideo.pause();
    });

    // 5. Download Hasil Video Utuh
    btnDownload.addEventListener('click', () => {
        if (!finalVideoBlob) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(finalVideoBlob);
        a.download = `FotoLive_Trend_${Date.now()}.webm`;
        a.click();
    });
});
