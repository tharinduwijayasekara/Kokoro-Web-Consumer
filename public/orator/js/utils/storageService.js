const StorageService = {

    db: undefined,
    orator: {},

    async init() {
        const db = new Dexie("OratorDB");

        db.version(1).stores({
            books: "id, title, importedAt",
            data: "key"
        });

        this.db = db;

        await this.seedDefaults();
    },

    async seedDefaults() {
        const orator = await this.getOratorJson();

        if (!orator) {
            await this.writeOratorJson(DEFAULT_ORATOR_JSON);
            console.log("Default orator json updated");
        }
    },

    async getOratorJson() {
        const orator = await this.db.data.get('orator');
        if (!orator || !orator.orator) return {};

        this.orator = orator.orator;
        return this.orator;
    },

    async writeOratorJson(orator) {
        await this.db.data.add({
            key: "orator",
            ...orator
        });

        console.log("Orator json updated");
        this.orator = await this.getOratorJson();
    },

    async getBooks() {
        return await this.db.books.toArray();
    }

};