const ReaderService = {

    book: undefined,
    progressTracker: [0, 0, 0],

    currentChapterOnScreen: undefined,

    $app: undefined,
    $container: undefined,
    $bookName: undefined,
    $chaptersListHeader: undefined,
    $chaptersList: undefined,

    async init(bookId) {
        this.$app = App.$app;
        this.$container = this.$app.find('.reader-container');
        this.$bookName = this.$app.find('#navbar-book-name');
        this.$chaptersListHeader = this.$app.find('.playback-chapter-header');
        this.$chaptersList = this.$app.find('.playback-chapters-list');

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

        await this.renderChaptersList();
        await this.renderChapterOnScreen();

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
    }

};