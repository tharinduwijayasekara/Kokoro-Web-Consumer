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

    async importFromText(text) {
        const paragraphsRaw = text.split(/\r?\n|\r|\n/);
        const paragraphs = [];

        const progress = {
            i: 0,
            count: paragraphsRaw.length,
        };

        for (const paragraph of paragraphsRaw) {
            progress.i++;
            const percent = Math.ceil((progress.i / progress.count) * 100);
            App.showMessageBoard("Importing...", `Processing your text`, percent);
            if ((progress.i % 100) === 0) await App.sleep(50);

            if (!paragraph.trim()) continue;
            paragraphs.push(...App.splitSentences(paragraph.trim()));
        }

        if (!paragraphs) return;

        const chapters = [paragraphs];

        const title = paragraphs[0].length > 200 ? `${paragraphs[0].substring(0, 200)}...` : paragraphs[0];
        const date = (new Date()).toDateString();
        const time = (new Date()).toLocaleTimeString();

        const importedBook = {
            id: `user-text-${Date.now()}`,
            title: `${title} (${date} ${time})`,
            author: "You",
            cover: null,
            chapters: chapters,
            meta: {},
            importedAt: new Date().toLocaleDateString(),
            importId: Date.now(),
        }

        return importedBook;
    }

};