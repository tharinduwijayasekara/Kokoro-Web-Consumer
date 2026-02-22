const ReaderService = {

    book: undefined,
    progressTracker: [0, 0, 0],

    currentChapterOnScreen: undefined,

    $app: undefined,
    $wrapper: undefined,
    $container: undefined,
    $bookName: undefined,
    $chaptersListHeader: undefined,
    $chaptersList: undefined,

    $playPauseButton: undefined,
    $bufferHealth: 0,

    $chapterProgress: undefined,
    $bookProgress: undefined,

    currentBuffer: [],
    isBuffering: false,
    bufferrer: undefined,
    isPlaying: false,
    playIdentifier: undefined,
    initialBufferSize: 0,
    initialBufferFetched: 0,

    bookLength: 0,

    async init(bookId) {
        this.$app = App.$app;
        this.$wrapper = this.$app.find('.reader-container-wrapper');
        this.$container = this.$app.find('.reader-container');
        this.$bookName = this.$app.find('#navbar-book-name');
        this.$chaptersListHeader = this.$app.find('.playback-chapter-header');
        this.$chaptersList = this.$app.find('.playback-chapters-list');
        this.$playPauseButton = this.$app.find('#btn-reader-playpause');
        this.$bufferHealth = this.$app.find('.buffer-health');
        this.$chapterProgress = this.$app.find('.chapter-progress .progress-bar');
        this.$bookProgress = this.$app.find('.book-progress .progress-bar');

        if (this.abortController) {
            this.abortController.abort();
        }

        this.abortController = new AbortController();

        const books = await StorageService.getBooks();
        const book = books.find(b => b.id == bookId);

        this.book = book;
        console.log("About to render book on screen", book);

        const orator = await StorageService.getOratorJson();
        console.log("Orator json", orator);

        const progressTracker = (orator.reading[bookId] ?? "0::0::0")
            .split('::')
            .map(value => parseInt(value));

        console.log("Progress tracker raw", progressTracker);

        if (book.chapters.length < progressTracker[0]) {
            progressTracker[0] = 0;
            progressTracker[1] = 0;
            progressTracker[2] = 0;
        }

        const currentChapter = book.chapters[progressTracker[0]];
        if (currentChapter.length < progressTracker[1]) {
            progressTracker[0] = 0;
            progressTracker[1] = 0;
            progressTracker[2] = 0;
        }

        this.progressTracker = progressTracker;

        console.log("Progress tracker checked", progressTracker);

        this.$bookName.text(book.title);

        await this.renderChaptersList();
        await this.renderChapterOnScreen(progressTracker[0]);

        this.calculateBookLength();
        this.updateProgress();

        if (!this.bufferrer) {
            this.setBufferrer();
        }

        App.showView('reader');

        setTimeout(() => {
            this.$container.find('.reader-paragraph').removeClass('active');
            this.$container.find(`#reader-paragraph-${progressTracker[0]}-${progressTracker[1]}`).addClass('active');
            this.scrollToParagraph(progressTracker[0], progressTracker[1]);
        }, 250);
    },

    calculateBookLength() {
        let bookLength = 0;
        this.book.chapters.forEach(chapter => bookLength += chapter.length);
        this.bookLength = bookLength;
    },

    updateProgress() {
        const chapter = this.book.chapters[this.progressTracker[0]];
        const chapterProgress = (this.progressTracker[1] / chapter.length) * 100;
        const completedChapters = this.book.chapters.slice(0, Math.max(0, this.progressTracker[0] - 1));

        let bookProgress = this.progressTracker[1];
        completedChapters.forEach(completedChapter => bookProgress += completedChapter.length);
        bookProgress = (bookProgress / this.bookLength) * 100;

        this.$chapterProgress.width(`${chapterProgress}%`);
        this.$bookProgress.width(`${bookProgress}%`);
    },

    async renderChaptersList() {
        this.$chaptersListHeader.css('background-image', `url(${this.book.cover})`)
        this.$chaptersList.empty();

        this.book.chapters.forEach((paragraphs, chapterId) => {
            // Matches "Chapter 1", "CHAPTER IV", or "1. Introduction" / "IV - The Start"
            const chapterRegex = /^\s*(chapter\s+([0-9]+|[ivxlcdm]+|[a-z]+)|([0-9]+|[ivxlcdm]+)[\s\.\-\:]+)/i;
            const foundChapter = paragraphs.slice(0, 5).find(p => chapterRegex.test(p));

            let chapterTitle = paragraphs[0] ?? '-';
            if (foundChapter) chapterTitle = foundChapter;

            chapterTitle = chapterTitle
                .replaceAll("**##", `<span class="italic">`)
                .replaceAll("##**", `</span>`);

            if (chapterTitle.length < 3) chapterTitle = "Chapter: " + chapterTitle;

            $('<div></div>')
                .html(chapterTitle)
                .addClass('playback-chapter-item')
                .attr('data-id', chapterId)
                .attr('id', `toc-chapter-${chapterId}`)
                .appendTo(this.$chaptersList);
        })
    },

    async renderChapterOnScreen(chapterId) {
        const chapterIdToRender = chapterId ?? this.progressTracker[0];
        console.log("Rendering chapter on screen", chapterIdToRender);

        const chapter = this.book.chapters[chapterIdToRender];
        this.$container.empty();

        this.$container.attr('data-chapter-id', chapterId);

        chapter.forEach((paragraph, paragraphId) => {
            const paragraphHtml = paragraph
                .replaceAll("**##", `<span class="italic">`)
                .replaceAll("##**", `</span>`);

            $paragraph = $('<p></p>')
                .attr('id', `reader-paragraph-${chapterId}-${paragraphId}`)
                .addClass('reader-paragraph')
                .attr('data-paragraph-identifier', `${chapterIdToRender}-${paragraphId}`)
                .html(paragraphHtml)
                .appendTo(this.$container);
        });

        this.$chaptersList.find('.playback-chapter-item').removeClass('active');
        this.$chaptersList.find(`#toc-chapter-${chapterIdToRender}`).addClass('active');

        this.currentChapterOnScreen = chapterIdToRender;
    },

    async goToPreviousChapter() {
        const currentChapter = this.currentChapterOnScreen;
        if (currentChapter === 0) {
            return;
        }

        this.renderChapterOnScreen(currentChapter - 1);
    },

    async goToNextChapter() {
        const currentChapter = this.currentChapterOnScreen;
        if (currentChapter >= this.book.chapters.length - 1) {
            return;
        }

        this.renderChapterOnScreen(currentChapter + 1);
    },

    async play(chapterId, paragraphId, bufferSize) {
        console.log("Triggering stop");
        this.stop();

        if (chapterId === -10 && paragraphId === -12) {
            console.log("Start playback from previously stopped position", this.progressTracker);
            [chapterId, paragraphId] = this.progressTracker;
        }

        this.playIdentifier = Date.now();
        this.isPlaying = true;
        this.$playPauseButton.addClass('playing');

        App.showMessageBoard("Spinning up Orator...", App.getRandomOratorMessage(), 0);

        console.log("Calling fill buffer", chapterId, paragraphId, bufferSize);
        await this.fillBuffer(chapterId, paragraphId, bufferSize, true);

        console.log("Calling play next");
        this.playNext();
    },

    async fillBuffer(cIdx, pIdx, size, isFromPlay = false) {
        if (this.isBuffering) {
            console.log("Fill buffer called while buffering previous request");
            return;
        }

        const needed = size - this.currentBuffer.length;
        if (needed <= 0) {
            console.log("Buffer health good");
        }

        const playIdentifier = this.playIdentifier;
        this.isBuffering = true;

        let maxBatchSize = 3;
        if (this.currentBuffer.length < 5 && size >= 10) {
            maxBatchSize = 2;
        }

        const batchSize = Math.min(needed, maxBatchSize);

        try {
            const fetchTasks = [];
            let tempC = cIdx;
            let tempP = pIdx;

            this.$bufferHealth.text(this.$bufferHealth.text() + ` (${batchSize})`);

            for (let i = 0; i < Math.min(needed, batchSize); i++) {
                if (this.playIdentifier !== playIdentifier) return;

                let text = this.getParagraphText(tempC, tempP);
                if (!text) break;

                text = text
                    .replaceAll("**##", "'")
                    .replaceAll("##**", "'");

                fetchTasks.push(
                    this.fetchAndLoad(text, tempC, tempP)
                );

                [tempC, tempP] = this.getNextParagraphId(tempC, tempP);
            }

            if (isFromPlay) {
                this.initialBufferSize = fetchTasks.length;
                this.initialBufferFetched = 0;
            }

            const results = await Promise.all(fetchTasks);
            this.currentBuffer.push(...results.filter(result => result !== null));

            console.log("Buffer fill completed");
        } finally {
            this.isBuffering = false;
            console.log("Buffering complete, buffer health at: ", this.currentBuffer.length);
        }

        this.$bufferHealth.text(`${this.currentBuffer.length} ready to play`);
    },

    async setBufferrer() {
        if (this.bufferrer) return;

        this.bufferrer = setInterval(() => {

            if (!this.isPlaying || this.isBuffering) return;
            if (this.currentBuffer.length > 50) return;

            const current = this.currentBuffer[0];
            const last = this.currentBuffer[this.currentBuffer.length - 1] || current;

            console.log("Inside bufferrer: last available audio in current buffer", last);

            let [nextC, nextP] = this.getNextParagraphId(last.cIdx, last.pIdx);

            console.log("About to call fill buffer with", nextC, nextP);
            this.fillBuffer(nextC, nextP, 60);

        }, 2000)
    },

    async fetchAndLoad(text, cIdx, pIdx) {
        console.log("Fetch and load", cIdx, pIdx, text.substring(0, 30));

        const playIdentifier = this.playIdentifier;
        console.log("Play identifier: ", playIdentifier);

        const ttsUrl = 'https://kokoro.orator-audio.com/v1/audio/speech'; // Get from config in the future
        const voice = 'af_heart(1)+af_aoede(1)+af_nicole(1)+af_sky(1)';
        const speed = 1.1;

        const params = {
            "model": "kokoro",
            "input": text,
            "voice": voice,
            "response_format": "mp3",
            "download_format": "mp3",
            "speed": speed,
            "stream": false,
            "return_download_link": false,
            "lang_code": "a",
            "volume_multiplier": 3,
            "normalization_options": {
                "normalize": true,
                "unit_normalization": false,
                "url_normalization": true,
                "email_normalization": true,
                "optional_pluralization_normalization": true,
                "phone_normalization": true,
                "replace_remaining_symbols": true
            }
        }

        const response = await fetch(ttsUrl, {
            method: 'POST',
            signal: this.abortController.signal,
            headers: {
                'accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(params)
        });

        if (!response.ok) throw new Error("TTS Fetch Failed");

        console.log("Play identifier: ", playIdentifier, this.playIdentifier);
        if (playIdentifier !== this.playIdentifier) {
            console.log("Play identifier has changed, user probably requested another play start point");
            return null;
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);

        const shortText = text.substring(0, 20);

        return new Promise((resolve) => {

            const sound = new Howl({
                src: [url],
                format: ['mp3'],
                html5: false,
                onload: () => {
                    if (playIdentifier !== this.playIdentifier) {
                        console.log("Howler loaded an older play identifier, skipping");
                        resolve(null);
                    } else {
                        console.log("Howler finished loading", cIdx, pIdx);

                        this.initialBufferFetched++;

                        if (this.initialBufferFetched <= this.initialBufferSize) {
                            const percent = Math.ceil((this.initialBufferFetched / this.initialBufferSize) * 100);
                            console.log("Initial buffer percent", percent);

                            if (percent < 100) {
                                App.showMessageBoard("Spinning up Orator...", App.getRandomOratorMessage(), percent);
                            } else {
                                App.hideMessageBoard();
                            }
                        }

                        resolve({shortText, cIdx, pIdx, sound, url})
                    }
                },
                onloadError: () => {
                    console.log("Howloer failed to load", cIdx, pIdx);
                    URL.revokeObjectURL(url);
                    resolve(null);
                },
                onend: () => {
                    const silence = this.getParagraphBreath(sound);
                    sound.unload(); // Free memory
                    URL.revokeObjectURL(url);
                    if (this.isPlaying) {
                        setTimeout(() => this.playNext(), silence)
                    }
                }
            })

        });
    },

    getParagraphBreath(sound) {
        const duration = sound.duration();
        const silence = parseInt(Math.min(900, duration * 60));
        console.log(`Breathing for ${silence} for a ${duration} second paragraph`);
        return silence;
    },

    async playNext() {
        if (!this.isPlaying || this.currentBuffer.length === 0) return;

        console.log("About to play next, current buffer length", this.currentBuffer.length);

        const current = this.currentBuffer.shift();
        const progressTrackerString = `${current.cIdx}::${current.pIdx}::0`;
        this.progressTracker = progressTrackerString.split('::').map(v => parseInt(v));
        this.updateProgress();

        this.$container.find('.reader-paragraph').removeClass('active');
        this.$container.find(`#reader-paragraph-${current.cIdx}-${current.pIdx}`).addClass('active');
        this.scrollToParagraph(current.cIdx, current.pIdx);

        this.$bufferHealth.text(`${this.currentBuffer.length} ready to play`);
        current.sound.play();

        const orator = await StorageService.getOratorJson();
        orator.reading[this.book.id] = progressTrackerString;
        await StorageService.writeOratorJson(orator);
        console.log("Progress tracker moved to", progressTrackerString);

        const last = this.currentBuffer[this.currentBuffer.length - 1] || current;

        let [nextC, nextP] = this.getNextParagraphId(last.cIdx, last.pIdx);

        console.log("About to call fill buffer with", nextC, nextP);
        this.fillBuffer(nextC, nextP, 60);
    },

    async scrollToParagraph(cIdx, pIdx) {
        if (cIdx === null && pIdx === null) {
            [cIdx, pIdx] = this.progressTracker;
        }

        if (parseInt(this.$container.attr('data-chapter-id')) !== cIdx) {
            await this.renderChapterOnScreen(cIdx);
        }

        const targetElement = document.getElementById(`reader-paragraph-${cIdx}-${pIdx}`);
        if (targetElement) {
            targetElement.scrollIntoView({
                behavior: 'smooth',
                block: 'start' // This respects the scroll-margin-top
            });
        }
        return;
    },

    stop() {
        this.isPlaying = false;
        this.isBuffering = false;

        if (this.abortController) {
            this.abortController.abort("User requested stop");
        }

        this.abortController = new AbortController();


        Howler.stop();

        this.$playPauseButton.removeClass('playing');

        this.currentBuffer.forEach(item => {
            URL.revokeObjectURL(item.url);
            item.sound.unload();
        });

        this.currentBuffer = [];
    },

    getParagraphText(c, p) {
        try {
            return this.book.chapters[c][p];
        } catch (e) {
            return null;
        }
    },

    getNextParagraphId(cIdx, pIdx) {
        let nextP = parseInt(pIdx) + 1;
        let nextC = parseInt(cIdx);

        if (nextP >= this.book.chapters[cIdx].length) {
            nextC = cIdx + 1;
            nextP = 0;
        }

        return [nextC, nextP];
    },

    toggleFullscreen() {
        this.$app.find('#view-reader').toggleClass('reader-fullscreen');
    }
};