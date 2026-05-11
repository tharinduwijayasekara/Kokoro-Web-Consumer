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

                const remoteOratorJson = await this.fetchUserOratorJson();
                if (
                    remoteOratorJson
                    && remoteOratorJson.reading
                    && (Object.keys(remoteOratorJson.reading).length !== Object.keys(orator.reading).length)
                ) {
                    console.log("Only one key in local orator reading list, going to use remote");

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

    async updateUserOratorJson(oratorJson) {

        const now = Date.now();

        if (this.oratorSyncInProgress) {
            console.log("Orator sync skipped (already in progress)");
            return;
        }

        if (now - this.lastOratorSyncAt < this.SYNC_INTERVAL) {
            console.log("Orator sync skipped (rate limited)");
            return;
        }

        const token = (await StorageService.getOratorJson())?.login_token
        if (!token) {
            console.log("No token, skipping sync");
            return;
        }

        this.oratorSyncInProgress = true;

        try {

            const response = await fetch('https://api.orator-audio.com/api/orator', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    orator_json: oratorJson
                })
            });

            if (!response.ok) {
                console.log("Failed to sync orator json");
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

        const token = (await StorageService.getOratorJson())?.login_token
        if (!token) {
            console.log("No token, cannot fetch user orator json");
            return;
        }

        App.showMessageBoard("Orator", "Syncing your settings...", 70)

        try {

            const response = await fetch('https://api.orator-audio.com/api/orator', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                console.log("Failed to fetch user orator json");
                return;
            }

            const data = await response.json();
            console.log("Remote orator json", data);

            if (!data.orator_json) {
                console.log("No remote orator json found");
                return;
            }

            console.log("Fetched remote orator json");

            return data.orator_json;

        } catch (e) {
            console.log("Error fetching user orator json", e);
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