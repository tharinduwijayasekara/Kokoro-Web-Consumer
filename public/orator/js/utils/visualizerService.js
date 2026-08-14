const VisualizerService = {

    BAR_COUNT: 20,
    SEGMENT_COUNT: 10,
    PADDING: 0,
    SEGMENT_GAP: 0,
    BAR_GAP: 0,

    MIN_FREQ: 85,
    MAX_FREQ: 8000,

    canvas: undefined,
    ctx: undefined,
    container: undefined,

    analyser: undefined,
    freqData: undefined,
    bandBinRanges: undefined,

    dpr: 1,
    rafId: undefined,
    running: false,

    init() {
        this.container = document.getElementById('navbar-audio-visualizer');
        if (!this.container) {
            console.error('[VisualizerService] Container #navbar-audio-visualizer not found');
            return;
        }

        this.canvas = document.createElement('canvas');
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.display = 'block';
        this.canvas.style.backgroundColor = 'transparent';
        this.container.appendChild(this.canvas);

        this.ctx = this.canvas.getContext('2d', { alpha: true, desynchronized: true });
        if (!this.ctx) {
            console.error('[VisualizerService] Failed to get canvas 2D context');
            return;
        }

        this.dpr = Math.min(window.devicePixelRatio || 1, 2);
        console.log('[VisualizerService] Initialized. DPR:', this.dpr);

        this.resize();
        window.addEventListener('resize', () => this.resize(), { passive: true });
        window.addEventListener('orientationchange', () => this.resize(), { passive: true });

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) this.stop();
            else if (ReaderService.isPlaying) this.start();
        });
    },

    resize() {
        if (!this.canvas || !this.container) return;
        const rect = this.container.getBoundingClientRect();
        const w = Math.max(1, Math.round(rect.width * this.dpr));
        const h = Math.max(1, Math.round(rect.height * this.dpr));
        if (this.canvas.width !== w) this.canvas.width = w;
        if (this.canvas.height !== h) this.canvas.height = h;
    },

    ensureHooked() {
        if (this.analyser) return true;

        if (typeof Howler === 'undefined') {
            console.warn('[VisualizerService] Howler not yet loaded');
            return false;
        }
        if (!Howler.ctx) {
            console.warn('[VisualizerService] Howler.ctx not yet initialized');
            return false;
        }
        if (!Howler.masterGain) {
            console.warn('[VisualizerService] Howler.masterGain not yet initialized');
            return false;
        }

        try {
            const ctx = Howler.ctx;
            this.analyser = ctx.createAnalyser();
            this.analyser.fftSize = 512;
            this.analyser.smoothingTimeConstant = 0.75;

            try {
                Howler.masterGain.disconnect(0);
            } catch (e) {
                console.warn('[VisualizerService] masterGain already disconnected:', e.message);
            }

            Howler.masterGain.connect(this.analyser);
            this.analyser.connect(ctx.destination);

            this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
            this.bandBinRanges = this.computeBandBinRanges(ctx.sampleRate, this.analyser.frequencyBinCount);

            console.log('[VisualizerService] Hooked into Howler.masterGain. FFT bins:', this.analyser.frequencyBinCount);
            return true;
        } catch (e) {
            console.error('[VisualizerService] Error hooking Howler:', e);
            return false;
        }
    },

    computeBandBinRanges(sampleRate, binCount) {
        const nyquist = sampleRate / 2;
        const logMin = Math.log10(this.MIN_FREQ);
        const logMax = Math.log10(Math.min(this.MAX_FREQ, nyquist));
        const ranges = [];

        for (let i = 0; i < this.BAR_COUNT; i++) {
            const f0 = Math.pow(10, logMin + (logMax - logMin) * (i / this.BAR_COUNT));
            const f1 = Math.pow(10, logMin + (logMax - logMin) * ((i + 1) / this.BAR_COUNT));
            let startBin = Math.floor((f0 / nyquist) * binCount);
            let endBin = Math.max(startBin + 1, Math.floor((f1 / nyquist) * binCount));
            endBin = Math.min(endBin, binCount);
            ranges.push([startBin, endBin]);
        }
        return ranges;
    },

    start() {
        if (this.running) return;
        if (!this.canvas) this.init();
        this.running = true;
        console.log('[VisualizerService] Starting animation loop');
        this.loop();
    },

    stop() {
        this.running = false;
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = undefined;
        }
        this.clear();
    },

    loop() {
        if (!this.running) return;

        if (!this.ensureHooked()) {
            this.rafId = requestAnimationFrame(() => this.loop());
            return;
        }

        // Check if canvas needs resizing (parent layout may have changed)
        const rect = this.container.getBoundingClientRect();
        const expectedW = Math.max(1, Math.round(rect.width * this.dpr));
        const expectedH = Math.max(1, Math.round(rect.height * this.dpr));
        if (this.canvas.width !== expectedW || this.canvas.height !== expectedH) {
            this.resize();
        }

        this.analyser.getByteFrequencyData(this.freqData);
        this.draw();
        this.rafId = requestAnimationFrame(() => this.loop());
    },

    draw() {
        try {
            const ctx = this.ctx;
            const w = this.canvas.width;
            const h = this.canvas.height;
            const pad = this.PADDING * this.dpr;

            ctx.clearRect(0, 0, w, h);

            const innerW = w - pad * 2;
            const innerH = h - pad * 2;
            if (innerW <= 0 || innerH <= 0) return;

            const barGap = this.BAR_GAP * this.dpr;
            const barW = (innerW - barGap * (this.BAR_COUNT - 1)) / this.BAR_COUNT;
            const segGap = this.SEGMENT_GAP * this.dpr;
            const segH = (innerH - segGap * (this.SEGMENT_COUNT - 1)) / this.SEGMENT_COUNT;

            if (!this.bandBinRanges || !this.freqData) {
                console.warn('[VisualizerService] bandBinRanges or freqData not initialized');
                return;
            }

            for (let i = 0; i < this.BAR_COUNT; i++) {
                const range = this.bandBinRanges[i];
                if (!range) continue;
                const [startBin, endBin] = range;

                let sum = 0;
                for (let b = startBin; b < endBin; b++) {
                    sum += this.freqData[b] || 0;
                }
                const avg = sum / Math.max(1, endBin - startBin);

                const lit = Math.round((avg / 255) * this.SEGMENT_COUNT);
                const x = pad + i * (barW + barGap);

                for (let s = 0; s < this.SEGMENT_COUNT; s++) {
                    const y = pad + innerH - (s + 1) * segH - s * segGap;
                    let h = segH;
                    // Last segment extends to fill remaining space due to rounding
                    if (s === this.SEGMENT_COUNT - 1) {
                        h = pad + innerH - y;
                    }
                    const isLit = s < lit;

                    if (isLit) {
                        ctx.fillStyle = 'rgba(255,255,255,1)';
                    } else {
                        ctx.fillStyle = 'rgba(255,255,255,0.1)';
                    }
                    ctx.fillRect(x, y, barW, h);
                }
            }
        } catch (e) {
            console.error('[VisualizerService] Error in draw():', e.message, e.stack);
        }
    },

    clear() {
        if (this.ctx) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    },
};
