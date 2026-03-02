const ImportEpub = {

    async handle(file) {
        console.log("Processing EPUB...");

        return new Promise(resolve => {

            const reader = new FileReader();

            reader.onload = async (e) => {
                const book = ePub(e.target.result, {restore: false});

                console.log("Epub loaded", book);

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

                    for (const key of fileKeys) {

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
                                const $el = $(el);

                                $el.find('i, em, span.italic').each((_, italics) => {
                                    const $italics = $(italics);
                                    const italicsText = $italics.text().trim();

                                    if (italicsText.length > 0) {
                                        $italics.replaceWith(`**##${$italics.text()}##**`);
                                        console.log("Found italics");
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

                        if (paragraphs.length > 0) chapters.push(paragraphs);

                        const progressPercent = (chapters.length / fileKeys.length) * 100;
                        App.showMessageBoard("Importing...", `Reading your epub file: ${file.name}`, parseInt(progressPercent));
                        await App.sleep(5);

                    }

                    console.log("Direct Zip Extraction Complete", chapters);

                    const meta = await book.getMetadata();
                    const base64Cover = await this.getBookCover(book);
                    const bookId = file.name;

                    resolve({
                        id: bookId,
                        title: meta.bookTitle || file.name,
                        author: meta.creator || "",
                        cover: base64Cover,
                        chapters: chapters,
                        meta: meta,
                        importedAt: new Date().toLocaleDateString(),
                        importId: Date.now(),
                    });
                } catch (err) {
                    console.error("Direct extraction failed:", err);
                    resolve(null);
                }
            };

            reader.readAsArrayBuffer(file);

        });

    },

    async getBookCover(book) {
        try {
            // 1. Primary Method
            const coverUrl = await book.coverUrl();
            if (coverUrl) return await App.urlToBase64(coverUrl);
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
                const blob = new Blob([buffer], {type: 'image/jpeg'}); // Browser handles specific subtype logic
                const tempUrl = URL.createObjectURL(blob);

                try {
                    return await App.urlToBase64(tempUrl);
                } finally {
                    URL.revokeObjectURL(tempUrl); // Prevent memory leaks
                }
            }
        } catch (e) {
            console.error("Archive search failed", e);
        }

        return null; // No cover found
    },


};