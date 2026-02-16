const App = {

    db: undefined,
    orator: {},
    $app: $('#app'),

    dependencies: [
        'js/default/defaults.js'
    ],

    async init() {
        console.log("Orator initializing...");

        try {

            await this.loadDependencies();
            console.log("Dependencies loaded.");

            this.showView('splash');

            this.db = await this.initDB();
            await this.seedDefaults();

            console.log("Fetched orator configuration json", this.orator);

            this.setEventHandlers();

            setTimeout(() => {
                this.renderLibrary();
            }, 1000);

        } catch (e) {
            console.log("Initialization failed.", e);
        }
    },

    loadDependencies() {
        return Promise.all(this.dependencies.map(src => {
            return new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = src;
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

    async initDB() {
        const db = new Dexie("OratorDB");
        db.version(1).stores({
            books: "id, title, importedAt",
            data: 'key'
        });
        return db;
    },

    async seedDefaults() {
        const orator = await this.getOratorJson();

        if (!orator) {
            await this.writeOratorJson(DEFAULT_ORATOR_JSON);
            console.log("Default orator json updated");
        }
    },

    async getOratorJson() {
        const orator = await this.db.data.get('orator');
        if (!orator || !orator.orator) return {};

        this.orator = orator.orator;
        return this.orator;
    },

    async writeOratorJson(orator) {
        await this.db.data.add({
            key: "orator",
            ...orator
        });

        console.log("Orator json updated");
        this.orator = this.getOratorJson();
    },

    async renderLibrary() {
        this.getOratorJson();
        const books = await this.db.books.toArray();
        const $list = $('#library-list').empty();

        if (!books || books.length === 0) {
            $('<div>')
                .addClass('p-5 text-center text-muted')
                .text("No books available. Tap + to import")
                .appendTo($list);

            this.showView('library');
            return;
        }

        books.forEach(book => {
            $(`
                <div class="book-item">
                    <img src="${book.cover}" class="book-cover-thumb">
                    <div class="book-details">
                        <div class="fw-bold">${book.title}</div>
                        <small class="text-muted">${book.importedAt}</small>
                    </div>
                    <button class="btn btn-outline-danger btn-sm orator-btn-delete-book" data-id="${book.id}">X</button>
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
               await this.db.books.delete(id);
               this.renderLibrary();
           }
        });

        this.$app.find('#epub-input').on('change', (e) => {
            console.log(e);
            const file = e.target.files[0];
            console.log("New file selected for import", file);
            if (file) this.handleImport(file);
        });
    },

    async handleImport(file) {
        console.log("Processing EPUB...");
        const reader = new FileReader();

        reader.onload = async (e) => {
            const book = ePub(e.target.result, { restore: false });

            try {
                await book.ready;
                const zipFiles = book.zip.zip.files;
                const chapters = [];

                // 1. Get all filenames, sort them to keep book order
                const fileKeys = Object.keys(zipFiles)
                    .filter(key => key.endsWith('.xhtml') || key.endsWith('.html'))
                    .sort();

                // 2. Iterate and extract
                fileKeys.forEach(key => {
                    const htmlString = zipFiles[key].asText();
                    const $doc = $($.parseHTML(htmlString));

                    const paragraphs = [];
                    $doc.find('p, h1, h2, h3').each((i, el) => {
                        const txt = $(el).text().trim();
                        if (txt.length > 0) {
                            paragraphs.push(txt.replace(/\s+/g, ' '));
                        }
                    });

                    if (paragraphs.length > 0) chapters.push(paragraphs);
                });

                console.log("Direct Zip Extraction Complete", chapters);

                // Save to Dexie logic...
                const meta = await book.getMetadata();
                const coverUrl = await book.coverUrl();
                const base64Cover = await this.urlToBase64(coverUrl);

                await this.db.books.add({
                    id: Date.now(),
                    title: meta.bookTitle || file.name,
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