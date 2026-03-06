const ImportEpub = {

    async isValidEpub(file) {
        console.log("Checking if is valid epub", file);
        const e = await App.loadFileAsync(file);

        let zip;
        try {
            zip = new JSZip(e.target.result);
        } catch (error) {
            console.log("Error while opening epub zip", error);
            return false;
        }

        try {
            const hasManifest = Object.keys(zip.files).some(name => name.endsWith('.opf'));
            if (!hasManifest) {
                return false;
            }
        } catch (error) {
            console.log("Error while checking for manifest file", error);
            return false;
        }

        console.log("Epub has manifest!");
        return true;
    },

    async handle(file) {
        console.log("Processing EPUB...");

        const e = await App.loadFileAsync(file);
        const book = ePub(e.target.result);

        console.log("Epub loaded", book);

        let isFromSpine = true;

        try {

            const openBook = Promise.race([
                book.opened,
                new Promise((r, reject) => setTimeout(() => reject(new Error("Book took too long to open")), 2000))
            ]);

            await openBook;
            console.log("Book opened, about to import");

            const zipFiles = book.archive.zip.files;
            const chapters = [];

            let fileKeys = [];

            try {

                fileKeys = book.spine.spineItems.map(i => i.canonical.replace(/^\//, ""));

            } catch (error) {
                console.log("Error checking the chapter order from spine", error);

                isFromSpine = false;

                fileKeys = Object.keys(zipFiles)
                    .filter(key => key.endsWith('.xhtml') || key.endsWith('.html'))
                    .sort((a, b) => {
                        return a.localeCompare(b, undefined, {
                            numeric: true,
                            sensitivity: 'base'
                        });
                    });
            }

            for (const key of fileKeys) {
                let zipfile = zipFiles[key];
                if (!zipfile) continue;

                const htmlString = await zipfile.async("string");
                const paragraphs = this.getParagraphsFromHtml(htmlString);

                if (paragraphs.length > 0) chapters.push(paragraphs);

                const progressPercent = (chapters.length / fileKeys.length) * 100;
                App.showMessageBoard("Importing...", `Reading your epub file: ${file.name}`, parseInt(progressPercent));
                await App.sleep(5);
            }

            console.log("Direct Zip Extraction Complete", chapters);

            const meta = await book.loaded.metadata;

            const base64Cover = {
                original: await this.getBookCover(book),
                resized: null,
            };

            if (base64Cover.original) base64Cover.resized = await this.resizeBase64(base64Cover.original);

            const bookId = file.name;

            if (!isFromSpine) chapters.unshift(SPINAL_WARNING);

            let author = (meta.creator || "")
                .split(',')
                .reverse()
                .map(s => s.trim())
                .join(' ')
                .split('.')
                .map(s => s.trim())
                .join(' ');

            return {
                id: bookId,
                title: meta.title || file.name,
                author: author,
                cover: base64Cover.resized,
                chapters: chapters,
                meta: meta,
                importedAt: new Date().toLocaleDateString(),
                importId: Date.now(),
            };
        } catch (err) {
            console.error("Direct extraction failed:", err);
            App.showMessageBoard("Import failed", `${file.name} could not be imported. There's something wrong with the epub file.`);
            return null;
        }
    },

    getParagraphsFromHtml(htmlString) {
        htmlString = htmlString
            .replaceAll('\r\n', '')
            .replace(/\s+/g, ' ')
            .trim();

        const bodyMatch = htmlString.match(/<body[^>]*>([\s\S.]*)<\/body>/i);
        const contentToParse = bodyMatch ? bodyMatch[1] : htmlString;

        const $doc = $($.parseHTML(`<div>${contentToParse}</div>`));
        const paragraphs = [];

        $doc.find('*').each((i, el) => {
            if (['P', 'H1', 'H2', 'H3'].includes(el.tagName.toUpperCase())) {
                const $el = $(el);

                $el.find('i, em, span.italic').each((_, italics) => {
                    const $italics = $(italics);
                    const italicsText = $italics.text().trim();

                    if (italicsText.length > 0) {
                        $italics.replaceWith(`**##${$italics.text()}##**`);
                    }
                })

                const txt = $(el).text().trim();
                if (txt.length > 0) {
                    const paragraphTextRaw = txt.replace(/\s+/g, ' ');
                    //paragraphs.push(paragraphTextRaw);

                    const paragraphStrings = App.splitSentences(paragraphTextRaw);
                    for (const sentence of paragraphStrings) {
                        paragraphs.push(sentence);
                    }
                }
            }
        });

        return paragraphs;
    },

    async getBookCover(book) {
        try {
            // v0.3: coverUrl() is replaced by coverUrl property or book.coverPath()
            const coverUrl = await book.coverUrl();
            if (coverUrl) return await App.urlToBase64(coverUrl);
        } catch (e) {
            console.warn("Standard cover fetch failed, searching archive...");
        }

        try {
            // v0.3: book.zip -> book.archive
            const files = book.archive.zip.files;
            const imageKeys = Object.keys(files).filter(path =>
                /\.(jpg|jpeg|png|webp)$/i.test(path) && !path.includes('__MACOSX')
            );

            if (imageKeys.length > 0) {
                const bestMatch = imageKeys.find(k => k.toLowerCase().includes('cover')) || imageKeys[0];
                const fileObject = files[bestMatch];

                // JSZip v3 (used in v0.3) uses .async('blob')
                const blob = await fileObject.async("blob");
                const tempUrl = URL.createObjectURL(blob);

                try {
                    return await App.urlToBase64(tempUrl);
                } finally {
                    URL.revokeObjectURL(tempUrl);
                }
            }
        } catch (e) {
            console.error("Archive search failed", e);
        }

        return null;
    },

    async resizeBase64(base64, maxSize = 300) {
        const img = new Image();
        img.src = base64;
        await img.decode(); // Wait for image to load

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Calculate new dimensions
        const ratio = Math.min(maxSize / img.width, maxSize / img.height);
        const width = img.width * ratio;
        const height = img.height * ratio;

        canvas.width = width;
        canvas.height = height;

        // Draw and export
        ctx.drawImage(img, 0, 0, width, height);
        return canvas.toDataURL('image/jpeg', 0.8); // 0.8 is quality
    }
};