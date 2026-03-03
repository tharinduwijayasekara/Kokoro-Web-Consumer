const ImportEpubJsZip = {

    async handle(file) {
        console.log("Processing EPUB via JSZip v2...");

        return new Promise(resolve => {
            const reader = new FileReader();

            reader.onload = (e) => { // Removed async from here
                let zip;
                try {
                    // v2 syntax: direct instantiation with data
                    zip = new JSZip(e.target.result);
                } catch (error) {
                    console.error("Error loading zip file", error);
                    resolve(null);
                    return;
                }

                // Internal function to handle the rest so we can use await
                (async () => {
                    try {
                        const zipFiles = zip.files;
                        const chapters = [];

                        const fileKeys = Object.keys(zipFiles)
                            .filter(key => key.endsWith('.xhtml') || key.endsWith('.html'))
                            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

                        for (const key of fileKeys) {
                            // v2 syntax: .asText() is synchronous
                            let htmlString = zipFiles[key].asText();
                            const paragraphs = ImportEpub.getParagraphsFromHtml(htmlString);

                            if (paragraphs.length > 0) chapters.push(paragraphs);

                            const progressPercent = (chapters.length / fileKeys.length) * 100;
                            App.showMessageBoard("Importing...", `Reading: ${file.name}`, parseInt(progressPercent));
                            await App.sleep(5);
                        }

                        const base64Cover = await this.getBookCover(zip);

                        resolve({
                            id: file.name,
                            title: file.name.replace(/\.[^/.]+$/, ""),
                            author: "Unknown",
                            cover: base64Cover,
                            chapters: chapters,
                            meta: {},
                            importedAt: new Date().toLocaleDateString(),
                            importId: Date.now(),
                        });
                    } catch (err) {
                        console.error("Extraction failed:", err);
                        resolve(null);
                    }
                })();
            };

            reader.readAsArrayBuffer(file);
        });
    },

    async getBookCover(zip) {
        try {
            const files = zip.files;
            const imageKeys = Object.keys(files).filter(path =>
                /\.(jpg|jpeg|png|webp)$/i.test(path) && !path.includes('__MACOSX')
            );

            if (imageKeys.length > 0) {
                const bestMatch = imageKeys.find(k => k.toLowerCase().includes('cover')) || imageKeys[0];

                // v2.6.1 uses asUint8Array()
                const uint8array = files[bestMatch].asUint8Array();

                // Convert Uint8Array to Base64
                let binary = '';
                const len = uint8array.byteLength;
                for (let i = 0; i < len; i++) {
                    binary += String.fromCharCode(uint8array[i]);
                }
                const base64 = btoa(binary);

                const extension = bestMatch.split('.').pop().toLowerCase();
                const mime = extension === 'jpg' ? 'jpeg' : extension;
                return `data:image/${mime};base64,${base64}`;
            }
        } catch (e) {
            console.error("Cover extraction failed", e);
        }
        return null;
    }
};