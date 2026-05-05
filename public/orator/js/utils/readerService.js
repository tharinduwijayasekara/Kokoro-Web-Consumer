const ReaderService = {

    book: undefined,
    progressTracker: [0, 0, 0],

    currentChapterOnScreen: undefined,

    $app: undefined,
    $banner: undefined,
    $wrapper: undefined,
    $container: undefined,
    $bookName: undefined,
    $bookChapter: undefined,
    $bookCover: undefined,
    $chaptersListHeader: undefined,
    $chaptersList: undefined,

    $playPauseButton: undefined,
    $bufferHealth: 0,

    $chapterProgress: undefined,
    $bookProgress: undefined,

    $chapterTimingsLeft: undefined,
    $chapterTimingsRight: undefined,

    bufferSize: 50,
    minBufferSize: 40,
    maxBufferSize: 70,
    currentBuffer: [],
    isBuffering: false,
    bufferrer: undefined,
    isPlaying: false,
    playIdentifier: undefined,
    initialBufferSize: 0,
    initialBufferFetched: 0,

    bookLength: 0,
    bookCharsLength: 0,
    cumulativeChapterCharCount: [],

    tempOratorConfig: undefined,

    charactersProcessed: 0,
    durationProcessed: 0,
    durationPerCharacter: 0,

    currentFullParagraphDuration: 0,

    useHtml5Player: false,

    bookTimer: {},
    bookTimerUpdatedAt: 0,

    highlighter: undefined,

    lastUserIntTime: 0,

    hasEnoughStorage: false,

    async init(bookId) {
        App.showMessageBoard("Orator", "Opening book...", 0);
        await App.sleep(10);

        this.$app = App.$app;
        this.$banner = this.$app.find('.error-banner');
        this.$wrapper = this.$app.find('.reader-container-wrapper');
        this.$container = this.$app.find('.reader-container');
        this.$bookName = this.$app.find('#navbar-book-name');
        this.$bookChapter = this.$app.find('#navbar-chapter-name');
        this.$bookCover = this.$app.find('.reader-nav-book-image');
        this.$chaptersListHeader = this.$app.find('.playback-chapter-header');
        this.$chaptersList = this.$app.find('.playback-chapters-list');
        this.$playPauseButton = this.$app.find('#btn-reader-playpause');
        this.$bufferHealth = this.$app.find('.buffer-health');
        this.$chapterProgress = this.$app.find('.chapter-progress .progress-bar');
        this.$bookProgress = this.$app.find('.book-progress .progress-bar');
        this.$chapterTimingsLeft = this.$app.find('.chapter-timings-left');
        this.$chapterTimingsRight = this.$app.find('.chapter-timings-right');

        if (this.abortController) {
            this.abortController.abort();
        }

        this.abortController = new AbortController();

        this.hasEnoughStorage = await StorageService.hasEnoughStorage();

        const books = await StorageService.getBooks();
        const book = books.find(b => b.id == bookId);

        this.book = book;
        console.log("About to render book on screen", book);

        App.showMessageBoard("Orator", "Opening book...", 50);
        await App.sleep(10);

        const orator = await StorageService.getOratorJson();
        console.log("Orator json", orator);

        if (!bookId.startsWith('news/news-')) {
            const currentlyReading = (orator.currentlyReading ?? "")
                .split('///---///')
                .filter(_bookId => _bookId !== bookId);

            currentlyReading.unshift(bookId);
            if (currentlyReading.length > 3) currentlyReading.pop();

            orator.currentlyReading = currentlyReading.join('///---///');
            await StorageService.writeOratorJson(orator);
        }

        this.updateTempOratorConfig(orator.config);

        const progressTracker = (orator.reading[bookId] ?? "0::0::0")
            .split('::')
            .map(value => parseInt(value));

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

        App.showMessageBoard("Orator", "Opening book...", 70);
        await App.sleep(10);

        this.$bookName.text(book.title);
        this.$bookCover.css('background-image', `url(${book.cover})`);

        await this.renderChaptersList();
        await this.renderChapterOnScreen(progressTracker[0]);

        App.showMessageBoard("Orator", "Opening book...", 80);
        await App.sleep(10);

        await this.calculateBookLength();
        this.updateProgress(progressTracker[0], progressTracker[1]);

        if (!this.bufferrer) {
            this.setBufferrer();
        }

        if (!this.highlighter) {
            this.setHighlighter();
        }

        this.bookTimer[bookId] = orator.timers?.[bookId] ?? 0;

        App.showMessageBoard("Orator", "Opening book...", 90);
        await App.sleep(10);

        await SettingsService.init();

        history.pushState({page: 'book', id: bookId}, "openedbook");
        App.currentPage = "book";

        App.showMessageBoard("Orator", "Opening book...", 100);
        await App.sleep(10);

        await this.reveal(progressTracker);

        Howler.pool = 10;
    },

    async reveal(progressTracker) {
        App.hideMessageBoard();

        this.lockedForPlayback = true;
        setTimeout(() => {
            this.lockedForPlayback = false
        }, 1000);

        const $paragraphs = this.$wrapper.find('p');
        $paragraphs.addClass('hidden');

        App.showView('reader');

        this.$container.find('.reader-paragraph.active').removeClass('active');
        this.$container.find(`#reader-paragraph-${progressTracker[0]}-${progressTracker[1]}`).addClass('active');

        await App.sleep(10);

        let counter = {i: 0, max: 10};
        for (const paragraph of $paragraphs) {
            if (counter.i >= counter.max) {
                $paragraphs.removeClass('hidden');
                await App.sleep(200);
                break;
            }

            $(paragraph).removeClass('hidden');
            await App.sleep(20);
            counter.i++;
        }

        await App.sleep(250);

        this.scrollToParagraph(progressTracker[0], progressTracker[1]);
    },

    updateTempOratorConfig(config) {
        this.tempOratorConfig = config;
    },

    async calculateBookLength() {
        let bookLength = 0;
        let bookCharsLength = 0;

        this.book.chapters.forEach(async (chapter) => {
            bookLength += chapter.length;
            chapter.forEach(p => bookCharsLength += p.length);
            this.cumulativeChapterCharCount.push(bookCharsLength);
            await App.sleep(5);
        });

        this.bookLength = bookLength;
        this.bookCharsLength = bookCharsLength;
    },

    async closeBook() {
        this.stop();

        App.showMessageBoard("Orator", "Closing book...", 90);
        await App.race(App.loadNews(), 5 * 1000);

        await Promise.all([
            App.renderCurrentlyReading(),
            App.renderLibrary()
        ]);
    },

    async updateProgress(cIdx, pIdx) {
        const chapter = this.book.chapters[cIdx];
        const chapterProgress = ((pIdx + 1) / chapter.length) * 100;
        const completedChapters = this.book.chapters.slice(0, Math.max(0, cIdx));

        let bookProgress = pIdx + 1;
        completedChapters.forEach(completedChapter => bookProgress += completedChapter.length);
        bookProgress = Math.ceil((bookProgress / this.bookLength) * 100);

        this.$chapterProgress.width(`${chapterProgress}%`);
        this.$bookProgress.width(`${bookProgress}%`);

        const progressTrackerString = `${cIdx}::${pIdx}::${bookProgress}`;
        this.progressTracker = progressTrackerString.split('::').map(v => parseInt(v));

        const orator = await StorageService.getOratorJson();
        orator.reading[this.book.id] = progressTrackerString;
        await StorageService.writeOratorJson(orator);
    },

    async renderChaptersList() {
        this.$chaptersListHeader.css('background-image', `url(${this.book.cover})`)
        this.$chaptersList.empty();

        this.book.chapters.forEach((paragraphs, chapterId) => {
            // Matches "Chapter 1", "CHAPTER IV", or "1. Introduction" / "IV - The Start"
            const chapterRegex = /^\s*(contents|chapter\s+([0-9]+|[ivxlcdm]+|[a-z]+)|([0-9]+|[ivxlcdm]+)[\s\.\-\:]+)/i;
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
        this.$container.html(`<div class="highlight"></div>`);
        this.$container.attr('data-chapter-id', chapterId);

        let $currentParagraph = null;

        chapter.forEach((paragraph, paragraphId) => {
            const isContinuation = paragraph.startsWith(ORATOR_P_CONTD);
            paragraph = paragraph.replaceAll(ORATOR_P_CONTD, "");

            if (!isContinuation) {
                $currentParagraph = $(`<p></p>`).addClass('reader-paragraph-wrapper');
                $currentParagraph.appendTo(this.$container);
            }

            const paragraphHtml = paragraph
                .replaceAll("**##", `<span class="italic">`)
                .replaceAll("##**", `</span>`)
                .trim();

            let spanHtml = `
                <span id="reader-paragraph-${chapterId}-${paragraphId}" 
                class="reader-paragraph" 
                data-paragraph-identifier="${chapterIdToRender}-${paragraphId}">${paragraphHtml}</span>
            `;

            if (isContinuation) spanHtml = `<span> </span>${spanHtml}`;
            $(spanHtml).appendTo($currentParagraph);
        });

        this.$bookChapter.html(
            (chapter[0] ?? "")
                .replaceAll("**##", `<span class="italic">`)
                .replaceAll("##**", `</span>`)
        );

        this.$chaptersList.find('.playback-chapter-item.active').removeClass('active');
        this.$chaptersList.find(`#toc-chapter-${chapterIdToRender}`).addClass('active');

        this.currentChapterOnScreen = chapterIdToRender;

        const targetElement = document.getElementById(`toc-chapter-${chapterIdToRender}`);
        if (targetElement) {
            this.scrollToElementInContainer(targetElement, this.$chaptersList[0]);
        }
    },

    async goToPreviousChapter() {
        const currentChapter = this.currentChapterOnScreen;
        if (currentChapter === 0) {
            return;
        }

        this.updateUserIntTime();
        this.scrollToParagraph(currentChapter - 1, 0);
    },

    async goToNextChapter() {
        const currentChapter = this.currentChapterOnScreen;
        if (currentChapter >= this.book.chapters.length - 1) {
            return;
        }

        this.updateUserIntTime();
        this.scrollToParagraph(currentChapter + 1, 0);
    },

    async animateRenderChapterOnScreen(direction, cIdx) {
        const [forward, backward] = direction === 'forward' ?
            ['animate-to-left', 'animate-to-right'] :
            ['animate-to-right', 'animate-to-left'];

        this.$container.addClass(forward).addClass('hide');
        await App.sleep(100);

        this.$container.removeClass(forward).addClass(backward);
        await Promise.all([
            await this.renderChapterOnScreen(cIdx),
            await App.sleep(300),
        ]);

        this.$container.removeClass(backward).removeClass('hide');
        await App.sleep(300);
    },

    async play(chapterId, paragraphId, bufferSize) {
        if (this.lockedForPlayback) return;

        this.stop();

        if (App.audioPipelineHook) {
            App.audioPipelineHook.play();
        }

        if (App.hiss) {
            App.hiss.play();
            if (Howler.ctx && Howler.ctx.state === 'suspended') {
                Howler.ctx.resume(); // --- for ios
            }
        }

        this.bufferSize = this.maxBufferSize;

        if (chapterId === -10 && paragraphId === -12) {
            console.log("Start playback from previously stopped position", this.progressTracker);
            [chapterId, paragraphId] = this.progressTracker;
        }

        this.playIdentifier = Date.now();
        this.isPlaying = true;
        this.$playPauseButton.addClass('playing');

        this.resetUserIntTime();

        App.showMessageBoard("Spinning up Orator...", App.getRandomOratorMessage(), 0);

        console.log("Calling fill buffer", chapterId, paragraphId, bufferSize);
        await this.fillBuffer(chapterId, paragraphId, 3, true);

        if (App.audioPipelineHook) {
            App.audioPipelineHook.pause();
        }

        console.log("Calling play next");
        this.playNext();
    },

    updateUserIntTime() {
        this.lastUserIntTime = Date.now();
    },

    resetUserIntTime() {
        this.lastUserIntTime = 0;
    },

    isUserInteracting() {
        return (Date.now() - this.lastUserIntTime) < 10000
    },

    async fillBuffer(cIdx, pIdx, size, isFromPlay = false) {
        if (this.isBuffering) {
            console.log("Fill buffer called while buffering previous request");
            return;
        }

        const needed = size - this.currentBuffer.length;
        if (needed <= 0) {
            console.log("Buffer health good");
            return;
        }

        const playIdentifier = this.playIdentifier;
        this.isBuffering = true;

        let maxBatchSize = isFromPlay ? 10 : 3;

        if (!isFromPlay) {
            if (this.currentBuffer.length < 5 && size >= 10) {
                maxBatchSize = 2;
            }

            if (this.currentBuffer.length > 50 && size >= 10) {
                maxBatchSize = 5;
            }
        }

        const batchSize = Math.min(needed, maxBatchSize);

        try {
            const fetchTasks = [];
            let tempC = cIdx;
            let tempP = pIdx;

            this.$bufferHealth.find('.spinner-border').addClass("active");

            for (let i = 0; i < Math.min(needed, batchSize); i++) {
                if (this.playIdentifier !== playIdentifier) return;

                let text = this.getParagraphText(tempC, tempP);
                if (!text) break;

                text = text
                    .replaceAll('##::##::ATTACH_TO_PREV_SPAN::##::##', "")
                    .replaceAll("**##", "'")
                    .replaceAll("##**", "'")
                    .replace(/\b[A-Z]{2,}\b/g, m => m.toLowerCase());

                if (this.hasLettersOrNumbers(text)) {
                    fetchTasks.push(this.fetchAndLoad(text, tempC, tempP));
                }

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
            this.$bufferHealth.find('.spinner-border').removeClass('active');
            this.computeBufferedTime().then((bt) =>
                this.$bufferHealth.find('span').text(this.prepareBufferHealthText(bt))
            );

            console.log("Buffering complete, buffer health at: ", this.currentBuffer.length);
        }

        if (StorageService.storagePersisted) {
            this.$bufferHealth.find('i').addClass("persisted");
        }
    },

    prepareBufferHealthText(bufferTimeMins) {
        return `Next ${this.currentBuffer.length} lines ready (${bufferTimeMins} minutes of reading time)`;
    },

    hasLettersOrNumbers(str) {
        const regex = /[a-zA-Z0-9]/;
        return regex.test(str);
    },

    async setBufferrer() {
        if (this.bufferrer) return;

        this.bufferrer = setInterval(() => {

            if (!this.isPlaying || this.isBuffering) return;

            if (this.currentBuffer.length >= this.maxBufferSize) this.bufferSize = this.minBufferSize;
            if (this.currentBuffer.length < this.minBufferSize) this.bufferSize = this.maxBufferSize;
            if (this.currentBuffer.length > this.bufferSize) return;

            const current = this.currentBuffer[0];
            const last = this.currentBuffer[this.currentBuffer.length - 1] || current;

            console.log("Inside bufferrer: last available audio in current buffer", last);
            if (!last) return;

            let [nextC, nextP] = this.getNextParagraphId(last.cIdx, last.pIdx);

            console.log("About to call fill buffer with", nextC, nextP);
            this.fillBuffer(nextC, nextP, this.bufferSize);

        }, 100)
    },

    async fetchAndLoad(text, cIdx, pIdx) {
        console.log("Fetch and load", cIdx, pIdx, text.substring(0, 30));

        const playIdentifier = this.playIdentifier;

        let ttsUrl = 'https://kokoro.orator-audio.com/v1/audio/speech'; // Get from config in the future
        let voice = 'af_heart(1)+af_aoede(1)';
        let speed = 1.0;
        let pitch = 1.0;
        let model = "kokoro";

        // let ttsUrl = 'https://kokoroapp.orator-audio.com/edgetts/v1/audio/speech'; // Get from config in the future
        // let voice = 'en-US-AvaNeural';
        // let speed = 1.1;
        // let model = "tts-1-hd";

        if (this.tempOratorConfig && this.tempOratorConfig.updatedAt) {
            if ([DEFAULT_KOKORO_URL, DEFAULT_EDGE_TTS_URL].indexOf(this.tempOratorConfig.ttsUrl) < 0) {
                this.$banner.text("We found a problem in your speech settings, please contact Tharindu to fix it").addClass('active');
                this.stop();
                return;
            }

            ttsUrl = this.tempOratorConfig.ttsUrl !== "" ? this.tempOratorConfig.ttsUrl : ttsUrl;
            voice = this.tempOratorConfig.voice !== "" ? this.tempOratorConfig.voice : voice;
            speed = this.tempOratorConfig.speed !== "" ? this.tempOratorConfig.speed : speed;
            pitch = this.tempOratorConfig.pitch !== "" ? this.tempOratorConfig.pitch : pitch;

            const replacements = this.tempOratorConfig.replacements ?? [];
            replacements.forEach(rep => {
                if (!rep[0] || !rep[1]) return;
                text = text.replaceAll(rep[0], rep[1]);
            });

            Object.entries(DEFAULT_REPLACEMENTS).forEach(rep => {
                if (!rep[0] || !rep[1]) return;
                text = text.replaceAll(rep[0], rep[1]);
            });

            text = `. ${text}`;
        }

        let cacheKey = [
            //this.tempOratorConfig.updatedAt ?? '-init-config-',
            this.book.importId ?? '--',
            ttsUrl, voice, speed,
            text,
            INVALIDATE_AUDIOS_GENERATED_AFTER
            //cIdx, pIdx
        ].join(":");

        cacheKey = new Hashes.MD5().hex(cacheKey);

        console.log(`Checking cached audios ${cacheKey}`);

        let blob = (await StorageService.db.audios.get(cacheKey))?.blob;

        if (!blob) {
            const params = {
                "model": model,
                "input": text,
                "voice": voice,
                "response_format": "mp3",
                "download_format": "mp3",
                "speed": speed,
                "stream": false,
                "return_download_link": false,
                "lang_code": "a",
                "volume_multiplier": 1,
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

            if (playIdentifier !== this.playIdentifier) {
                console.log("Play identifier has changed, user probably requested another play start point");
                return null;
            }

            blob = await response.blob();

            if (this.hasEnoughStorage) {
                await StorageService.db.audios.put({
                    id: cacheKey,
                    blob: blob
                });
            }
        }

        const url = URL.createObjectURL(blob);
        const shortText = text.substring(0, 20);

        return new Promise((resolve) => {

            const sound = new Howl({
                volume: this.useHtml5Player ? 1 : 1.5,
                rate: pitch,
                src: [url],
                format: ['mp3'],
                html5: this.useHtml5Player,
                preload: true,
                onload: () => {
                    if (playIdentifier !== this.playIdentifier) {
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

                        resolve({shortText, cIdx, pIdx, sound, url, text})
                    }
                },
                onloadError: () => {
                    console.log("Howler failed to load", cIdx, pIdx);
                    URL.revokeObjectURL(url);
                    resolve(null);
                },
                onend: () => {
                    const silence = this.getParagraphBreath(cIdx, pIdx, sound);
                    sound.unload(); // Free memory
                    URL.revokeObjectURL(url);

                    if (this.isPlaying) {

                        if (this.isAtEndOfBook(cIdx, pIdx)) {
                            this.stop();
                            return;
                        }

                        this.addToBookTimer(sound.duration());
                        setTimeout(() => this.playNext(), silence)
                    }
                }
            })

        });
    },

    isAtEndOfBook(cIdx, pIdx) {
        const lastChapter = this.book.chapters.length - 1;
        const lastParagraph = this.book.chapters[lastChapter].length - 1;
        return (cIdx === lastChapter && pIdx === lastParagraph);
    },

    getParagraphBreath(cIdx, pIdx, sound) {
        if (pIdx === this.book.chapters[cIdx].length - 1 && this.book.chapters[cIdx].length > 5) {
            // If last chapter paragraph, take a longer breath
            return 1500;
        }

        this.currentFullParagraphDuration += sound.duration();

        const text = this.book.chapters[cIdx][pIdx + 1] ?? "";
        const isContinuation = text.startsWith(ORATOR_P_CONTD);
        const multiplier = this.useHtml5Player ? 15 : 40;

        if (isContinuation) {
            return this.useHtml5Player ? 5 : 100;
        }

        const duration = this.currentFullParagraphDuration;
        const silence = parseInt(Math.min(800, duration * multiplier));

        this.currentFullParagraphDuration = 0;
        return silence;
    },

    async playNext() {
        if (!this.isPlaying || this.currentBuffer.length === 0) return;

        console.log("About to play next, current buffer length", this.currentBuffer.length);

        const current = this.currentBuffer.shift();

        this.updateProgress(current.cIdx, current.pIdx);

        if (!this.isUserInteracting()) {
            this.$container.find('.reader-paragraph.active').removeClass('active');
            this.$container.find(`#reader-paragraph-${current.cIdx}-${current.pIdx}`).addClass('active');
            this.scrollToParagraph(current.cIdx, current.pIdx, true);
        }

        this.computeBufferedTime().then((bt) =>
            this.$bufferHealth.find('span').text(this.prepareBufferHealthText(bt))
        );

        current.sound.play();

        if (this.currentBuffer.length < 20) {
            const last = this.currentBuffer[this.currentBuffer.length - 1] || current;
            let [nextC, nextP] = this.getNextParagraphId(last.cIdx, last.pIdx);

            console.log("About to call fill buffer with", nextC, nextP);
            this.fillBuffer(nextC, nextP, this.bufferSize);
        }

        this.processTimings(current);
    },

    async processTimings(current) {
        const soundDuration = current.sound.duration();
        const textLength = current.text.length ?? 0;

        if (soundDuration > 0.2 && textLength >= 5) {
            this.durationProcessed += soundDuration;
            this.charactersProcessed += textLength;
            this.durationPerCharacter = this.durationProcessed / this.charactersProcessed;
        }

        const chapter = this.book.chapters[current.cIdx];
        const paragraphsRead = chapter.slice(0, current.pIdx + 1);
        const paragraphsLeft = chapter.slice(current.pIdx + 1, chapter.length);

        const chars = {
            total: 0,
            read: 0,
            left: 0,
            book: this.bookCharsLength
        };

        chapter.map(p => chars.total = chars.total + p.length);
        paragraphsRead.map(p => chars.read = chars.read + p.length);
        paragraphsLeft.map(p => chars.left = chars.left + p.length);

        chars.bookRead = this.cumulativeChapterCharCount[Math.max(current.cIdx - 1)] + chars.read;
        chars.bookLeft = chars.book - chars.bookRead;

        const timings = {
            total: this.secondsToMinutes(this.durationPerCharacter * chars.total),
            read: this.secondsToMinutes(this.durationPerCharacter * chars.read),
            left: this.secondsToMinutes(this.durationPerCharacter * chars.left),
            book: this.secondsToHms(this.durationPerCharacter * chars.book).substring(0, 5),
            bookRead: this.secondsToHms(this.durationPerCharacter * chars.bookRead).substring(0, 5),
            bookLeft: this.secondsToHms(this.durationPerCharacter * chars.bookLeft).substring(0, 5),
        }

        this.$chapterTimingsLeft.text(`${timings.read} min`);
        this.$chapterTimingsRight.text(`${timings.left} min of ${timings.total} min • ${timings.bookLeft} of ${timings.book} in book`);
    },

    secondsToMinutes(seconds) {
        return Math.ceil(seconds / 60);
    },

    async computeBufferedTime() {
        let totalTime = 0;

        for (const para of this.currentBuffer) {
            if (para.pIdx % 100 === 0) await App.sleep(10);
            totalTime += para.sound.duration();
        }

        return this.secondsToMinutes(totalTime);
    },

    secondsToHms(seconds) {
        if (!seconds) return "00:00:00";

        const SECONDS_PER_DAY = 86400;
        const HOURS_PER_DAY = 24;

        const days = Math.floor(seconds / SECONDS_PER_DAY);
        const remainderSeconds = seconds % SECONDS_PER_DAY;
        const hms = new Date(remainderSeconds * 1000).toISOString().substring(11, 19);
        return hms.replace(/^(\d+)/, h => `${Number(h) + days * HOURS_PER_DAY}`.padStart(2, '0'));
    },

    async scrollToParagraph(cIdx, pIdx, fuzzy = false) {
        this.updateHighlight();

        let chapterNeededRender = false;

        if (cIdx === undefined || pIdx === undefined) {
            [cIdx, pIdx] = this.progressTracker;
        }

        if (parseInt(this.$container.attr('data-chapter-id')) !== cIdx) {
            await this.animateRenderChapterOnScreen('forward', cIdx);
            chapterNeededRender = true;
            await App.sleep(50);
        }

        const targetElement = document.getElementById(`reader-paragraph-${cIdx}-${pIdx}`);
        targetElement.classList.add('active');

        const safeArea = this.$wrapper.height() / 3;
        const elementHeight = Math.max(0, Math.ceil($(targetElement).offset().top)) + $(targetElement).height();

        if (
            fuzzy
            && !chapterNeededRender
            && elementHeight < safeArea
        ) {
            console.log("Skipping this scroll event");
            return;
        }

        if (targetElement) {
            this.scrollToElementInContainer(targetElement, this.$wrapper[0]);
        }

        return;
    },

    scrollToElementInContainer(targetElement, container) {
        const scrollMargin = parseInt(getComputedStyle(targetElement).scrollMarginTop) || 0;
        const offset = targetElement.getBoundingClientRect().top
            - container.getBoundingClientRect().top
            + container.scrollTop
            - scrollMargin;

        container.scrollTo({
            top: offset,
            behavior: 'smooth'
        });
    },

    stop() {
        this.isPlaying = false;
        this.isBuffering = false;

        if (this.abortController) {
            this.abortController.abort("User requested stop");
        }

        this.abortController = new AbortController();

        if (App.audioPipelineHook) {
            App.audioPipelineHook.pause();
        }

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
    },

    isFullscreen() {
        return $('#view-reader').hasClass('reader-fullscreen');
    },

    showPlaybackSettings() {
        this.$app.find('#playback-settings').addClass('active');
    },

    hidePlaybackSettings() {
        this.$app.find('#playback-settings').removeClass('active');
    },

    async addToBookTimer(seconds) {
        if (!seconds) return;
        const bookId = this.book.id;
        this.bookTimer[bookId] += seconds;

        const now = Date.now();
        if (now < (this.bookTimerUpdatedAt + 10000)) return;

        const orator = await StorageService.getOratorJson();
        if (!orator.timers) orator.timers = {};

        orator.timers[bookId] = this.bookTimer[bookId];
        this.bookTimerUpdatedAt = Date.now();
        await StorageService.writeOratorJson(orator);

        console.log(`Timer updated to ${this.bookTimer[bookId]}`);
    },

    setHighlighter() {
        this.highlighter = setInterval(
            () => requestAnimationFrame(() => this.updateHighlight()),
            1000
        );
    },

    async updateHighlight() {
        console.log("Updating highlight");

        if (!$('#view-reader').hasClass('active')) return;

        const $target = this.$app.find('.reader-paragraph.active');
        const $highlight = this.$container.find('.highlight');

        if (!$highlight.length) return;

        if (!$target.length) {
            $highlight.css('height', 0);
            return;
        }

        const [top, height] = [
            Math.max(0, $target.position().top - 2),
            $target.height() + 5,
        ];

        $highlight.css('top', `${top}px`).css('height', `${height}px`);
    }

};