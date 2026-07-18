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
                currentStream.getTracks().forEach(track => track.stop());[span_1](start_span)[span_1](end_span)
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    facingMode: 'environment',[span_2](start_span)[span_2](end_span)
                    width: { ideal: 2560 }, // 1440p (Batas maksimal RAM mobile browser sebelum crash)[span_3](start_span)[span_3](end_span)
                    height: { ideal: 1440 },[span_4](start_span)[span_4](end_span)
                    frameRate: { ideal: 30 }[span_5](start_span)[span_5](end_span)
                }
            });
            
            currentStream = stream;[span_6](start_span)[span_6](end_span)
            videoCam.srcObject = stream;[span_7](start_span)[span_7](end_span)
            
            // FIX: Pasang listener onloadedmetadata SEBELUM memanggil play()
            // Langkah ini memastikan browser siap menangkap frame ketika streaming aktif
            videoCam.onloadedmetadata = () => {
                canvas.width = videoCam.videoWidth;[span_8](start_span)[span_8](end_span)
                canvas.height = videoCam.videoHeight;[span_9](start_span)[span_9](end_span)
                playbackCanvas.width = videoCam.videoWidth;[span_10](start_span)[span_10](end_span)
                playbackCanvas.height = videoCam.videoHeight;[span_11](start_span)[span_11](end_span)
                
                if (!isCameraLooping) {
                    isCameraLooping = true;[span_12](start_span)[span_12](end_span)
                    requestAnimationFrame(cameraLoop);[span_13](start_span)[span_13](end_span)
                }
            };

            // Panggil play() setelah listener terpasang dengan aman
            await videoCam.play();[span_14](start_span)[span_14](end_span)

        } catch (err) {
            console.error("Camera Init Error:", err);[span_15](start_span)[span_15](end_span)
            alert("Kamera gagal diakses. Pastikan izin diberikan.");[span_16](start_span)[span_16](end_span)
        }
    }

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
            if (resultView.classList.contains('hidden')) initCamera();[span_17](start_span)[span_17](end_span)
        } else {
            if (currentStream) currentStream.getTracks().forEach(track => track.stop());[span_18](start_span)[span_18](end_span)
        }
    });

    initCamera();[span_19](start_span)[span_19](end_span)

    // 2. Continuous Ring Buffer (Direct GPU Capture)
    async function cameraLoop(timestamp) {
        if (!isCameraLooping) return;[span_20](start_span)[span_20](end_span)

        if (timestamp - lastDrawTime >= FRAME_INTERVAL) {
            lastDrawTime = timestamp;[span_21](start_span)[span_21](end_span)
            
            if (videoCam.readyState >= 2 && !videoCam.paused) {[span_22](start_span)[span_22](end_span)
                try {
                    ctx.drawImage(videoCam, 0, 0, canvas.width, canvas.height);[span_23](start_span)[span_23](end_span)
                    
                    // Bypass canvas rendering delay, tangkap pixel mentah langsung dari GPU
                    const bitmap = await createImageBitmap(videoCam);[span_24](start_span)[span_24](end_span)

                    if (isCapturing) {[span_25](start_span)[span_25](end_span)
                        postCaptureFrames.push(bitmap);[span_26](start_span)[span_26](end_span)
                        if (postCaptureFrames.length >= POST_FRAMES) finalizeLivePhoto();[span_27](start_span)[span_27](end_span)
                    } else {
                        ringBuffer.push(bitmap);[span_28](start_span)[span_28](end_span)
                        if (ringBuffer.length > PRE_FRAMES) {[span_29](start_span)[span_29](end_span)
                            const oldFrame = ringBuffer.shift();[span_30](start_span)[span_30](end_span)
                            oldFrame.close();[span_31](start_span)[span_31](end_span)
                        }
                    }
                } catch (e) {}
            }
        }
        requestAnimationFrame(cameraLoop);[span_32](start_span)[span_32](end_span)
    }

    // 3. Shutter Ditekan
    btnShutter.addEventListener('click', async () => {
        if (isCapturing || videoCam.readyState < 2) return;[span_33](start_span)[span_33](end_span)

        shutterSound.currentTime = 0;[span_34](start_span)[span_34](end_span)
        shutterSound.play().catch(e => console.log("Audio error:", e));[span_35](start_span)[span_35](end_span)
        if (navigator.vibrate) navigator.vibrate(10);[span_36](start_span)[span_36](end_span)

        flashOverlay.classList.add('flash-active');[span_37](start_span)[span_37](end_span)
        setTimeout(() => flashOverlay.classList.remove('flash-active'), 150);[span_38](start_span)[span_38](end_span)

        canvas.classList.add('shutter-shrink');[span_39](start_span)[span_39](end_span)
        setTimeout(() => canvas.classList.remove('shutter-shrink'), 250);[span_40](start_span)[span_40](end_span)

        isCapturing = true;[span_41](start_span)[span_41](end_span)
        livePhotoData.key = await createImageBitmap(videoCam);[span_42](start_span)[span_42](end_span)
        livePhotoData.pre = [...ringBuffer];[span_43](start_span)[span_43](end_span)
        ringBuffer = [];[span_44](start_span)[span_44](end_span)
        postCaptureFrames = [];[span_45](start_span)[span_45](end_span)
    });

    // 4. Finalisasi
    function finalizeLivePhoto() {
        isCapturing = false;[span_46](start_span)[span_46](end_span)
        livePhotoData.post = [...postCaptureFrames];[span_47](start_span)[span_47](end_span)
        resultView.classList.remove('hidden');[span_48](start_span)[span_48](end_span)
        
        startPlayback();[span_49](start_span)[span_49](end_span)
        encodeVideoBackground();[span_50](start_span)[span_50](end_span)
    }

    // 5. Playback Logic (Smooth Blend)
    let isPlaying = false;[span_51](start_span)[span_51](end_span)
    let playbackAnimationId = null;[span_52](start_span)[span_52](end_span)
    let crossfadeId = null;[span_53](start_span)[span_53](end_span)
    
    function startPlayback() {
        if (isPlaying) return;[span_54](start_span)[span_54](end_span)
        isPlaying = true;[span_55](start_span)[span_55](end_span)
        
        if (crossfadeId) {
            cancelAnimationFrame(crossfadeId);[span_56](start_span)[span_56](end_span)
            crossfadeId = null;[span_57](start_span)[span_57](end_span)
            playCtx.globalAlpha = 1;[span_58](start_span)[span_58](end_span)
        }
        
        const allFrames = [...livePhotoData.pre, livePhotoData.key, ...livePhotoData.post];[span_59](start_span)[span_59](end_span)
        let frameIndex = 0;[span_60](start_span)[span_60](end_span)
        let lastPlayTime = performance.now();[span_61](start_span)[span_61](end_span)

        function playLoop(timestamp) {
            if (!isPlaying) return;[span_62](start_span)[span_62](end_span)
            
            if (timestamp - lastPlayTime >= FRAME_INTERVAL) {
                playCtx.globalAlpha = 1;[span_63](start_span)[span_63](end_span)
                playCtx.drawImage(allFrames[frameIndex], 0, 0);[span_64](start_span)[span_64](end_span)
                frameIndex++;[span_65](start_span)[span_65](end_span)
                lastPlayTime = timestamp;[span_66](start_span)[span_66](end_span)
            }
            
            if (frameIndex < allFrames.length) {
                playbackAnimationId = requestAnimationFrame(playLoop);[span_67](start_span)[span_67](end_span)
            } else {
                stopPlayback();[span_68](start_span)[span_68](end_span)
            }
        }
        playbackAnimationId = requestAnimationFrame(playLoop);[span_69](start_span)[span_69](end_span)
    }

    function stopPlayback() {
        if (!isPlaying && !playbackAnimationId) return;[span_70](start_span)[span_70](end_span)
        isPlaying = false;[span_71](start_span)[span_71](end_span)
        
        if (playbackAnimationId) cancelAnimationFrame(playbackAnimationId);[span_72](start_span)[span_72](end_span)
        playbackAnimationId = null;[span_73](start_span)[span_73](end_span)
        
        const currentFrameCanvas = document.createElement('canvas');[span_74](start_span)[span_74](end_span)
        currentFrameCanvas.width = canvas.width;[span_75](start_span)[span_75](end_span)
        currentFrameCanvas.height = canvas.height;[span_76](start_span)[span_76](end_span)
        currentFrameCanvas.getContext('2d', { alpha: false }).drawImage(playbackCanvas, 0, 0);[span_77](start_span)[span_77](end_span)

        let startTime = performance.now();[span_78](start_span)[span_78](end_span)
        const duration = 250;[span_79](start_span)[span_79](end_span)

        function fadeBack(timestamp) {
            let elapsed = timestamp - startTime;[span_80](start_span)[span_80](end_span)
            let progress = Math.min(elapsed / duration, 1);[span_81](start_span)[span_81](end_span)
            let ease = 1 - Math.pow(1 - progress, 3);[span_82](start_span)[span_82](end_span)
            
            playCtx.globalAlpha = 1;[span_83](start_span)[span_83](end_span)
            playCtx.drawImage(currentFrameCanvas, 0, 0);[span_84](start_span)[span_84](end_span)
            
            playCtx.globalAlpha = ease;[span_85](start_span)[span_85](end_span)
            playCtx.drawImage(livePhotoData.key, 0, 0);[span_86](start_span)[span_86](end_span)
            
            if (progress < 1) {
                crossfadeId = requestAnimationFrame(fadeBack);[span_87](start_span)[span_87](end_span)
            } else {
                playCtx.globalAlpha = 1;[span_88](start_span)[span_88](end_span)
                crossfadeId = null;[span_89](start_span)[span_89](end_span)
            }
        }
        crossfadeId = requestAnimationFrame(fadeBack);[span_90](start_span)[span_90](end_span)
    }

    playbackCanvas.addEventListener('pointerdown', startPlayback);[span_91](start_span)[span_91](end_span)
    window.addEventListener('pointerup', stopPlayback);[span_92](start_span)[span_92](end_span)
    playbackCanvas.addEventListener('pointerleave', stopPlayback);[span_93](start_span)[span_93](end_span)

    // 6. ADVANCED BACKGROUND ENCODING (Super HD 10 Mbps)
    async function encodeVideoBackground() {
        btnDownload.disabled = true;[span_94](start_span)[span_94](end_span)
        btnDownload.innerText = "Memproses Super HD...";[span_95](start_span)[span_95](end_span)
        
        const preFrames = livePhotoData.pre;[span_96](start_span)[span_96](end_span)
        const keyFrame = livePhotoData.key;[span_97](start_span)[span_97](end_span)
        const postFrames = livePhotoData.post;[span_98](start_span)[span_98](end_span)
        const mainFrames = [...preFrames, keyFrame, ...postFrames];[span_99](start_span)[span_99](end_span)
        
        const muxer = new WebMMuxer.Muxer({
            target: new WebMMuxer.ArrayBufferTarget(),[span_100](start_span)[span_100](end_span)
            video: { codec: 'V_VP8', width: canvas.width, height: canvas.height, frameRate: FPS }[span_101](start_span)[span_101](end_span)
        });

        const videoEncoder = new VideoEncoder({
            output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),[span_102](start_span)[span_102](end_span)
            error: e => console.error("Encoder Error", e)[span_103](start_span)[span_103](end_span)
        });

        // UPGRADE EXTREME: Bitrate dinaikkan ke 10.000.000 (10 Mbps) untuk menampung detail 1440p
        videoEncoder.configure({
            codec: 'vp8', width: canvas.width, height: canvas.height, bitrate: 10000000, framerate: FPS[span_104](start_span)[span_104](end_span)
        });

        let currentTimestamp = 0;[span_105](start_span)[span_105](end_span)
        let frameCount = 0;[span_106](start_span)[span_106](end_span)

        const pushToEncoder = async (imageSource) => {
            const vf = new VideoFrame(imageSource, { timestamp: currentTimestamp });[span_107](start_span)[span_107](end_span)
            videoEncoder.encode(vf, { keyFrame: frameCount % 30 === 0 });[span_108](start_span)[span_108](end_span)
            vf.close();[span_109](start_span)[span_109](end_span)
            currentTimestamp += FRAME_INTERVAL * 1000;[span_110](start_span)[span_110](end_span)
            frameCount++;[span_111](start_span)[span_111](end_span)
        };

        for (let i = 0; i < mainFrames.length; i++) {
            await pushToEncoder(mainFrames[i]);[span_112](start_span)[span_112](end_span)
        }

        const offscreen = new OffscreenCanvas(canvas.width, canvas.height);[span_113](start_span)[span_113](end_span)
        const oCtx = offscreen.getContext('2d', { alpha: false });[span_114](start_span)[span_114](end_span)
        const lastMotionFrame = mainFrames[mainFrames.length - 1];[span_115](start_span)[span_115](end_span)
        const fadeDuration = 250;[span_116](start_span)[span_116](end_span)
        const fadeFramesCount = Math.round(fadeDuration / FRAME_INTERVAL);[span_117](start_span)[span_117](end_span)

        for (let i = 0; i <= fadeFramesCount; i++) {
            let progress = i / fadeFramesCount;[span_118](start_span)[span_118](end_span)
            let ease = 1 - Math.pow(1 - progress, 3);[span_119](start_span)[span_119](end_span)

            oCtx.globalAlpha = 1;[span_120](start_span)[span_120](end_span)
            oCtx.drawImage(lastMotionFrame, 0, 0);[span_121](start_span)[span_121](end_span)
            oCtx.globalAlpha = ease;[span_122](start_span)[span_122](end_span)
            oCtx.drawImage(keyFrame, 0, 0);[span_123](start_span)[span_123](end_span)

            const blendedBitmap = await createImageBitmap(offscreen);[span_124](start_span)[span_124](end_span)
            await pushToEncoder(blendedBitmap);[span_125](start_span)[span_125](end_span)
            blendedBitmap.close();[span_126](start_span)[span_126](end_span)
        }

        const holdFramesCount = Math.round(1500 / FRAME_INTERVAL);[span_127](start_span)[span_127](end_span)
        for (let i = 0; i < holdFramesCount; i++) {
            await pushToEncoder(keyFrame);[span_128](start_span)[span_128](end_span)
        }

        await videoEncoder.flush();[span_129](start_span)[span_129](end_span)
        muxer.finalize();[span_130](start_span)[span_130](end_span)
        
        const buffer = muxer.target.buffer;[span_131](start_span)[span_131](end_span)
        finalVideoBlob = new Blob([buffer], { type: 'video/webm' });[span_132](start_span)[span_132](end_span)
        
        btnDownload.disabled = false;[span_133](start_span)[span_133](end_span)
        btnDownload.innerText = "Download Super HD Live Photo";[span_134](start_span)[span_134](end_span)
    }

    // 7. Download
    btnDownload.addEventListener('click', () => {
        if (!finalVideoBlob) return;[span_135](start_span)[span_135](end_span)
        const a = document.createElement('a');[span_136](start_span)[span_136](end_span)
        a.href = URL.createObjectURL(finalVideoBlob);[span_137](start_span)[span_137](end_span)
        a.download = `LivePhoto_SuperHD_${Date.now()}.webm`;[span_138](start_span)[span_138](end_span)
        a.click();[span_139](start_span)[span_139](end_span)
    });

    // 8. Tutup dan Bersihkan Memori (Sangat Penting di Resolusi Tinggi)
    btnBack.addEventListener('click', () => {
        stopPlayback();[span_140](start_span)[span_140](end_span)
        resultView.classList.add('hidden');[span_141](start_span)[span_141](end_span)
        
        [...livePhotoData.pre, ...livePhotoData.post].forEach(bmp => {
            if(bmp && !bmp.isClosed) bmp.close();[span_142](start_span)[span_142](end_span)
        });
        if(livePhotoData.key) livePhotoData.key.close();[span_143](start_span)[span_143](end_span)
        
        livePhotoData = { pre: [], key: null, post: [] };[span_144](start_span)[span_144](end_span)
        finalVideoBlob = null;[span_145](start_span)[span_145](end_span)
        
        if (!currentStream || currentStream.getTracks()[0].readyState === 'ended') {[span_146](start_span)[span_146](end_span)
            initCamera();[span_147](start_span)[span_147](end_span)
        }
    });
});
