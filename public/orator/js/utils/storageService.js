const StorageService = {

    db: undefined,
    storagePersisted: false,
    orator: {},

    async init() {
        const db = new Dexie("OratorDB");

        db.version(1).stores({
            books: "id, title, importedAt",
            data: "key",
            audios: "id, createdAt"
        });

        this.db = db;

        await this.seedDefaults();
        await this.cleanupOldAudios();
    },

    async seedDefaults() {
        const orator = await this.db.data.get('orator');
        if (!orator || !orator.orator) {
            await this.writeOratorJson(DEFAULT_ORATOR_JSON);
            console.log("Default orator json updated");
        }
    },

    async getOratorJson() {
        const orator = await this.db.data.get('orator');
        if (!orator || !orator.orator) {
            return DEFAULT_ORATOR_JSON;
        }

        this.orator = orator.orator;
        return this.orator;
    },

    async writeOratorJson(orator) {
        if (!orator.orator) {
            orator = {orator: orator};
        }

        await this.db.data.put({
            key: "orator",
            ...orator
        });

        console.log("Orator json updated");
        this.orator = await this.getOratorJson();
    },

    async getBooks() {
        return await this.db.books.toArray();
    },

    async cleanupOldAudios() {
        const threshold = new Date();
        threshold.setDate(threshold.getDate() - 2);

        try {
            const deleteCount = await this.db.audios
                .where('createdAt')
                .below(threshold)
                .delete();

            console.log(`Cleanup complete. Deleted ${deleteCount} items.`);
        } catch (e) {
            console.log("Failed to cleanup old audio cache", e);
        }
    },

    async enablePersistence() {
        if (!navigator.storage || !navigator.storage.persist) {
            this.storagePersisted = false;
            return false;
        }

        const alreadyPersisted = await navigator.storage.persisted();
        if (alreadyPersisted) {
            this.storagePersisted = true;
            return true;
        }

        const isPersisted = await navigator.storage.persist();
        if (isPersisted) {
            this.storagePersisted = true;
        }

        console.log(`Storage is ${isPersisted ? "persistent" : "temporary"}`);
        return isPersisted;
    }

};