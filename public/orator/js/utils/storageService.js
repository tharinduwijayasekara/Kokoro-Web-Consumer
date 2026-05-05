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
            await this.writeOratorJson(DEFAULT_ORATOR_JSON, {skipSync: true});
            console.log("Default orator json updated");
        }
    },

    async getOratorJson() {
        const orator = await this.db.data.get('orator');
        if (!orator || !orator.orator) {
            this.orator = DEFAULT_ORATOR_JSON;
            return this.orator;
        }

        this.orator = orator.orator;
        return this.orator;
    },

    async writeOratorJson(orator, { skipSync = false } = {}) {
        if (!orator.orator) {
            orator = {orator: orator};
        }

        await this.db.data.put({
            key: "orator",
            ...orator
        });

        console.log("Orator json updated");
        this.orator = await this.getOratorJson();

        if (!skipSync && typeof LoginService !== 'undefined') {
            LoginService.updateUserOratorJson(this.orator);
        }
    },

    async getBooks() {
        return await this.db.books.toArray();
    },

    async cleanupOldAudios() {
        const threshold = new Date();
        threshold.setDate(threshold.getDate() - 5);

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
    },

    async hasEnoughStorage(requiredBytes = 10 * 1024 * 1024 * 1024) {
        if (!navigator.storage?.estimate) return null;
        const {usage, quota} = await navigator.storage.estimate();
        const hasEnoughStorage = (quota - usage) >= requiredBytes;
        return true;
    },

    async availableStorageGB() {
        if (!navigator.storage?.estimate) return "Cannot measure storage";
        const {usage, quota} = await navigator.storage.estimate();
        const toGB = bytes => (bytes / (1024 ** 3)).toFixed(2);
        return `${toGB(usage)} of ${toGB(quota)} GB used`;
    },
};