const App = {

    isProd: true,

    $app: $('#app'),

    dependencies: [
        'js/default/defaults.js',
        'js/utils/storageService.js',
        'js/utils/readerService.js',
        'js/utils/settingsService.js',
        'js/utils/importEpub.js',
    ],

    async init() {
        console.log("Orator initializing...");

        try {

            console.log("Requesting wake lock");
            await this.requestWakeLock();

            await this.loadDependencies();
            console.log("Dependencies loaded.");

            this.showView('splash');

            await StorageService.init();

            console.log("Fetched orator configuration json", StorageService.orator);

            this.setEventHandlers();

            document.getElementById('styles-for-init').remove();

            setTimeout(() => {
                this.renderLibrary();
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
        const books = await StorageService.getBooks();
        const $list = $('#library-list').empty();

        if (!books || books.length === 0) {
            $('<div>')
                .addClass('p-5 text-center text-light')
                .text("No books available. Tap + to import")
                .appendTo($list);

            this.showView('library');
            this.hideMessageBoard();
            return;
        }

        books.forEach(book => {
            $(`
                <div class="book-item" xmlns="http://www.w3.org/1999/html" data-id="${book.id}">
                    <img src="${book.cover}" class="book-cover-thumb">
                    <div class="book-details">
                        <div class="fw-bold">${book.title}</div>
                        <p class="text-muted">
                            ${book.author}
                            </br>
                            ${book.importedAt}
                        </p>
                    </div>
                    <button class="btn btn-sm orator-btn-delete-book" data-id="${book.id}">
                        <i class="text-danger bi bi-trash3-fill" style="font-size: 20px"></i>
                    </button>
                </div>
            `)
                .appendTo($list);
        });

        this.showView('library');
        this.hideMessageBoard();
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

        this.$app.find('#epub-input').on('change', (e) => {
            console.log(e);
            const file = e.target.files[0];
            console.log("New file selected for import", file);
            if (file) this.handleImport(file);
        });

        this.$app.on('click', '.book-item', async (e) => {
            e.stopPropagation();
            const id = $(e.currentTarget).data('id');

            console.log("About to load book for reading", id);
            ReaderService.init(id);
        });

        this.$app.on('click', '#btn-reader-back', async (e) => {
            e.stopPropagation();
            ReaderService.stop();
            this.showView('library');
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

        this.$app.on('click', '#speech-svc-reset-kokoro', async (e) => {
            e.stopPropagation();
            SettingsService.resetSpeechSettings("kokoro");
        });

        this.$app.on('click', '#speech-svc-reset-edgetts', async (e) => {
            e.stopPropagation();
            SettingsService.resetSpeechSettings("edgeTTS");
        });

        this.$app.on('click', '.orator-backdrop', async (e) => {
            e.stopPropagation();
            $(e.currentTarget).parent().removeClass('active');
        });
    },

    async handleImport(file) {

        this.showMessageBoard("Importing...", "Reading your book", -1);
        console.log(file);

        let importedBook = null;

        try {
            if (file.type === 'application/epub+zip') {
                importedBook = await ImportEpub.handle(file);
            }
        } catch (e) {
            console.log("Error while importing", e);
        }

        this.hideMessageBoard();

        if (!importedBook) {
            this.showMessageBoard("Import failed", "The file you selected could not be imported", -1);
            setTimeout(() => this.hideMessageBoard(), 5000);
            return;
        }

        await StorageService.db.books.put(importedBook);
        this.renderLibrary();
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

    getRandomOratorMessage() {
        if (ORATOR_MESSAGES.length === 0) return "";

        const seconds = Math.floor(Date.now() / 1000);
        const index = seconds % ORATOR_MESSAGES.length;

        return ORATOR_MESSAGES[index];
    },

    async sleep(milliseconds) {
        return new Promise(resolve => setTimeout(() => resolve(), milliseconds));
    }

}

$(document).ready(() => App.init());