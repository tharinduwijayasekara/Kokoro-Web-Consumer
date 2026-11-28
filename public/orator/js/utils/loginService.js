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

            // Superuser replacements apply to other users. The server omits the list for the superuser.
            const superuserReplacements = user.speech_settings?.replacements_config_superuser;
            const replacements = Array.isArray(superuserReplacements) ? superuserReplacements : [];
            await StorageService.writeSuperuserReplacements(replacements);
            ReaderService.superuserReplacements = replacements;

            // Pulling the server copy (including on a fresh install) is handled by
            // checkForRemoteSessionUpdate, which runs after a successful auth check.

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

    // Every upload stamps the server copy with lastSentToServerAt, and this device remembers the
    // value it last uploaded or pulled (StorageService.getLastSentToServerAt). If the server's value
    // differs, another device has uploaded since. Values are only compared for equality, so device
    // clocks don't matter. A server copy uploaded before this existed has no value and reads as 'none'.
    getRemoteVersion(remoteOratorJson) {
        return remoteOratorJson?.lastSentToServerAt ?? 'none';
    },

    // Parses "chapterIdx::paragraphIdx::percent". Returns null if it isn't a real position.
    parseProgress(progress) {
        if (typeof progress !== 'string') return null;
        const [chapterIdx, paragraphIdx] = progress.split('::').map(v => parseInt(v));
        if (isNaN(chapterIdx) || isNaN(paragraphIdx)) return null;
        return {chapterIdx, paragraphIdx};
    },

    // Returns whichever reading position is further into the book.
    furtherProgress(localProgress, remoteProgress) {
        const local = this.parseProgress(localProgress);
        const remote = this.parseProgress(remoteProgress);

        if (!local) return remoteProgress ?? localProgress;
        if (!remote) return localProgress;

        if (remote.chapterIdx !== local.chapterIdx) {
            return remote.chapterIdx > local.chapterIdx ? remoteProgress : localProgress;
        }
        return remote.paragraphIdx > local.paragraphIdx ? remoteProgress : localProgress;
    },

    // The server copy wins for everything except reading progress and timers, which are merged
    // book by book (further position, larger timer) so a pull can never move a book backwards.
    mergeRemoteOratorJson(localOratorJson, remoteOratorJson) {
        const merged = {
            ...localOratorJson,
            ...remoteOratorJson,
            login_token: localOratorJson.login_token,
            user: this.user ?? localOratorJson.user,
        };

        const localReading = localOratorJson.reading ?? {};
        const remoteReading = remoteOratorJson.reading ?? {};
        merged.reading = {};
        new Set([...Object.keys(localReading), ...Object.keys(remoteReading)]).forEach(bookId => {
            merged.reading[bookId] = this.furtherProgress(localReading[bookId], remoteReading[bookId]);
        });

        const localTimers = localOratorJson.timers ?? {};
        const remoteTimers = remoteOratorJson.timers ?? {};
        merged.timers = {};
        new Set([...Object.keys(localTimers), ...Object.keys(remoteTimers)]).forEach(bookId => {
            merged.timers[bookId] = Math.max(localTimers[bookId] ?? 0, remoteTimers[bookId] ?? 0);
        });

        // The version marker lives in its own key, never in the local orator json.
        delete merged.lastSentToServerAt;

        return merged;
    },

    // Merges the server copy into the current local copy and records the server version as synced.
    async pullRemoteOratorJson(remoteOratorJson) {
        const merged = this.mergeRemoteOratorJson(await StorageService.getOratorJson(), remoteOratorJson);
        await StorageService.writeOratorJson(merged, {skipSync: true});
        await StorageService.writeLastSentToServerAt(this.getRemoteVersion(remoteOratorJson));
        return merged;
    },

    // Books in the reading list that aren't stored on this device (skips news and the placeholder).
    async hasMissingBooks(oratorJson) {
        const bookIds = Object.keys(oratorJson.reading ?? {})
            .filter(bookId => bookId !== 'bookId' && !bookId.startsWith('news/'));

        for (const bookId of bookIds) {
            if (!(await StorageService.db.books.get(bookId))) return true;
        }
        return false;
    },

    // Runs once at startup. Pulls the server copy when this device has never synced, or when another
    // device has uploaded since this one last synced. force = true (Force Sync button) always pulls
    // and re-imports the library.
    async checkForRemoteSessionUpdate(force = false) {
        try {
            const orator = await StorageService.getOratorJson();
            const token = orator?.login_token;
            if (!token) return;

            const remoteOratorJson = await this.fetchUserOratorJson({silent: true});
            if (!remoteOratorJson) return;

            const localVersion = await StorageService.getLastSentToServerAt();
            const remoteVersion = this.getRemoteVersion(remoteOratorJson);

            if (!force && localVersion !== null && localVersion === remoteVersion) {
                console.log("Server orator json unchanged since last sync");
                return;
            }

            console.log(force
                ? "Force sync requested, syncing session"
                : localVersion === null
                    ? "Never synced on this device, pulling server orator json"
                    : "Another device uploaded since last sync, pulling server orator json");

            App.showMessageBoard("Orator", "Syncing your session...", 70);

            const merged = await this.pullRemoteOratorJson(remoteOratorJson);

            // importRemoteBooks downloads the whole library and reloads, so only do it when needed.
            if (force || await this.hasMissingBooks(merged)) {
                await this.importRemoteBooks();
                return;
            }

            // The library and settings were already rendered from the old copy. The stored
            // version now matches the server, so this reload doesn't pull again.
            window.location.reload();

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
        const batchSize = 50;

        let start = 0;
        let totalBooks = null;
        let isFailure = false;
        let bytesLoaded = 0;
        let lastPercent = 1;
        let totalBytes = null;

        // Redraws the byte count every second, including while a page is still downloading.
        // With the API's total size, the bar follows bytes; otherwise it keeps the page-based percent.
        const showBytes = () => {
            const loadedMb = (bytesLoaded / 1024 / 1024).toFixed(1);

            if (!totalBytes) {
                App.showMessageBoard("Orator", `${loadedMb} MB loaded`, lastPercent);
                return;
            }

            const percent = Math.max(1, Math.min(99, Math.round((bytesLoaded / totalBytes) * 100)));
            const totalMb = (totalBytes / 1024 / 1024).toFixed(1);
            App.showMessageBoard("Orator", `${loadedMb} / ${totalMb} MB loaded`, percent);
        };
        const ticker = setInterval(showBytes, 1000);

        // Reads the body in chunks so bytesLoaded grows during the download.
        const readBody = async (res) => {
            if (!res.body) {
                const buf = await res.arrayBuffer();
                bytesLoaded += buf.byteLength;
                return buf;
            }

            const reader = res.body.getReader();
            const chunks = [];
            let size = 0;

            while (true) {
                const {done, value} = await reader.read();
                if (done) break;

                chunks.push(value);
                size += value.length;
                bytesLoaded += value.length;
            }

            const out = new Uint8Array(size);
            let offset = 0;
            for (const chunk of chunks) {
                out.set(chunk, offset);
                offset += chunk.length;
            }

            return out;
        };

        try {
            while (true) {
                // The first request asks for one book: its total_books and total_bytes come back
                // quickly, so the progress bar has a total before the bulk pages arrive.
                const pageLength = start === 0 ? 1 : batchSize;

                const res = await fetch(
                    `https://api.orator-audio.com/api/books?start=${start}&length=${pageLength}`,
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

                const buffer = await readBody(res);
                const data = JSON.parse(new TextDecoder().decode(buffer));

                if (!data.books) {
                    console.error("No books found in remote response");
                    isFailure = true;
                    break;
                }

                if (totalBooks === null) {
                    totalBooks = data.total_books ?? 0;
                    totalBytes = typeof data.total_bytes === 'number' ? data.total_bytes : null;
                }

                const booksReceived = data.books.length;

                start += booksReceived;
                remoteBooks.push(...data.books);

                console.log(`Imported ${start}/${totalBooks}`);

                const percent = totalBooks
                    ? Math.round((start / totalBooks) * 100)
                    : null;

                lastPercent = Math.max(1, percent ?? lastPercent);
                showBytes();

                if (totalBooks && start >= totalBooks) {
                    break;
                }

                if (booksReceived < pageLength) {
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
            clearInterval(ticker);
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

        // Logged-out users don't get the superuser replacements
        await StorageService.writeSuperuserReplacements([]);
        // The next login (possibly another account) starts as "never synced" and pulls.
        await StorageService.writeLastSentToServerAt(null);
        await StorageService.writeOratorJson(orator, {skipSync: true});

        location.reload();
    },

    // force = true skips the rate limit (used when playback stops). An in-progress sync still wins.
    async updateUserOratorJson(oratorJson, {syncBooks = false, force = false} = {}) {

        const now = Date.now();

        if (this.oratorSyncInProgress) {
            console.log("Orator sync skipped (already in progress)");
            return;
        }

        if ((now - this.lastOratorSyncAt < this.SYNC_INTERVAL) && !syncBooks && !force) {
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

            // Pre-upload check: if another device uploaded since this one last synced, merge the
            // server copy in first so this upload doesn't overwrite it with stale data. No reload
            // here; the merged data shows from the next app start.
            const remoteOratorJson = await this.fetchUserOratorJson({silent: true});
            if (remoteOratorJson) {
                const localVersion = await StorageService.getLastSentToServerAt();
                if (localVersion !== this.getRemoteVersion(remoteOratorJson)) {
                    console.log("Server orator json changed since last sync, merging before upload");
                    oratorJson = await this.pullRemoteOratorJson(remoteOratorJson);
                }
            }

            const version = Date.now();

            const fetchTasks = [
                fetch('https://api.orator-audio.com/api/orator', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        orator_json: {...oratorJson, lastSentToServerAt: version},
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

            // Only recorded once the server has confirmed the save.
            await StorageService.writeLastSentToServerAt(version);

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
            return null;

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