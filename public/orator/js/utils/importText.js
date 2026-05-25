const ImportText = {

    async handle(file) {
        console.log("Processing Text...");
        App.showMessageBoard("Importing...", `Reading your text file: ${file.name}`, -1);
        await App.sleep(500);

        try {

            const e = await App.loadFileAsync(file);
            const decoder = new TextDecoder();
            const book = decoder.decode(e.target.result)
            return this.importFromText(book);

        } catch (err) {
            console.error("Text extraction failed:", err);
            App.showMessageBoard("Import failed", `${file.name} could not be imported. There's something wrong with the text file.`);
            return null;
        }
    },

    async importFromText(text, silent = false) {
        const paragraphsRaw = text.split(/\r?\n|\r|\n/);
        let paragraphs = [];

        const progress = {
            i: 0,
            count: paragraphsRaw.length,
        };

        const chapters = [];

        let consecutiveEmptyLines = 0;

        for (const paragraph of paragraphsRaw) {
            if (!silent) {
                progress.i++;
                const percent = Math.ceil((progress.i / progress.count) * 100);
                App.showMessageBoard("Importing...", `Processing your text`, percent);
                if ((progress.i % 100) === 0) await App.sleep(50);
            }

            const isEmptyParagraph = !paragraph.trim();
            if (isEmptyParagraph) {
                consecutiveEmptyLines++;

                if (consecutiveEmptyLines > 2 && paragraphs.length > 0) {
                    chapters.push(paragraphs);
                    paragraphs = [];
                }

                continue;

            }

            consecutiveEmptyLines = 0;
            paragraphs.push(...App.splitSentences(paragraph.trim()));
        }

        if (paragraphs.length > 0) {
            paragraphs = App.handleParagraphs(paragraphs);
            chapters.push(paragraphs);
        }

        const title = paragraphs[0].length > 200 ? `${paragraphs[0].substring(0, 200)}...` : paragraphs[0];
        const date = (new Date()).toDateString();
        const time = (new Date()).toLocaleTimeString();

        const importedBook = {
            id: `user-text-${Date.now()}`,
            title: `${title} (${date} ${time})`,
            author: TEXT_INPUT_AUTHOR,
            cover: null,
            chapters: chapters,
            meta: {},
            importedAt: new Date().toLocaleDateString(),
            importId: Date.now(),
        }

        return importedBook;
    }

};