// buffer.js
class LiveBuffer {
    constructor(keepSeconds = 4) {
        this.keepMs = keepSeconds * 1000;
        this.chunks = [];
        this.recorder = null;
        this.isBuffering = false;
    }

    start(stream) {
        // Coba format WebM atau MP4 tergantung browser
        const mimeType = MediaRecorder.isTypeSupported('video/webm; codecs=vp8,opus') 
            ? 'video/webm; codecs=vp8,opus' 
            : 'video/mp4';

        this.recorder = new MediaRecorder(stream, { mimeType });

        this.recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
                this.chunks.push({ time: Date.now(), data: e.data });
                
                // Hapus buffer yang lebih tua dari batas keepMs (Circular Buffer)
                const cutoff = Date.now() - this.keepMs;
                while (this.chunks.length > 0 && this.chunks[0].time < cutoff) {
                    this.chunks.shift();
                }
            }
        };

        // Rekam dalam slice kecil agar bisa dipotong presisi
        this.recorder.start(200); 
        this.isBuffering = true;
    }

    stop() {
        if (this.recorder && this.recorder.state !== 'inactive') {
            this.recorder.stop();
        }
        this.isBuffering = false;
        this.chunks = [];
    }

    // Mengambil buffer video (sebelum dan sesudah shutter ditekan)
    async getCompiledBlob() {
        if (this.chunks.length === 0) return null;
        const blob = new Blob(this.chunks.map(c => c.data), { type: this.recorder.mimeType });
        return blob;
    }
}

const liveBuffer = new LiveBuffer(5); // Menyimpan 5 detik di RAM
