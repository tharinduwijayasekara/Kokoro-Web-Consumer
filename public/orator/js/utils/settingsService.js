const SettingsService = {

    async init() {

        const orator = await StorageService.getOratorJson();
        const config = orator.config;

        this.$settings = $("#playback-settings");

        this.$speechService = $('#speech-service-input');
        this.speechVoice = $('#speech-voice-input');
        this.$speechSpeed = $('#speech-speed-input');
        this.$speechReplacements = $('.speech-cust-items');

        this.config = config;
        this.saving = false;

        if (!this.configMonitor) {
            this.configMonitor = setInterval(() => this.monitorConfig(), 2000);
        }

        this.loadSettings(config);
    },

    loadSettings(config) {
        this.$speechService.val(config.ttsUrl);
        this.speechVoice.val(config.voice);
        this.$speechSpeed.val(config.speed);

        if (config.replacements) {

            this.$speechReplacements.empty();

            config.replacements.forEach((rep, id) => {
                const itemHtml = `
                    <div class="speech-cust-item">
                        <div class="form-floating">
                          <input type="text" class="form-control speech-replacement-input-left" id="speech-replacement-left-${id}" placeholder="replace this" value="${rep[0]}">
                          <label for="speech-replacement-left-${id}">Replace</label>
                        </div>
                        <div class="form-floating">
                          <input type="text" class="form-control speech-replacement-input-right" id="speech-replacement-right-${id}" placeholder="with this" value="${rep[1]}">
                          <label for="speech-replacement-right-${id}">Correct Pronounciation</label>
                        </div>
                        <button class="btn btn-sm speech-replacement-remove" data-id="${id}">X</button>
                    </div>
                `;

                this.$speechReplacements.append(itemHtml);
            })
        }

        console.log("Loaded settings", config);
    },

    isActive() {
        return this.$settings.hasClass('active');
    },

    async saveSettings(config) {
        const orator = await StorageService.getOratorJson();
        orator.config = config;
        await StorageService.writeOratorJson(orator);
    },

    async monitorConfig() {
        if (!this.isActive() || this.saving) return;

        const newConfig = this.buildConfigJson();
        if (JSON.stringify(newConfig) === JSON.stringify(this.config)) return false;

        newConfig.updatedAt = Date.now();
        console.log("Monitoring config", this.config, newConfig);

        ReaderService.stop();

        this.saving = true;
        this.config = newConfig;
        ReaderService.updateTempOratorConfig(newConfig);
        await this.saveSettings(newConfig);
        this.saving = false;
    },

    buildConfigJson() {
        const config = structuredClone(this.config);
        config.ttsUrl = this.$speechService.val();
        config.voice = this.speechVoice.val();
        config.speed = this.$speechSpeed.val();

        const replacements = [];
        this.$speechReplacements.find('.speech-cust-item').each((idx, rep) => {
            const $rep = $(rep);
            const left = $rep.find('.speech-replacement-input-left').val();
            const right = $rep.find('.speech-replacement-input-right').val();
            replacements.push([left, right]);
        });

        config.replacements = replacements;

        return config;
    },

    addNewSpeechReplacement() {
        const newConfig = this.buildConfigJson();
        const replacements = newConfig.replacements ?? [];

        replacements.push(['', '']);
        newConfig.replacements = replacements;

        this.config = newConfig;
        this.loadSettings(newConfig);
    },

    removeSpeechReplacement(button) {
        $(button).closest('.speech-cust-item').remove();
    }

}