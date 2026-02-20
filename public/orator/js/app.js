const App = {

    isProd: true,

    $app: $('#app'),

    dependencies: [
        'js/default/defaults.js',
        'js/utils/storageService.js',
        'js/utils/readerService.js',
    ],

    async init() {
        console.log("Orator initializing...");

        try {

            await this.loadDependencies();
            console.log("Dependencies loaded.");

            this.showView('splash');

            await StorageService.init();

            console.log("Fetched orator configuration json", StorageService.orator);

            this.setEventHandlers();

            setTimeout(() => {
                this.renderLibrary();
            }, 500);

        } catch (e) {
            console.log("Initialization failed.", e);
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
            //Readerservice.stop;

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

        this.$app.on('click', '.reader-paragraph', async (e) => {
            e.stopPropagation();
            const paragraphIdentifier = $(e.currentTarget).data('paragraph-identifier');
            const [cIdx, pIdx] = paragraphIdentifier.split('-');
            ReaderService.play(parseInt(cIdx), parseInt(pIdx), 3);
        });

        this.$app.on('click', '.orator-backdrop', async (e) => {
            e.stopPropagation();
            $(e.currentTarget).parent().removeClass('active');
        });
    },

    async handleImport(file) {
        console.log("Processing EPUB...");
        const reader = new FileReader();

        reader.onload = async (e) => {
            const book = ePub(e.target.result, {restore: false});

            try {
                await book.ready;
                const zipFiles = book.zip.zip.files;
                const chapters = [];

                // 1. Get all filenames, sort them to keep book order
                const fileKeys = Object.keys(zipFiles)
                    .filter(key => key.endsWith('.xhtml') || key.endsWith('.html'))
                    .sort((a, b) => {
                        return a.localeCompare(b, undefined, {
                            numeric: true,
                            sensitivity: 'base'
                        });
                    });

                // 2. Iterate and extract
                fileKeys.forEach(key => {
                    let htmlString = zipFiles[key].asText();
                    htmlString = htmlString
                        .replaceAll('\r\n', '')
                        .replace(/\s+/g, ' ')
                        .trim();

                    const bodyMatch = htmlString.match(/<body[^>]*>([\s\S.]*)<\/body>/i);
                    const contentToParse = bodyMatch ? bodyMatch[1] : htmlString;

                    const $doc = $($.parseHTML(`<div>${contentToParse}</div>`));

                    const paragraphs = [];
                    // Use '*' and filter to avoid namespace/selector issues
                    $doc.find('*').each((i, el) => {
                        if (['P', 'H1', 'H2', 'H3'].includes(el.tagName.toUpperCase())) {
                            const txt = $(el).text().trim();
                            if (txt.length > 0) {
                                paragraphs.push(txt.replace(/\s+/g, ' '));
                            }
                        }
                    });

                    if (paragraphs.length > 0) chapters.push(paragraphs);
                });

                console.log("Direct Zip Extraction Complete", chapters);

                // Save to Dexie logic...
                const meta = await book.getMetadata();
                const base64Cover = await this.getBookCover(book);

                await StorageService.db.books.add({
                    id: Date.now(),
                    title: meta.bookTitle || file.name,
                    author: meta.creator || "",
                    cover: base64Cover,
                    chapters: chapters,
                    importedAt: new Date().toLocaleDateString()
                });

                this.renderLibrary();
            } catch (err) {
                console.error("Direct extraction failed:", err);
            }
        };

        reader.readAsArrayBuffer(file);
    },

    async getBookCover(book) {
        try {
            // 1. Primary Method
            const coverUrl = await book.coverUrl();
            if (coverUrl) return await this.urlToBase64(coverUrl);
        } catch (e) {
            console.warn("Standard cover fetch failed, searching archive...");
        }

        // 2. Fallback: Search the ZIP archive
        try {
            // Accessing the internal JSZip files
            const files = book.zip.zip.files;
            const imageKeys = Object.keys(files).filter(path =>
                /\.(jpg|jpeg|png|webp)$/i.test(path) && !path.includes('__MACOSX')
            );

            if (imageKeys.length > 0) {
                // Find 'cover' specifically, or fallback to the first available image
                const bestMatch = imageKeys.find(k => k.toLowerCase().includes('cover')) || imageKeys[0];
                const fileObject = files[bestMatch];

                // Use ArrayBuffer for clean binary extraction
                const buffer = fileObject.asArrayBuffer();
                const blob = new Blob([buffer], { type: 'image/jpeg' }); // Browser handles specific subtype logic
                const tempUrl = URL.createObjectURL(blob);

                try {
                    return await this.urlToBase64(tempUrl);
                } finally {
                    URL.revokeObjectURL(tempUrl); // Prevent memory leaks
                }
            }
        } catch (e) {
            console.error("Archive search failed", e);
        }

        return null; // No cover found
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
    }

}

$(document).ready(() => App.init());