const LoginService = {

    user: null,

    oratorSyncInProgress: false,
    lastOratorSyncAt: 0,
    SYNC_INTERVAL: 5 * 60 * 1000, // 5 minutes

    async checkAuth() {
        const orator = await StorageService.getOratorJson();
        const token = orator?.login_token;

        if (!token) {
            console.log("No login token found");
            return false;
        }

        try {
            const response = await fetch('https://api.orator-audio.com/api/user', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                console.log("Token invalid");
                return false;
            }

            const user = await response.json();
            console.log("Authenticated user", user);

            this.user = user;

            if (Object.keys(orator.reading).length === 1) {
                console.log("Only one book (default placeholder) is available in the local orator reading list, need to check remote");

                const [remoteOratorJson, remoteBooks] = await this.fetchUserOratorJson();
                if (
                    remoteOratorJson
                    && remoteOratorJson.reading
                    && (Object.keys(remoteOratorJson.reading).length !== Object.keys(orator.reading).length)
                ) {
                    console.log("Remote orator reading list is not the same, merging them");

                    const merged = {
                        ...orator,
                        ...remoteOratorJson,
                        login_token: token,
                        user: user,
                    };

                    console.log("Merging remote orator json");

                    await StorageService.writeOratorJson(merged, {skipSync: true});
                }
            }

            return true;

        } catch (e) {
            console.log("Auth check failed", e);
            return false;
        }
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
            alert(e.message);
        }

        App.hideMessageBoard();
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
            alert(e.message);
        }

        App.hideMessageBoard();
    },

    async handleAuthSuccess(data) {
        const orator = await StorageService.getOratorJson();

        orator.login_token = data.token;
        orator.user = data.user;

        await StorageService.writeOratorJson(orator, {skipSync: true});

        console.log("Auth success, reloading app");

        location.reload(); // cleanest reset (matches your versioning style)
    },

    async updateUserOratorJson(oratorJson, {syncBooks = false} = {}) {

        const now = Date.now();

        if (this.oratorSyncInProgress) {
            console.log("Orator sync skipped (already in progress)");
            return;
        }

        if (now - this.lastOratorSyncAt < this.SYNC_INTERVAL) {
            console.log("Orator sync skipped (rate limited)");
            return;
        }

        const token = (await StorageService.getOratorJson())?.login_token;

        if (!token) {
            console.log("No token, skipping sync");
            return;
        }

        this.oratorSyncInProgress = true;

        const formData = new FormData();
        formData.append('orator_json', JSON.stringify(oratorJson));

        if (syncBooks) {

            /*
            Solution for this:
            -- Stringify the whole json.
            -- Split into chunks less than 10MB each
            -- Generate a unique id for each upload
            -- Upload each chunk separately
            -- Create an upload entry in the database with this id + user email
            -- Keep appending chunks as we upload
            -- Denote the final chunk as last chunk
            -- Once upload has finished, destructure the json back to books and orator json on server and save
            -- Delete the upload entry from the database to save space
             */

            const books = await StorageService.getBooks();
            const sanitizedBooks = books.map(book => {
                const {cover, ...bookWithoutCover} = book;
                return bookWithoutCover;
            });

            // Convert books array into a JSON file
            const booksBlob = new Blob(
                [JSON.stringify(sanitizedBooks)],
                {type: 'application/json'}
            );

            formData.append('books_file', booksBlob, 'books.json');
        }

        try {

            const response = await fetch('https://api.orator-audio.com/api/orator', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

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

    async fetchUserOratorJson() {
        const token = (await StorageService.getOratorJson())?.login_token;

        if (!token) {
            console.log("No token, cannot fetch user orator json");
            return [null, null];
        }

        App.showMessageBoard("Orator", "Syncing your settings...", 70);

        try {
            const res = await fetch('https://api.orator-audio.com/api/orator', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!res.ok) {
                console.log("Failed to fetch user orator json");
                return [null, null];
            }

            const data = await res.json();
            console.log("Remote orator json", data);

            if (!data?.orator_json) {
                console.log("No remote orator json found");
                return [null, null];
            }

            return [data.orator_json, data.books ?? null];

        } catch (e) {
            console.log("Error fetching user orator json", e);
            return [null, null];

        } finally {
            App.hideMessageBoard();
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