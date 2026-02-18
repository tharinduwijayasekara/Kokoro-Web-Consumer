const ReaderService = {

    book: undefined,
    progressTracker: [0,0,0],

    $app: undefined,
    $container: undefined,
    $bookCover: undefined,
    $bookName: undefined,

    async init(bookId) {
        this.$app = App.$app;
        this.$container = this.$app.find('.reader-container');
        this.$bookCover = this.$app.find('#book-cover-navbar-thumb');
        this.$bookName = this.$app.find('#navbar-book-name');

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

        console.log("Progress tracker checked", progressTracker);

        this.$bookName.text(book.title);
        this.$bookCover.attr('src', book.cover);

        await this.renderChapterOnScreen();

        App.showView('reader');
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
    }

};