const App = {

    isProd: true,

    $app: $('#app'),

    dependencies: [
        'js/default/defaults.js',
        'js/utils/storageService.js',
        'js/utils/readerService.js',
        'js/utils/settingsService.js',
        'js/utils/importEpub.js',
        'js/utils/importEpubJsZip.js',
        'js/utils/importText.js',
    ],

    audioPipelineHook: undefined,
    hiss: undefined,

    async init() {
        console.log("Orator initializing...");

        try {

            await this.requestWakeLock();
            await this.loadDependencies();

            this.showView('splash');

            this.ensureCurrentVersion();

            this.registerOratorFonts();

            await StorageService.init();
            console.log("Fetched orator configuration json", StorageService.orator);

            this.setEventHandlers();
            document.getElementById('styles-for-init').remove();

            this.registerAudioPipelineHook();
            this.registerHiss();

            await this.race(this.loadNews(), 5 * 1000);

            await this.sleep(500);

            await Promise.all([
                this.renderCurrentlyReading(),
                this.renderLibrary()
            ]);

            this.setLibraryBackgroundCarousel();

        } catch (e) {
            console.log("Initialization failed.", e);
        }
    },

    async race(promise, milliseconds) {
        return Promise.race([
            promise,
            (new Promise(r => setTimeout(() => r(), milliseconds)))
        ]);
    },

    async requestWakeLock() {
        try {
            if ('wakeLock' in navigator) {
                wakeLock = await navigator.wakeLock.request('screen');
            }
        } catch (err) {
            console.error(`${err.name}, ${err.message}`);
        }
    },

    loadDependencies() {
        let suffix = '';
        if (this.isProd) {
            suffix = '?v=' + Date.now();
        }

        return Promise.all(this.dependencies.map(src => {
            return new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = src + suffix;
                script.onload = resolve;
                script.onerror = () => reject(`Failed to load ${src}`);
                document.head.appendChild(script);
            });
        }));
    },

    showView(viewName) {
        this.$app.find(".orator-view").removeClass('active');
        this.$app.find(`.orator-view-${viewName}`).addClass('active');
    },

    getImportedDate(book) {
        try {
            return (new Date(book.importId)).toISOString().split('T')[0];
        } catch (e) {
            return book.importedAt;
        }
    },

    getBookAuthor(book) {
        return book.author === TEXT_INPUT_AUTHOR ? [book.author, this.getImportedDate(book)].join(' / ') : book.author;
    },

    async renderLibrary() {
        await StorageService.getOratorJson();
        let books = await StorageService.getBooks();
        const orator = await StorageService.getOratorJson();

        console.log("Rendering library, got orator json and books");

        if (books) {
            books = books.sort((a, b) => {
                const comparators = {
                    a: ((this.getBookAuthor(a) ?? "Unknown Author") + a.title).toLowerCase(),
                    b: ((this.getBookAuthor(b) ?? "Unknown Author") + b.title).toLowerCase(),
                }

                return comparators.a < comparators.b ? -1 : 1
            });
        }

        await App.sleep(50); //yield for ui thread

        const $list = $('#library-list').empty();

        if (!books || books.length === 0) {
            $('<div>')
                .addClass('p-5 text-center text-light')
                .attr('style', 'grid-column: 1/-1; height: 200px')
                .text("No books available. Tap + to import")
                .appendTo($list);

            this.showView('library');
            this.hideMessageBoard();
            return;
        }

        let lastAuthor = -1;

        const viewType = StorageService.orator.config.libraryView ?? "list";
        $('#view-library').attr('data-view', viewType);

        const bookItemTemplate = `book-item-${viewType}`;

        const progress = StorageService.orator.reading;

        const promises = [];

        const booksById = {};

        const readingTimers = orator.timers;

        for (const book of books) {
            promises.push(new Promise(r => {

                const bookDesc = {
                    src: book.meta?.description ?? "<div></div>",
                    text: ""
                };

                const author = this.getBookAuthor(book);
                if (author !== lastAuthor) {

                    lastAuthor = author;

                    let authorItemClass = [
                        'author-item',
                        author.startsWith(`${TEXT_INPUT_AUTHOR} / `) ? 'text-input-author' : '',
                    ]
                        .join(' ')
                        .trim();

                    $(`<div class="${authorItemClass}">${author}</div>`)
                        .appendTo($list)

                }

                try {
                    bookDesc.text = $(bookDesc.src).text().trim();
                } catch (e) {
                    bookDesc.text = bookDesc.src;
                } finally {
                    bookDesc.text = bookDesc.text.length > 500 ? `${bookDesc.text.substring(0, 500)}...` : bookDesc.text;
                }

                let pubDate = book.meta?.pubdate ?? "";
                if (pubDate) {
                    try {
                        pubDate = (new Date(pubDate)).toLocaleDateString();
                    } catch (e) {
                    }
                }

                const bookProgress = ((progress[book.id] ?? "0::0::0").split('::'))[2];

                let readingTime = readingTimers?.[book.id] ?? 0;
                readingTime = isNaN(readingTime) ? 0 : Math.round(readingTime / (60 * 60));
                readingTime = this.pluralize(readingTime, 'hour');

                const bookItemHtml = this.fromTemplate(bookItemTemplate, {
                    id: book.id,
                    cover: book.cover ?? DEFAULT_BOOK_COVER,
                    title: this.truncateMiddle(book.title, (viewType === 'list' ? 100 : 50)),
                    author: book.author,
                    pubDate: pubDate,
                    importedAt: book.importedAt,
                    bookDescText: bookDesc.text,
                    progress: bookProgress,
                    readingTime: readingTime,
                });

                const classes = [];
                //if (!book.cover) classes.push('no-cover');

                $(bookItemHtml)
                    .addClass(classes.join(' '))
                    .appendTo($list);

                booksById[book.id] = book;

                r();

            }));
        }

        await Promise.all(promises);

        if (readingTimers) {
            const total = Object.entries(readingTimers).map(bookTimer => {
                const [_, time] = bookTimer;
                return !isNaN(time) ? time : 0;
            })
                .reduce((p, v) => p + v, 0); // sum it up

            if (total) {
                const hours = Math.round(total / (60 * 60));
                $('.library-top-image p').text(`Total Reading Time: ${this.pluralize(hours, 'hour')}`);
            }
        }

        this.$app.find('.library-storage-quota').text(await StorageService.availableStorageGB());

        this.showView('library');
        this.hideMessageBoard();
    },

    pluralize(number, unit) {
        return [number, number === 1 ? unit : `${unit}s`].join(' ');
    },

    truncateMiddle(str, max) {
        const take = Math.floor((Math.max(5, max) - 5) / 2);

        if (str.length > max) {
            return `${str.substring(0, take)} ... ${str.substring(str.length - take, str.length)}`;
        }

        return str;
    },

    fromTemplate(templateId, data) {
        let html = $(`#template-${templateId}`).html();
        if (typeof data !== 'object') throw Error("From template expects a template id and a data object");

        for (const [key, value] of Object.entries(data)) {
            html = html.replaceAll(`{{${key}}}`, value);
        }

        return html;
    },

    async renderCurrentlyReading() {
        const orator = await StorageService.getOratorJson();
        const books = await StorageService.getBooks();

        if (!orator.currentlyReading || !books) return;

        const currentlyReadingList = (orator.currentlyReading ?? "").split('///---///');
        if (currentlyReadingList.length === 0) {
            return;
        }

        const todaysDate = new Date().toLocaleDateString('en-CA', {timeZone: 'Asia/Colombo'});
        currentlyReadingList.push(
            `news/news-${todaysDate}.txt`
        )

        const bookItemHtmls = [];

        for (const bookId of currentlyReadingList) {

            const book = books.find(b => b.id === bookId);
            if (!book) continue;

            let pubDate = book.meta?.pubdate ?? "";
            if (pubDate) {
                try {
                    pubDate = (new Date(pubDate)).toLocaleDateString();
                } catch (e) {
                }
            }

            const progress = StorageService.orator.reading;
            const bookProgress = ((progress[book.id] ?? "0::0::0").split('::'))[2];

            let readingTime = orator.timers?.[book.id] ?? 0;
            readingTime = isNaN(readingTime) ? 0 : Math.round(readingTime / (60 * 60));
            readingTime = this.pluralize(readingTime, 'hour');

            const bookItemHtml = this.fromTemplate('book-item-list', {
                id: book.id,
                cover: book.cover ?? DEFAULT_BOOK_COVER,
                title: book.title,
                author: book.author,
                pubDate: pubDate,
                importedAt: book.importedAt,
                bookDescText: "",
                progress: bookProgress,
                readingTime: readingTime
            });

            bookItemHtmls.push(bookItemHtml);

        }

        const sectionTitle = this.getRandomOratorMessage(LIBRARY_CURRENT_READ_TITLES);
        this.$app.find('.library-currently-reading').html(
            [
                `<div class="library-currently-reading-header">${sectionTitle}</div>`,
                bookItemHtmls.join('')
            ].join('')
        );

        this.$app.find('.library-currently-reading .book-item').addClass('win7-progress-fill');
    },

    setEventHandlers() {
        this.$app.on('click', '.orator-btn-delete-book', async (e) => {
            e.stopPropagation();
            this.requestWakeLock();

            const id = $(e.currentTarget).data('id');

            if (confirm("Delete this book?")) {
                await StorageService.db.books.delete(id);
                this.renderCurrentlyReading();
                this.renderLibrary();
            }
        });

        this.$app.find('#epub-input').on('change', async (e) => {
            this.requestWakeLock();

            console.log(e);

            const files = e.target.files;
            let importedBook = undefined;

            const importTasks = [];

            try {
                for (const file of files) {
                    console.log("New file selected for import", file);
                    this.showMessageBoard("Importing...");

                    if (file) {
                        importTasks.push(this.handleImport(file));
                    }

                    this.showMessageBoard("Importing...");
                }
            } catch (e) {
                console.log("Error while importing files", e);
            }

            const importedBooks = await Promise.all(importTasks);
            importedBook = importedBooks.length === 1 ? importedBooks[0] : undefined;

            console.log("Import all files complete");

            await this.renderLibrary();
            if (files.length === 1 && importedBook) {
                ReaderService.init(importedBook.id);
            }
        });

        this.$app.on('click', '.book-item', async (e) => {
            e.stopPropagation();
            this.requestWakeLock();

            const id = $(e.currentTarget).data('id');

            console.log("About to load book for reading", id);

            StorageService.enablePersistence();
            ReaderService.init(id);
        });

        this.$app.on('click', '#btn-reader-back', async (e) => {
            e.stopPropagation();
            this.requestWakeLock();

            ReaderService.closeBook();
        });

        this.$app.on('click', '.playback-chapter-item', async (e) => {
            e.stopPropagation();
            this.requestWakeLock();

            const id = $(e.currentTarget).data('id');

            console.log("About to load up chapter index", id);
            ReaderService.renderChapterOnScreen(id);
        });

        this.$app.on('click', '#btn-reader-chapters', async (e) => {
            e.stopPropagation();
            this.requestWakeLock();

            this.$app.find('#playback-chapters').addClass('active');
        });

        this.$app.on('click', '#btn-reader-previous', async (e) => {
            e.stopPropagation();
            this.requestWakeLock();

            ReaderService.goToPreviousChapter();
        });

        this.$app.on('click', '#btn-reader-next', async (e) => {
            e.stopPropagation();
            this.requestWakeLock();

            ReaderService.goToNextChapter();
        });

        this.$app.on('click', '#btn-reader-playpause', async (e) => {
            e.stopPropagation();
            this.requestWakeLock();

            if (ReaderService.isPlaying) {
                ReaderService.stop();
                return;
            }

            ReaderService.play(-10, -12, 3);
        });

        this.$app.on('click', '#btn-reader-recenter', async (e) => {
            e.stopPropagation();
            this.requestWakeLock();

            ReaderService.scrollToParagraph(undefined, undefined);
        });

        this.$app.on('click', '.reader-paragraph', async (e) => {
            e.stopPropagation();
            this.requestWakeLock();

            if (SettingsService.isActive()) {
                ReaderService.hidePlaybackSettings();
                return;
            }

            if ($('#view-reader').hasClass('reader-fullscreen')) {
                $('#view-reader').removeClass('reader-fullscreen');
                return;
            }

            const paragraphIdentifier = $(e.currentTarget).data('paragraph-identifier');
            const [cIdx, pIdx] = paragraphIdentifier.split('-');
            ReaderService.play(parseInt(cIdx), parseInt(pIdx), 3);
        });

        this.$app.on('click', '.reader-paragraph-wrapper', async (e) => {
            e.stopPropagation();
            this.requestWakeLock();

            if (SettingsService.isActive()) {
                ReaderService.hidePlaybackSettings();
                return;
            }

            if ($('#view-reader').hasClass('reader-fullscreen')) {
                $('#view-reader').removeClass('reader-fullscreen');
                return;
            }

            const $firstParagraph = $(e.currentTarget).find('.reader-paragraph').first();
            const paragraphIdentifier = $firstParagraph.data('paragraph-identifier');
            const [cIdx, pIdx] = paragraphIdentifier.split('-');
            ReaderService.play(parseInt(cIdx), parseInt(pIdx), 3);
        });

        this.$app.on('click', '#btn-reader-fullscreen', async (e) => {
            e.stopPropagation();
            this.requestWakeLock();

            ReaderService.toggleFullscreen();
        });

        this.$app.on('click', '#btn-reader-settings', async (e) => {
            e.stopPropagation();
            this.requestWakeLock();

            if (SettingsService.isActive()) {
                ReaderService.hidePlaybackSettings();
                return;
            }

            ReaderService.showPlaybackSettings();
        });

        this.$app.on('click', '.speech-cust-add-btn', async (e) => {
            e.stopPropagation();
            this.requestWakeLock();

            SettingsService.addNewSpeechReplacement();
        });

        this.$app.on('click', '.speech-replacement-remove', async (e) => {
            e.stopPropagation();
            this.requestWakeLock();

            SettingsService.removeSpeechReplacement(e.currentTarget);
        });

        this.$app.on('click', '.orator-backdrop', async (e) => {
            e.stopPropagation();
            this.requestWakeLock();

            $(e.currentTarget).parent().removeClass('active');
        });

        this.$app.on('change', 'input[data-show-on-change="true"]', async (e) => {
            const $input = $(e.currentTarget);
            $input.parent().find('span').text($input.val());
        });

        this.$app.on('click', '.reader-container-wrapper', async (e) => {
            e.stopPropagation();
            this.requestWakeLock();

            if (SettingsService.isActive()) {
                ReaderService.hidePlaybackSettings();
                return;
            }

            if ($('#view-reader').hasClass('reader-fullscreen')) {
                $('#view-reader').removeClass('reader-fullscreen');
                return;
            }
        });

        this.$app.on('click', '.btn-library-view-toggle', async (e) => {
            e.stopPropagation();
            this.requestWakeLock();

            this.handleViewToggle();
        });

        window.onpopstate = (e) => {
            if (App.currentPage && App.currentPage === "book") {
                ReaderService.closeBook();
            }
        };

    },

    async handleViewToggle() {
        const views = ['list', 'grid'];
        let view = $('#view-library').attr('data-view');
        let viewIndex = views.indexOf(view);

        if (viewIndex < 0) {
            view = 'list';
        }

        viewIndex++;
        viewIndex = viewIndex > (views.length - 1) ? 0 : viewIndex;

        const newView = views[viewIndex];
        $('#view-library').attr('data-view', newView);

        await StorageService.getOratorJson();
        const config = StorageService.orator.config;
        config.libraryView = newView;

        await SettingsService.saveSettings(config);
        this.renderLibrary();
    },

    async handleImport(file) {

        this.showMessageBoard("Importing...", "Opening...", -1);
        console.log(file);

        let importedBook = null;

        try {
            if (file.type === 'application/epub+zip' || file.type === 'application/epub') {
                importedBook = await ImportEpub.handle(file);
            }

            if (file.type === 'text/plain') {
                importedBook = await ImportText.handle(file);
            }
        } catch (e) {
            console.log("Error while importing", e);
        }

        if (!importedBook) {
            this.showMessageBoard("Import failed", "The file you selected could not be imported", -1);
            setTimeout(() => this.hideMessageBoard(), 5000);
            return;
        }

        await StorageService.db.books.put(importedBook);

        return importedBook;
    },

    async urlToBase64(url) {
        if (!url) return ''; // Fallback for books without covers
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
    },

    async showMessageBoard(title, message, progress = -1) {
        const $messageBoard = $('#message-board-wrapper').show();
        $messageBoard.find('.message-board-header').text(title);
        $messageBoard.find('.message-board-container p').text(message);

        const $progress = $messageBoard.find('.message-progress');

        if (progress < 0) {
            $progress.hide();
        }

        if (progress > -1) {
            $progress.show()
                .find('div')
                .width(`${progress}%`);
        }
    },

    async hideMessageBoard() {
        await this.sleep(100);
        const $messageBoard = $('#message-board-wrapper').hide();
        const $progress = $messageBoard.find('.message-progress');
        $progress.show()
            .find('div')
            .width(`0%`);
    },

    getRandomOratorMessage(selectFrom = ORATOR_MESSAGES) {
        if (selectFrom.length === 0) return "";

        const seconds = Math.floor(Date.now() / 1000);
        const index = seconds % selectFrom.length;

        return selectFrom[index];
    },

    async sleep(milliseconds) {
        return new Promise(resolve => setTimeout(() => resolve(), milliseconds));
    },

    splitSentences(string) {
        const strings = string
            .replaceAll('—', ' — ') // normalize em dashes
            .replace(/\s+/g, ' ') // remove doubles spaces that maybe caused by em dash normalization
            .split(/(?<=[.?!])\s+/); // split

        const response = [];

        for (let i = 0; i < strings.length; i++) {
            if (i === 0) {
                response.push(strings[i]);
                continue;
            }

            const part = strings[i];
            const prevIdx = response.length - 1;
            let prev = response[prevIdx];
            let prevArr = prev.split(' ');
            let partArr = part.split(' ');

            if (
                !this.hasEvenSpeechMarks(prev)
                || prevArr.length < 50
                || partArr.length < 10
                || this.isTitleContraction(prevArr[prevArr.length - 1])
            ) {
                response[prevIdx] = [prev, part].join(' ');
                continue;
            }

            response.push(`${ORATOR_P_CONTD}${strings[i]}`);
        }

        return response;
    },

    isTitleContraction(word) {
        if (word.length < 2 || word.length > 5) return false;

        const [firstChar, lastChar] = [word.charAt(0), word.charAt(word.length - 1)];

        if (lastChar !== '.') return false;
        if (firstChar !== firstChar.toUpperCase()) return false;

        return true;
    },

    hasEvenSpeechMarks(text) {
        // 1. Matches all double quotes (", “, ”)
        // 2. Matches single quotes (', ‘, ’) ONLY if they are NOT preceded by a letter
        const speechMarkRegex = /["“”]|(?<!\p{L})['‘’]/gu;

        const matches = text.match(speechMarkRegex);

        return !matches || matches.length % 2 === 0;
    },

    async loadFileAsync(file) {
        return new Promise(resolve => {

            const reader = new FileReader();
            reader.onload = (e => {
                console.log("File reader loaded", e);
                resolve(e);
            });
            reader.readAsArrayBuffer(file);

        });
    },

    async importUserInput() {
        this.requestWakeLock();
        StorageService.enablePersistence();

        const $input = $('#userTextInput');
        const text = $input.val().trim();
        if (!text) {
            this.$app.find('#epub-input').trigger('click');
            return;
        }

        App.showMessageBoard("Orator", "Importing your text...", -1);
        const importedBook = await ImportText.importFromText(text);
        await StorageService.db.books.put(importedBook);

        $input.val('');

        await App.renderLibrary();

        console.log("About to load book for reading", importedBook.id);
        ReaderService.init(importedBook.id);
    },

    async setLibraryBackgroundCarousel() {
        const response = await fetch(`images/carousel/images.json?v=${Date.now()}`);
        const images = await response.json();

        this.libraryImages = images.map(i => `images/carousel/${i}`);
        this.libraryImages = this.shuffle(this.libraryImages);

        this.currentLibraryImageIdx = Math.floor(Math.random() * this.libraryImages.length);
        this.changeLibraryBackground();

        setInterval(() => this.changeLibraryBackground(), 30000);
    },

    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]]; // Swap elements
        }
        return array;
    },

    async changeLibraryBackground() {
        if (!this.$app.find('#view-library.active').length) return;

        console.log("Updating library background");
        const index = this.currentLibraryImageIdx + 1 < this.libraryImages.length ? this.currentLibraryImageIdx + 1 : 0;
        this.currentLibraryImageIdx = index;
        const url = this.libraryImages[index];

        $('#view-library').attr("style", `background-image: url(${url})`);
    },

    registerAudioPipelineHook() {
        this.audioPipelineHook = $('#audio-pipeline-hook')[0];
    },

    registerHiss() {
        const hiss = new Howl({
            src: "audio/hiss-v3.mp3",
            loop: true,
            html5: false,
        });

        this.hiss = hiss;
    },

    ensureCurrentVersion() {
        const url = new URL(window.location.href);

        if (parseInt(url.searchParams.get('v') ?? 0) !== CURRENT_VERSION) {
            url.searchParams.set('v', CURRENT_VERSION);
            window.location.href = url.toString();
        }
    },

    async loadNews() {
        const importFromDate = async (date) => {
            const url = `news/news-${date}.txt`;
            const news = await fetch(url, {
                method: 'GET'
            });

            if (!news) return;

            const text = await news.text();
            if (!text) return;

            const importedBook = await ImportText.importFromText(text, true);
            importedBook.id = url;
            importedBook.title = `News Update SL: ${date}`;
            await StorageService.db.books.put(importedBook);
        };

        const dates = Array.from({ length: 5 }, (_, i) =>
            new Date(Date.now() - (i * 24 * 60 * 60 * 1000)).toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' })
        );

        await Promise.all(dates.map(importFromDate));
    },

    registerOratorFonts() {
        const basePath = 'fonts';
        const styleEl = document.createElement('style');

        const css = ORATOR_FONT_FILES.map(entry => {
            const hasItalic = entry.endsWith('+Italic');
            const fontName = hasItalic ? entry.replace('+Italic', '') : entry;

            const regularSrc = `url('${basePath}/${fontName}-Regular.woff2') format('woff2')`;
            const italicSrc = hasItalic
                ? `url('${basePath}/${fontName}-Italic.woff2') format('woff2')`
                : regularSrc;

            return `
            @font-face {
                font-family: '${fontName}';
                src: ${regularSrc};
                font-weight: normal;
                font-style: normal;
            }
            @font-face {
                font-family: '${fontName}';
                src: ${italicSrc};
                font-weight: normal;
                font-style: italic;
            }`
                .trim();
        })
            .join('\n\n');

        styleEl.textContent = css;
        document.head.appendChild(styleEl);
    }

}

$(document).ready(() => App.init());