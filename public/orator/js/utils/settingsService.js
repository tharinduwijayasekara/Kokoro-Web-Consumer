const SettingsService = {

    async init() {

        const orator = await StorageService.getOratorJson();
        const config = orator.config;

        this.$settings = $("#playback-settings");

        this.$speechService = $('#speech-service-input');
        this.$speechVoice = $('#speech-voice-input');
        this.$speechSpeed = $('#speech-speed-input');
        this.$speechReplacements = $('.speech-cust-items');

        this.$fontInput = $('#font-input');
        this.$fontSize = $('#font-size-input');
        this.$fontLine = $('#font-line-input');
        this.$fontSpacing = $('#font-spacing-input');

        this.$fontColor = $('#font-color-input');
        this.$highlightColor = $('#font-highlight-input');
        this.$backgroundColor = $('#font-background-input');

        this.config = config;
        this.saving = false;

        if (!this.configMonitor) {

            this.renderFirstLoad();

            this.configMonitor = setInterval(() => this.monitorConfig(), 1000);

        }

        this.loadSettings(config);
    },

    renderFirstLoad() {
        KOKORO_VOICES.forEach((voice) => {

            this.$settings.find('.check-box-group-voice.kokoro').append(
                `
                <div class="form-check">
                    <input class="form-check-input" type="checkbox" value="${voice}" id="kv_${voice}">
                    <label class="form-check-label" for="kv_${voice}">
                        ${voice.replaceAll('_', ' ').toUpperCase()}
                    </label>
                </div>
                `
            )

        });

        EDGETTS_VOICES.forEach((voice) => {

            this.$settings.find('.check-box-group-voice.edgetts').append(
                `
                <div class="form-check">
                    <input class="form-check-input" type="radio" value="${voice}" id="ev_${voice}" name="radio_edgetts_voice">
                    <label class="form-check-label" for="ev_${voice}">
                        ${voice}
                    </label>
                </div>
                `
            )

        });

        ORATOR_FONTS.forEach(font => {
            this.$fontInput.append(
                `
                <option value="${font}" style="font-family:'${font}'">
                    ${font}
                </option>
                `
            );
        });
    },

    loadSettings(config) {
        this.$speechService.val(config.ttsUrl);

        let selectedSpeechService = "kokoro";
        if (config.ttsUrl === DEFAULT_EDGE_TTS_URL) {
            selectedSpeechService = "edgetts";
        }

        this.$settings.find('.check-box-group-voice').removeClass('active');
        this.$settings.find(`.check-box-group-voice.${selectedSpeechService}`).addClass('active');

        this.$speechVoice.val(config.voice);

        if (selectedSpeechService === 'kokoro') {
            config.voice
                .split('+')
                .map(voice => {
                    voice = voice.substring(0, voice.indexOf('('))
                    if (KOKORO_VOICES.indexOf(voice) >= 0) {
                        this.$settings.find(`.check-box-group-voice.${selectedSpeechService} #kv_${voice}`).prop('checked', true);
                    }
                });
        }

        if (selectedSpeechService === 'edgetts') {
            if (EDGETTS_VOICES.indexOf(selectedSpeechService) >= 0) {
                this.$settings.find(`.check-box-group-voice.${selectedSpeechService} #kv_${config.voice}`).prop('checked', true);
            }
        }

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
                        <button class="btn btn-sm speech-replacement-remove" data-id="${id}">
                            <i class="bi bi-trash3-fill"></i>
                        </button>
                    </div>
                `;

                this.$speechReplacements.append(itemHtml);
            })
        }

        // Typography
        this.$fontInput.val(config.fontFamily);

        this.$fontSize.val(config.fontSize);
        this.$fontSize.parent().find('span').text(config.fontSize);

        this.$fontLine.val(config.lineHeight);
        this.$fontLine.parent().find('span').text(config.lineHeight);

        this.$fontSpacing.val(config.letterSpacing);
        this.$fontSpacing.parent().find('span').text(config.letterSpacing);

        // Colors
        this.$fontColor.val(config.fontColor);
        this.$highlightColor.val(config.highlightColor);
        this.$backgroundColor.val(config.backgroundColor);

        // Apply the styles
        this.applyStyles(config);

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
        this.loadSettings(newConfig);

        ReaderService.updateTempOratorConfig(newConfig);
        await this.saveSettings(newConfig);

        this.saving = false;
    },

    buildConfigJson() {
        let speechVoice = $('.check-box-group-voice.active input:checked').map((i, el) => $(el).val()).get();
        if (speechVoice.length > 1) speechVoice = speechVoice.map(voice => `${voice}(1)`);
        speechVoice = speechVoice.join("+");
        this.$speechVoice.val(speechVoice);

        const config = structuredClone(this.config);
        config.ttsUrl = this.$speechService.val().trim();
        config.voice = this.$speechVoice.val().trim();
        config.speed = this.$speechSpeed.val().trim();

        const replacements = [];
        this.$speechReplacements.find('.speech-cust-item').each((idx, rep) => {
            const $rep = $(rep);
            const left = $rep.find('.speech-replacement-input-left').val().trim();
            const right = $rep.find('.speech-replacement-input-right').val().trim();
            replacements.push([left, right]);
        });

        config.replacements = replacements;

        // Typography
        config.fontFamily = this.$fontInput.val();
        config.fontSize = parseInt(this.$fontSize.val());
        config.lineHeight = parseInt(this.$fontLine.val());
        config.letterSpacing = parseInt(this.$fontSpacing.val());

        // Colors
        config.fontColor = this.$fontColor.val();
        config.highlightColor = this.$highlightColor.val();
        config.backgroundColor = this.$backgroundColor.val();

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
    },

    applyStyles(config) {
        $('#app-styles').html(`
            .reader-container p {
                font-family: '${config.fontFamily}' !important;
                color: ${config.fontColor} !important;
                font-size: ${config.fontSize}pt !important;
                line-height: ${config.lineHeight}pt !important;
                letter-spacing: ${config.letterSpacing}px !important;
            }
            .reader-container-wrapper {
                background-color: ${config.backgroundColor} !important;
            }
        
            .reader-container p.active {
                background-color: ${config.highlightColor}30 !important;
            }
        `);
    }

}