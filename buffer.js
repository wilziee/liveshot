// buffer.js - Circular Buffer Video Manager
window.BufferManager = (() => {
    let mediaRecorder;
    let chunks = [];
    const MAX_BUFFER_SECONDS = 3; // Simpan 3 detik ke belakang
    const TIMESLICE_MS = 500; // Pisahkan chunk tiap 500ms
    const MAX_CHUNKS = (MAX_BUFFER_SECONDS * 1000) / TIMESLICE_MS; 

    const startBuffering = (stream) => {
        try {
            // Coba webm berkinerja tinggi, fallback ke mp4 jika didukung browser tertentu
            let mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
            mediaRecorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5000000 });
            
            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunks.push(e.data);
                    // Circular logic: Buang memori video terlama
                    if (chunks.length > MAX_CHUNKS) {
                        chunks.shift();
                    }
                }
            };
            
            mediaRecorder.start(TIMESLICE_MS);
            console.log("🎥 Live Buffer Started");
        } catch (err) {
            console.error("Buffer error:", err);
        }
    };

    const extractBuffer = () => {
        // Mengembalikan salinan chunk saat ini (Mewakili 2-3 detik SEBELUM tombol ditekan)
        return [...chunks]; 
    };

    const resetBuffer = () => {
        chunks = [];
    };

    const stopBuffering = () => {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
    };

    return { startBuffering, extractBuffer, resetBuffer, stopBuffering, TIMESLICE_MS };
})();
