const LoginService = {

    user: null,

    oratorSyncInProgress: false,
    lastOratorSyncAt: 0,
    SYNC_INTERVAL: 5 * 60 * 1000, // 5 minutes
    BOOK_UPLOAD_CHUNK_SIZE: 2 * 1000 * 1000, // Characters per upload request 1 mil approx 1 mb

    async checkAuth() {
        const orator = await StorageService.getOratorJson();
        const token = orator?.login_token;

        if (!token) {
            console.log("No login token found");

            return {
                isAuthenticated: false,
                isOffline: false,
                user: null,
            };
        }

        try {
            const healthResponse = await fetch(
                'https://api.orator-audio.com/api/healthcheck',
                {
                    method: 'GET',
                }
            );

            if (!healthResponse.ok) {
                throw new Error(`Health check failed with ${healthResponse.status}`);
            }
        } catch (e) {
            console.log("Remote service unavailable, entering offline mode", e);

            return {
                isAuthenticated: false,
                isOffline: true,
                user: null,
            };
        }

        console.log("Remote service available, checking token validity");

        try {
            const response = await fetch(
                'https://api.orator-audio.com/api/user',
                {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            if (!response.ok) {
                console.log("Token invalid");

                return {
                    isAuthenticated: false,
                    isOffline: false,
                    user: null,
                };
            }

            const user = await response.json();

            console.log("Authenticated user", user);

            this.user = user;

            if (Object.keys(orator.reading).length === 1) {

                console.log("Only one book (default placeholder) is available in the local orator reading list, need to check remote");

                const remoteOratorJson = await this.fetchUserOratorJson();

                if (
                    remoteOratorJson
                    && remoteOratorJson.reading
                    && (Object.keys(remoteOratorJson.reading).length !== Object.keys(orator.reading).length)
                ) {
                    console.log("Remote orator reading list is not the same, merging them");

                    const merged = {...orator, ...remoteOratorJson, login_token: token, user: user,};

                    console.log("Merging remote orator json");

                    await StorageService.writeOratorJson(merged, {skipSync: true});

                    await this.importRemoteBooks();
                }
            }

            return {
                isAuthenticated: true,
                isOffline: false,
                user,
            };

        } catch (e) {
            console.log("Auth check failed", e);

            return {
                isAuthenticated: false,
                isOffline: false,
                user: null,
            };
        }
    },

    async checkForRemoteSessionUpdate() {
        try {
            const orator = await StorageService.getOratorJson();
            const token = orator?.login_token;
            if (!token) return;

            const remoteOratorJson = await this.fetchUserOratorJson({silent: true});
            if (!remoteOratorJson || !remoteOratorJson.reading) return;

            const localReading = orator.reading ?? {};
            const remoteReading = remoteOratorJson.reading;

            const allBookIds = new Set([
                ...Object.keys(localReading),
                ...Object.keys(remoteReading),
            ]);

            const hasFurtherRemoteProgress = [...allBookIds].some(bookId => {
                const localProgress = localReading[bookId];
                const remoteProgress = remoteReading[bookId];

                if (!localProgress && remoteProgress) return true;
                if (!localProgress || !remoteProgress) return false;

                const [localChapterIdx, localParagraphIdx] = localProgress.split('::').map(v => parseInt(v));
                const [remoteChapterIdx, remoteParagraphIdx] = remoteProgress.split('::').map(v => parseInt(v));
                if (isNaN(localChapterIdx) || isNaN(remoteChapterIdx)) return false;

                if (remoteChapterIdx > localChapterIdx) return true;
                return remoteChapterIdx === localChapterIdx && remoteParagraphIdx > localParagraphIdx;
            });

            if (!hasFurtherRemoteProgress) return;

            console.log("Remote orator json has further reading progress, syncing session");

            App.showMessageBoard("Orator", "Syncing your session...", 70);

            const merged = {...orator, ...remoteOratorJson, login_token: token, user: this.user};

            await StorageService.writeOratorJson(merged, {skipSync: true});

            await this.importRemoteBooks();

        } catch (e) {
            console.log("Background session sync check failed", e);
        } finally {
            App.hideMessageBoard();
        }
    },

    async importRemoteBooks() {
        console.log("Importing remote books");

        const token = (await StorageService.getOratorJson())?.login_token;
        if (!token) {
            console.error("No valid token found for remote book import");
            return;
        }

        App.showMessageBoard("Orator", "Importing your library...", 1);

        const remoteBooks = [];
        const batchSize = 10;

        let start = 0;
        let totalBooks = null;
        let isFailure = false;

        try {
            while (true) {
                const res = await fetch(
                    `https://api.orator-audio.com/api/books?start=${start}&length=${batchSize}`,
                    {
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    }
                );

                if (!res.ok) {
                    console.error("Failed to fetch remote books", res.status);
                    isFailure = true;
                    break;
                }

                const data = await res.json();

                if (!data.books) {
                    console.error("No books found in remote response");
                    isFailure = true;
                    break;
                }

                if (totalBooks === null) {
                    totalBooks = data.total_books ?? 0;
                }

                const booksReceived = data.books.length;

                start += booksReceived;
                remoteBooks.push(...data.books);

                console.log(`Imported ${start}/${totalBooks}`);

                const percent = totalBooks
                    ? Math.round((start / totalBooks) * 100)
                    : null;

                App.showMessageBoard("Orator", "Importing your library...", percent);

                if (totalBooks && start >= totalBooks) {
                    break;
                }

                if (booksReceived < batchSize) {
                    break;
                }
            }

            if (isFailure) {
                console.error("Import failed midway");
                App.showMessageBoard('Orator', 'Import failed.', 100, 2000);
                return;
            }

            console.log("Import complete");

        } catch (err) {
            console.error("Unexpected error during import", err);
            App.showMessageBoard('Orator', 'Import failed.', 100, 2000);
        } finally {
            App.hideMessageBoard();
        }

        if (!remoteBooks) {
            console.log("No remote books to import");
            App.hideMessageBoard();
            return;
        }

        for (let book of remoteBooks) {
            if (!book) continue;

            try {
                book = JSON.parse(book);

                if (!book.id) continue;

                await StorageService.db.books.put(book);
            } catch (e) {
                console.error("Error importing book", book, e);
            }
        }

        App.showMessageBoard("Orator", "Library sync complete", 100, 2000);
        window.location.reload();
    },

    async login(email, password) {
        App.showMessageBoard("Orator", "Logging in, please wait...", 75);

        try {
            const response = await fetch('https://api.orator-audio.com/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({email, password})
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data?.error?.message || "Login failed");
            }

            await this.handleAuthSuccess(data);

        } catch (e) {
            App.showMessageBoard("Orator", e.message, 100, 5000);
        }
    },

    async register(name, email, password) {
        App.showMessageBoard("Orator", "Registering, please wait...", 50);

        try {
            const response = await fetch('https://api.orator-audio.com/api/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({name, email, password})
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data?.error?.message || "Registration failed");
            }

            await this.handleAuthSuccess(data);

        } catch (e) {
            App.showMessageBoard("Orator", e.message, 100, 5000);
        }
    },

    async handleAuthSuccess(data) {
        const orator = await StorageService.getOratorJson();

        orator.login_token = data.token;
        orator.user = data.user;

        await StorageService.writeOratorJson(orator, {skipSync: true});

        console.log("Auth success, reloading app");

        location.reload(); // cleanest reset (matches your versioning style)
    },

    async logout() {
        App.showMessageBoard("Orator", "Logging out...", 100);

        const orator = await StorageService.getOratorJson();

        delete orator.login_token;
        delete orator.user;

        await StorageService.writeOratorJson(orator, {skipSync: true});

        location.reload();
    },

    async updateUserOratorJson(oratorJson, {syncBooks = false} = {}) {

        const now = Date.now();

        if (this.oratorSyncInProgress) {
            console.log("Orator sync skipped (already in progress)");
            return;
        }

        if ((now - this.lastOratorSyncAt < this.SYNC_INTERVAL) && !syncBooks) {
            console.log("Orator sync skipped (rate limited)");
            return;
        }

        const token = (await StorageService.getOratorJson())?.login_token;

        if (!token) {
            console.log("No token, skipping sync");
            return;
        }

        console.log("Syncing orator json");

        this.oratorSyncInProgress = true;

        try {

            const fetchTasks = [
                fetch('https://api.orator-audio.com/api/orator', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        orator_json: oratorJson,
                    })
                })
            ];

            if (syncBooks) {
                fetchTasks.push(this.syncBooks(token, syncBooks));
            }

            const fetchTasksResponses = await Promise.all(fetchTasks);
            const response = fetchTasksResponses[0];

            if (!response.ok) {
                console.log("Failed to sync orator json", response.status);
                return;
            }

            this.lastOratorSyncAt = now;

            console.log("Orator json synced");

        } catch (e) {
            console.log("Error syncing orator json", e);
        } finally {
            this.oratorSyncInProgress = false;
        }
    },

    async syncBooks(token, syncbooks) {

        console.log("Syncing books");

        App.showMessageBoard("Orator", "Syncing your books...", 0);

        try {

            if (!syncbooks) {
                console.log("No books to sync");
                App.hideMessageBoard();
                return;
            }

            const results = [];
            const concurrency = 10;
            const batchesCount = Math.ceil(syncbooks.length / concurrency);
            let currentBatch = 0;

            for (let i = 0; i < syncbooks.length; i += concurrency) {
                currentBatch++;
                const syncBooksBatch = syncbooks.slice(i, i + concurrency);
                const bookTitles = syncBooksBatch.map(book => book.title).join('</br>');
                const batchProgress = `Syncing library: ${currentBatch} of ${batchesCount}`;

                const bookStrings = JSON.stringify(syncBooksBatch);

                const uuid = Date.now();
                const parts = bookStrings.match(new RegExp(`.{1,${this.BOOK_UPLOAD_CHUNK_SIZE}}`, 'g'));

                let hasFailure = false;
                let progress = 0;

                for (let i = 0; i < parts.length; i += concurrency) {
                    if (hasFailure) break;

                    const batch = parts.slice(i, i + concurrency);

                    const batchPromises = batch.map(async (part, batchIndex) => {
                        const index = i + batchIndex;

                        const response = await fetch('https://api.orator-audio.com/api/books', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                            },
                            body: JSON.stringify({
                                uuid: uuid,
                                books_string_part: part,
                                uploaded: index,
                                total: parts.length
                            })
                        });

                        if (!response.ok) {
                            console.log("Failed to sync book part", [index, response.status]);
                            hasFailure = true;
                            throw new Error(`Failed to sync book part ${index}`);
                        }

                        const data = await response.json();
                        console.log(`Book part synced successfully ${index}`, data);

                        progress++;

                        const percent = Math.round((progress / parts.length) * 100);
                        App.showMessageBoard("Orator", `${batchProgress}</br>Titles:</br><div style="font-size: 0.7em;">${bookTitles}</div></br>${percent}%`, percent);
                        return data;
                    });

                    const batchResults = await Promise.all(batchPromises);
                    results.push(...batchResults);
                }
            }

            const allBooks = results.flat();
            console.log("All books synced", allBooks);

        } catch (e) {
            console.log("Error syncing books", e);
        } finally {
            App.hideMessageBoard();
        }

    },

    async fetchUserOratorJson({silent = false} = {}) {
        const token = (await StorageService.getOratorJson())?.login_token;

        if (!token) {
            console.log("No token, cannot fetch user orator json");
            return null;
        }

        if (!silent) App.showMessageBoard("Orator", "Syncing your settings...", 70);

        try {
            const res = await fetch('https://api.orator-audio.com/api/orator', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!res.ok) {
                console.log("Failed to fetch user orator json");
                return null;
            }

            const data = await res.json();
            console.log("Remote orator json", data);

            if (!data?.orator_json) {
                console.log("No remote orator json found");
                return null;
            }

            return data.orator_json;

        } catch (e) {
            console.log("Error fetching user orator json", e);
            return [null, null];

        } finally {
            if (!silent) App.hideMessageBoard();
        }
    },

    setEventHandlers() {

        $('#form-login').on('submit', async (e) => {
            e.preventDefault();

            const email = $('#login-email').val().trim();
            const password = $('#login-password').val().trim();

            await this.login(email, password);
        });

        $('#form-register').on('submit', async (e) => {
            e.preventDefault();

            const name = $('#register-name').val().trim();
            const email = $('#register-email').val().trim();
            const password = $('#register-password').val().trim();

            await this.register(name, email, password);
        });
    }
};