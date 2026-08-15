const VisualizerService = {

    BAR_COUNT: 5,
    MIN_FREQ: 50,
    MAX_FREQ: 10000,
    FRAME_RATE: 60,

    container: undefined,
    bars: [],

    analyser: undefined,
    freqData: undefined,
    bandBinRanges: undefined,
    prevLit: [],

    rafId: undefined,
    running: false,
    lastFrameTime: 0,

    init() {
        this.container = document.getElementById('navbar-audio-visualizer');
        if (!this.container) {
            console.error('[VisualizerService] Container #navbar-audio-visualizer not found');
            return;
        }

        this.createBars(this.BAR_COUNT);

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) this.stop();
            else if (ReaderService.isPlaying) this.start();
        });
    },

    createBars(count) {
        this.container.innerHTML = '';
        this.bars = [];
        for (let i = 0; i < count; i++) {
            const bar = document.createElement('div');
            bar.className = 'visualizer-bar';
            bar.style.height = '4%';
            this.container.appendChild(bar);
            this.bars.push(bar);
        }
    },

    setBarCount(count) {
        count = Math.max(2, Math.min(12, Math.floor(count)));
        if (count === this.BAR_COUNT) return;

        this.BAR_COUNT = count;
        this.createBars(count);
        this.container.style.gridTemplateColumns = `repeat(${count}, 10px)`;
        this.prevLit = [];

        if (this.analyser) {
            this.bandBinRanges = this.computeBandBinRanges(Howler.ctx.sampleRate, this.analyser.frequencyBinCount);
        }

        this.clear();
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
            this.analyser.smoothingTimeConstant = 0.50;

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

        const now = performance.now();
        const frameInterval = 1000 / this.FRAME_RATE;

        if (now - this.lastFrameTime >= frameInterval) {
            this.analyser.getByteFrequencyData(this.freqData);
            this.draw();
            this.lastFrameTime = now;
        }

        this.rafId = requestAnimationFrame(() => this.loop());
    },

    draw() {
        try {
            if (!this.bandBinRanges || !this.freqData || !this.bars.length) {
                console.warn('[VisualizerService] bandBinRanges, freqData, or bars not initialized');
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

                const targetLit = (avg / 255) * 100;
                const smoothFactor = 0.4;
                const smoothedLit = this.prevLit[i] !== undefined
                    ? this.prevLit[i] + (targetLit - this.prevLit[i]) * smoothFactor
                    : targetLit;
                const lit = Math.max(4, Math.round(smoothedLit));
                this.prevLit[i] = smoothedLit;

                this.bars[i].style.height = lit + '%';
            }
        } catch (e) {
            console.error('[VisualizerService] Error in draw():', e.message, e.stack);
        }
    },

    clear() {
        this.bars.forEach(bar => {
            bar.style.height = '4%';
        });
    },
};
