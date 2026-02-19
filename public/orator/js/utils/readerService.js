const ReaderService = {

    book: undefined,
    progressTracker: [0, 0, 0],

    currentChapterOnScreen: undefined,

    $app: undefined,
    $container: undefined,
    $bookName: undefined,
    $chaptersListHeader: undefined,
    $chaptersList: undefined,

    $playPauseButton: undefined,
    $bufferHealth: 0,

    currentBuffer: [],
    isBuffering: false,
    isPlaying: false,

    async init(bookId) {
        this.$app = App.$app;
        this.$container = this.$app.find('.reader-container');
        this.$bookName = this.$app.find('#navbar-book-name');
        this.$chaptersListHeader = this.$app.find('.playback-chapter-header');
        this.$chaptersList = this.$app.find('.playback-chapters-list');
        this.$playPauseButton = this.$app.find('#btn-reader-playpause');
        this.$bufferHealth = this.$app.find('.buffer-health');

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

        App.showView('reader');
    },

    async renderChaptersList() {
        this.$chaptersListHeader.css('background-image', `url(${this.book.cover})`)
        this.$chaptersList.empty();

        this.book.chapters.forEach((paragraphs, chapterId) => {
            let chapterTitle = "¤\n" + (paragraphs[0] ?? '-');
            if (chapterTitle.length > 70) chapterTitle = chapterTitle.substring(0, 70) + '...';

            $('<div></div>')
                .text(chapterTitle)
                .addClass('playback-chapter-item')
                .attr('data-id', chapterId)
                .appendTo(this.$chaptersList);
        })
    },

    async renderChapterOnScreen(chapterId) {
        const chapterIdToRender = chapterId ?? this.progressTracker[0];
        console.log("Rendering chapter on screen", chapterIdToRender);

        const chapter = this.book.chapters[chapterIdToRender];
        this.$container.empty();

        chapter.forEach((paragraph, paragraphId) => {
            $paragraph = $('<p></p>')
                .addClass('reader-paragraph')
                .attr('data-paragraph-identifier', `${chapterIdToRender}-${paragraphId}`)
                .text(paragraph)
                .appendTo(this.$container);
        });

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

        this.isPlaying = true;
        this.$playPauseButton.addClass('playing');

        console.log("Calling fill buffer", chapterId, paragraphId, bufferSize);
        await this.fillBuffer(chapterId, paragraphId, bufferSize);

        console.log("Calling play next");
        this.playNext();
    },

    async fillBuffer(cIdx, pIdx, size) {
        if (this.isBuffering) {
            console.log("Fill buffer called while buffering previous request");
            return;
        }

        const needed = size - this.currentBuffer.length;
        if (needed <= 0) {
            console.log("Buffer health good");
        }

        this.isBuffering = true;

        let maxBatchSize = size < 10 ? size : 10;
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
                const text = this.getParagraphText(tempC, tempP);
                if (!text) break;

                fetchTasks.push(
                    this.fetchAndLoad(text, tempC, tempP)
                );

                [tempC, tempP] = this.getNextParagraphId(tempC, tempP);
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

    async fetchAndLoad(text, cIdx, pIdx) {
        console.log("Fetch and load", cIdx, pIdx, text.substring(0, 30));

        const ttsUrl = 'https://kokoro.orator-audio.com/v1/audio/speech'; // Get from config in the future
        const voice = 'af_heart(1)+af_sky(1)+af_nicole(1)';
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
            headers: {
                'accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(params)
        });

        if (!response.ok) throw new Error("TTS Fetch Failed");

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);

        const shortText = text.substring(0, 20);

        return new Promise((resolve) => {

            const sound = new Howl({
                src: [url],
                format: ['mp3'],
                html5: false,
                onload: () => {
                    console.log("Howler finished loading", cIdx, pIdx);
                    resolve({shortText, cIdx, pIdx, sound, url})
                },
                onloadError: () => {
                    console.log("Howloer failed to load", cIdx, pIdx);
                    URL.revokeObjectURL(url);
                    resolve(null);
                },
                onend: () => {
                    sound.unload(); // Free memory
                    URL.revokeObjectURL(url);
                    if (this.isPlaying) this.playNext();
                }
            })

        });
    },

    async playNext() {
        if (!this.isPlaying || this.currentBuffer.length === 0) return;

        console.log("About to play next, current buffer length", this.currentBuffer.length);

        const current = this.currentBuffer.shift();
        this.$bufferHealth.text(`${this.currentBuffer.length} ready to play`);
        current.sound.play();

        const orator = await StorageService.getOratorJson();
        this.progressTracker = `${current.cIdx}::${current.pIdx}::0`;
        orator.reading[this.book.id] = this.progressTracker;
        console.log("Progress tracker moved to", this.progressTracker);
        await StorageService.writeOratorJson(orator);

        const last = this.currentBuffer[this.currentBuffer.length - 1] || current;

        let [nextC, nextP] = this.getNextParagraphId(last.cIdx, last.pIdx);

        console.log("About to call fill buffer with", nextC, nextP);
        this.fillBuffer(nextC, nextP, 200);
    },

    stop() {
        this.isPlaying = false;
        this.$playPauseButton.removeClass('playing');

        Howler.stop();

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
    }
};