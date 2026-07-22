const DownloadService = {

    isDownloading: false,
    cancelled: false,
    maxChapterParagraphs: 1000,

    async downloadChapter(book, cIdx) {
        if (this.isDownloading) return;

        const chapter = book.chapters[cIdx];
        if (chapter.length > this.maxChapterParagraphs) {
            App.showMessageBoard(
                "Chapter too long",
                `This chapter has more than ${this.maxChapterParagraphs} paragraphs and can't be downloaded.`,
                -1,
                3000
            );
            return;
        }

        this.cancelled = false;
        this.isDownloading = true;

        const chapterTitle = ReaderService.getTitleFromChapter(chapter).replace(/<[^>]+>/g, '');

        try {
            const eligible = this.collectEligibleParagraphs(book, cIdx);
            if (!eligible.length) throw new Error("No readable text in this chapter");

            let encoder = null;
            const mp3Chunks = [];
            const startTime = Date.now();

            App.showMessageBoard("Downloading chapter", `Encoding audio... (0/${eligible.length})`, 0, null, () => this.cancel());

            for (let i = 0; i < eligible.length; i++) {
                if (this.cancelled) {
                    App.hideMessageBoard();
                    return;
                }

                const { pIdx, text } = eligible[i];
                const bufferItem = await ReaderService.fetchAndLoad(text, cIdx, pIdx);
                if (!bufferItem || !bufferItem.blob) throw new Error(`Failed to fetch audio for paragraph ${pIdx}`);

                const audioBuffer = await this.decodeToPcm(bufferItem.blob);

                if (!encoder) {
                    encoder = new lamejs.Mp3Encoder(audioBuffer.numberOfChannels, audioBuffer.sampleRate, 128);
                }

                const channelPcm = [0, 1]
                    .slice(0, audioBuffer.numberOfChannels)
                    .map(ch => this.floatTo16BitPCM(audioBuffer.getChannelData(ch)));

                let mp3Buf = audioBuffer.numberOfChannels > 1
                    ? encoder.encodeBuffer(channelPcm[0], channelPcm[1])
                    : encoder.encodeBuffer(channelPcm[0]);
                if (mp3Buf.length > 0) mp3Chunks.push(mp3Buf);

                const silenceMs = ReaderService.getParagraphBreath(cIdx, pIdx, { duration: () => audioBuffer.duration });
                if (silenceMs > 0) {
                    const silenceSamples = this.silencePcm(silenceMs, audioBuffer.sampleRate);
                    mp3Buf = audioBuffer.numberOfChannels > 1
                        ? encoder.encodeBuffer(silenceSamples, silenceSamples)
                        : encoder.encodeBuffer(silenceSamples);
                    if (mp3Buf.length > 0) mp3Chunks.push(mp3Buf);
                }

                const elapsedMs = Date.now() - startTime;
                const elapsedFormatted = ReaderService.secondsToHms(elapsedMs / 1000);

                const avgTimePerParagraph = elapsedMs / (i + 1);
                const remainingParagraphs = eligible.length - (i + 1);
                const estimatedRemainingMs = remainingParagraphs * avgTimePerParagraph;
                const estimatedRemainingFormatted = ReaderService.secondsToHms(estimatedRemainingMs / 1000);

                const textPreview = eligible[i].text.substring(0, 200);
                const percent = Math.round(((i + 1) / eligible.length) * 100);

                const messageHtml = `Preparing audio for line ${i + 1} of ${eligible.length}</br>` +
                    `<div style="font-size: 0.7em; word-break: break-word;">` +
                    `<div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${textPreview}</div></br>` +
                    `Elapsed: ${elapsedFormatted}` +
                    `</br>Est. remaining: ${estimatedRemainingFormatted}</div>` +
                    `${percent}%`;

                App.showMessageBoard(
                    "Downloading chapter",
                    messageHtml,
                    percent,
                    null,
                    () => this.cancel()
                );
            }

            const finalBuf = encoder.flush();
            if (finalBuf.length > 0) mp3Chunks.push(finalBuf);

            const combinedBlob = new Blob(mp3Chunks, { type: 'audio/mpeg' });
            const fileName = this.buildFileName(book, chapterTitle);

            this.triggerDownload(combinedBlob, fileName);

            App.showMessageBoard("Download ready", `${fileName} is downloading.`, 100, 2500);

        } catch (e) {
            console.error("Download error:", e);
            App.showMessageBoard(
                "Download failed",
                this.cancelled ? "Download cancelled." : "Something went wrong. Please try again.",
                -1,
                3000
            );
        } finally {
            this.isDownloading = false;
            this.cancelled = false;
        }
    },

    collectEligibleParagraphs(book, cIdx) {
        const chapter = book.chapters[cIdx];
        const eligible = [];

        for (let pIdx = 0; pIdx < chapter.length; pIdx++) {
            let text = ReaderService.getParagraphText(cIdx, pIdx);
            if (!text) break;

            text = text
                .replaceAll('##::##::ATTACH_TO_PREV_SPAN::##::##', "")
                .replaceAll("**##", "'")
                .replaceAll("##**", "'")
                .replace(/\b[A-Z]{5,}\b/g, m => m.charAt(0) + m.slice(1).toLowerCase());

            if (ReaderService.hasLettersOrNumbers(text)) {
                eligible.push({ pIdx, text });
            }
        }

        return eligible;
    },

    getAudioContext() {
        if (!this._audioCtx) {
            this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        return this._audioCtx;
    },

    async decodeToPcm(blob) {
        const arrayBuffer = await blob.arrayBuffer();
        const audioBuffer = await this.getAudioContext().decodeAudioData(arrayBuffer);
        return audioBuffer;
    },

    floatTo16BitPCM(floatSamples) {
        const pcm = new Int16Array(floatSamples.length);
        for (let i = 0; i < floatSamples.length; i++) {
            const s = Math.max(-1, Math.min(1, floatSamples[i]));
            pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return pcm;
    },

    silencePcm(ms, sampleRate) {
        const samples = Math.max(0, Math.round(ms / 1000 * sampleRate));
        return new Int16Array(samples);
    },

    buildFileName(book, chapterTitle) {
        const sanitize = (str) => {
            return str.replace(/[\\/:*?"<>|]/g, '').substring(0, 50);
        };

        const bookTitle = sanitize(book.title);
        const cleanChapter = sanitize(chapterTitle);

        return `${bookTitle} - ${cleanChapter}.mp3`;
    },

    triggerDownload(blob, fileName) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    },

    cancel() {
        this.cancelled = true;
    },
};
