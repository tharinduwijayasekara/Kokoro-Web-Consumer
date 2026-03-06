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
    ],

    async init() {
        console.log("Orator initializing...");

        try {

            await this.requestWakeLock();
            await this.loadDependencies();

            this.showView('splash');

            await StorageService.init();
            console.log("Fetched orator configuration json", StorageService.orator);

            this.setEventHandlers();
            document.getElementById('styles-for-init').remove();

            setTimeout(() => {
                this.renderCurrentlyReading();
                this.renderLibrary();
                this.setLibraryBackgroundCarousel();
            }, 500);

        } catch (e) {
            console.log("Initialization failed.", e);
        }
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

    async renderLibrary() {
        await StorageService.getOratorJson();
        let books = await StorageService.getBooks();
        if (books) {
            books = books.sort((a, b) => {
                const comparators = {
                    a: ((a.author ?? "Unknown Author") + a.title).toLowerCase(),
                    b: ((b.author ?? "Unknown Author") + b.title).toLowerCase(),
                }

                return comparators.a < comparators.b ? -1 : 1
            });
        }

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

        books.forEach(book => {
            const bookDesc = {
                src: book.meta?.description ?? "<div></div>",
                text: ""
            };

            const author = book.author;
            if (author !== lastAuthor) {

                lastAuthor = author;
                $(`<div class="author-item">${author}</div>`)
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

            const bookItemHtml = this.fromTemplate(bookItemTemplate, {
                id: book.id,
                cover: book.cover,
                title: this.truncateMiddle(book.title, (viewType === 'list' ? 100 : 50)),
                author: book.author,
                pubDate: pubDate,
                importedAt: book.importedAt,
                bookDescText: bookDesc.text,
                progress: bookProgress,
            });

            $(bookItemHtml).appendTo($list);
        });

        this.showView('library');
        this.hideMessageBoard();
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

        const book = books.find(b => b.id === orator.currentlyReading);
        if (!book) return;

        let pubDate = book.meta?.pubdate ?? "";
        if (pubDate) {
            try {
                pubDate = (new Date(pubDate)).toLocaleDateString();
            } catch (e) {
            }
        }

        const sectionTitle = this.getRandomOratorMessage(LIBRARY_CURRENT_READ_TITLES);
        const progress = StorageService.orator.reading;
        const bookProgress = ((progress[book.id] ?? "0::0::0").split('::'))[2];

        const bookItemHtml = this.fromTemplate('book-item-list', {
            id: book.id,
            cover: book.cover,
            title: book.title,
            author: book.author,
            pubDate: pubDate,
            importedAt: book.importedAt,
            bookDescText: "",
            progress: bookProgress,
        });

        this.$app.find('.library-currently-reading').html(
            [
                `<div class="library-currently-reading-header">${sectionTitle}</div>`,
                bookItemHtml
            ].join('')
        );
    },

    setEventHandlers() {
        this.$app.on('click', '.orator-btn-delete-book', async (e) => {
            e.stopPropagation();
            const id = $(e.currentTarget).data('id');

            if (confirm("Delete this book?")) {
                await StorageService.db.books.delete(id);
                this.renderLibrary();
            }
        });

        this.$app.find('#epub-input').on('change', async (e) => {
            console.log(e);

            const files = e.target.files;

            try {
                for (const file of files) {
                    console.log("New file selected for import", file);
                    this.showMessageBoard("Importing...");
                    if (file) await this.handleImport(file);
                }
            } catch (e) {
                console.log("Error while importing files", e);
            }

            console.log("Import all files complete");

            this.renderLibrary();
        });

        this.$app.on('click', '.book-item', async (e) => {
            e.stopPropagation();
            const id = $(e.currentTarget).data('id');

            console.log("About to load book for reading", id);

            this.requestWakeLock();
            StorageService.enablePersistence();
            ReaderService.init(id);
        });

        this.$app.on('click', '#btn-reader-back', async (e) => {
            e.stopPropagation();
            ReaderService.closeBook();
        });

        this.$app.on('click', '.playback-chapter-item', async (e) => {
            e.stopPropagation();
            const id = $(e.currentTarget).data('id');

            console.log("About to load up chapter index", id);
            ReaderService.renderChapterOnScreen(id);
        });

        this.$app.on('click', '#btn-reader-chapters', async (e) => {
            e.stopPropagation();
            this.$app.find('#playback-chapters').addClass('active');
        });

        this.$app.on('click', '#btn-reader-previous', async (e) => {
            e.stopPropagation();
            ReaderService.goToPreviousChapter();
        });

        this.$app.on('click', '#btn-reader-next', async (e) => {
            e.stopPropagation();
            ReaderService.goToNextChapter();
        });

        this.$app.on('click', '#btn-reader-playpause', async (e) => {
            e.stopPropagation();
            if (ReaderService.isPlaying) {
                ReaderService.stop();
                return;
            }

            ReaderService.play(-10, -12, 3);
        });

        this.$app.on('click', '#btn-reader-recenter', async (e) => {
            e.stopPropagation();
            ReaderService.scrollToParagraph(null, null);
        });

        this.$app.on('click', '.reader-paragraph', async (e) => {
            e.stopPropagation();

            if (SettingsService.isActive()) {
                ReaderService.hidePlaybackSettings();
                return;
            }

            const paragraphIdentifier = $(e.currentTarget).data('paragraph-identifier');
            const [cIdx, pIdx] = paragraphIdentifier.split('-');
            ReaderService.play(parseInt(cIdx), parseInt(pIdx), 3);
        });

        this.$app.on('click', '#btn-reader-fullscreen', async (e) => {
            e.stopPropagation();
            ReaderService.toggleFullscreen();
        });

        this.$app.on('click', '#btn-reader-settings', async (e) => {
            e.stopPropagation();

            if (SettingsService.isActive()) {
                ReaderService.hidePlaybackSettings();
                return;
            }

            ReaderService.showPlaybackSettings();
        });

        this.$app.on('click', '.speech-cust-add-btn', async (e) => {
            e.stopPropagation();
            SettingsService.addNewSpeechReplacement();
        });

        this.$app.on('click', '.speech-replacement-remove', async (e) => {
            e.stopPropagation();
            SettingsService.removeSpeechReplacement(e.currentTarget);
        });

        this.$app.on('click', '.orator-backdrop', async (e) => {
            e.stopPropagation();
            $(e.currentTarget).parent().removeClass('active');
        });

        this.$app.on('change', 'input[data-show-on-change="true"]', async (e) => {
            const $input = $(e.currentTarget);
            $input.parent().find('span').text($input.val());
        });

        this.$app.on('click', '.reader-container-wrapper', async (e) => {
            e.stopPropagation();

            if (SettingsService.isActive()) {
                ReaderService.hidePlaybackSettings();
                return;
            }
        });

        this.$app.on('click', '.btn-library-view-toggle', async (e) => {
            e.stopPropagation();
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
        } catch (e) {
            console.log("Error while importing", e);
        }

        if (!importedBook) {
            this.showMessageBoard("Import failed", "The file you selected could not be imported", -1);
            setTimeout(() => this.hideMessageBoard(), 5000);
            return;
        }

        await StorageService.db.books.put(importedBook);
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
        const strings = string.split(/(?<=[.?])\s+/);
        const response = [];

        for (let i = 0; i < strings.length; i++) {
            if (i === 0) {
                response.push(strings[i]);
                continue;
            }

            const part = strings[i];
            const prevIdx = response.length - 1;
            let prev = response[prevIdx];

            if (prev.length + part.length < 300 || part.length < 20) {
                prev = `${prev} ${part}`;
                response[prevIdx] = prev;
                continue;
            }

            response.push(`${ORATOR_P_CONTD}${strings[i]}`);
        }

        return response;
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
        const text = $('#userTextInput').val().trim();
        if (!text) return;

        App.showMessageBoard("Orator", "Importing your text...", -1);

        const paragraphsRaw = text.split(/\r?\n|\r|\n/);
        const paragraphs = [];

        for (const paragraph of paragraphsRaw) {
            if (!paragraph.trim()) continue;
            paragraphs.push(...this.splitSentences(paragraph.trim()));
        }

        const chapters = [paragraphs];

        const title = "Text (" + new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString() + ")";

        const importedBook = {
            id: `user-text-${Date.now()}`,
            title: title,
            author: "You",
            cover: '',
            chapters: chapters,
            meta: {},
            importedAt: new Date().toLocaleDateString(),
            importId: Date.now(),
        }

        await StorageService.db.books.put(importedBook);

        App.renderLibrary();
    },

    async setLibraryBackgroundCarousel() {
        const response = await fetch(`images/carousel/images.json?v=${Date.now()}`);
        const images = await response.json();

        this.libraryImages = images.map(i => `images/carousel/${i}`);
        this.libraryImages = this.shuffle(this.libraryImages);

        this.currentLibraryImageIdx = Math.floor(Math.random() * this.libraryImages.length);
        this.changeLibraryBackground();

        setInterval(() => this.changeLibraryBackground(), 10000);
    },

    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]]; // Swap elements
        }
        return array;
    },

    async changeLibraryBackground() {
        console.log("Updating library background");
        const index = this.currentLibraryImageIdx + 1 < this.libraryImages.length ? this.currentLibraryImageIdx + 1 : 0;
        this.currentLibraryImageIdx = index;
        const url = this.libraryImages[index];

        $('#view-library').attr("style", `background-image: url(${url})`);
    }

}

$(document).ready(() => App.init());