const SettingsService = {

    async init() {

        const orator = await StorageService.getOratorJson();
        const config = orator.config;

        this.$settings = $("#playback-settings");

        this.$speechService = $('#speech-service-input');
        this.$speechVoice = $('#speech-voice-input');
        this.$speechSpeed = $('#speech-speed-input');
        this.$speechPitch = $('#speech-pitch-input');
        this.$speechReplacements = $('.speech-cust-items');

        this.$fontInput = $('#font-input');
        this.$fontSize = $('#font-size-input');
        this.$fontLine = $('#font-line-input');
        this.$fontSpacing = $('#font-spacing-input');

        config.pitch = config.pitch ?? 1.0;
        config.fontColor = config.fontColor ?? "#000000";
        config.highlightColor = config.highlightColor ?? "#00ff00";
        config.backgroundColor = config.backgroundColor ?? "#eeeeee";

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
                <div class="kokoro-voice-item">
                    <div class="form-check">
                        <input class="form-check-input" type="checkbox" value="${voice}" id="kv_${voice}">
                        <label class="form-check-label" for="kv_${voice}">
                            ${voice.replaceAll('_', ' ').toUpperCase()}
                        </label>
                    </div>
                    <div class="kokoro-voice-blend-controls">
                        <button class="btn btn-sm btn-outline-secondary blend-decrease" data-voice="${voice}">-</button>
                        <input type="number" class="blend-amount-input" id="kv_amount_${voice}" value="1" min="1" max="10" readonly>
                        <button class="btn btn-sm btn-outline-secondary blend-increase" data-voice="${voice}">+</button>
                    </div>
                </div>
                `
            )

        });

        this.$settings.find('.check-box-group-voice.kokoro').on('click', '.blend-increase, .blend-decrease', (e) => {
            const $btn = $(e.currentTarget);
            const voice = $btn.data('voice');
            const $input = $(`#kv_amount_${voice}`);
            let val = parseInt($input.val());

            if ($btn.hasClass('blend-increase')) {
                if (val < 10) val++;
            } else {
                if (val > 1) val--;
            }

            $input.val(val);
            this.monitorConfig();
        });

        this.$settings.find('.check-box-group-voice.kokoro').on('change', 'input[type="checkbox"]', () => {
            this.monitorConfig();
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

        const createPicker = (el, defaultColor) => {
            return Pickr.create({
                el: el,
                theme: 'nano',
                default: defaultColor,
                components: {
                    preview: true,
                    opacity: true,
                    hue: true,
                    interaction: {input: true, save: true}
                }
            });
        };

        this.pickers = {
            font: createPicker('#font-color-picker', this.config.fontColor),
            highlight: createPicker('#font-highlight-picker', this.config.highlightColor),
            background: createPicker('#font-background-picker', this.config.backgroundColor)
        };

        Object.values(this.pickers).forEach(p => {

            p.on('change', (color) => {
                p.applyColor(true); // Forces the color to be applied to the button
            });

            p.on('save', (color) => {
                p.hide();
                this.monitorConfig();
            });

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
                .map(v => {
                    const voice = v.substring(0, v.indexOf('('));
                    const amount = v.substring(v.indexOf('(') + 1, v.indexOf(')'));
                    if (KOKORO_VOICES.indexOf(voice) >= 0) {
                        this.$settings.find(`.check-box-group-voice.${selectedSpeechService} #kv_${voice}`).prop('checked', true);
                        this.$settings.find(`.check-box-group-voice.${selectedSpeechService} #kv_amount_${voice}`).val(amount);
                    }
                });
        }

        if (selectedSpeechService === 'edgetts') {
            if (EDGETTS_VOICES.indexOf(selectedSpeechService) >= 0) {
                this.$settings.find(`.check-box-group-voice.${selectedSpeechService} #kv_${config.voice}`).prop('checked', true);
            }
        }

        this.$speechSpeed.val(config.speed);
        this.$speechSpeed.parent().find('span').text(config.speed);

        this.$speechPitch.val(config.pitch);
        this.$speechPitch.parent().find('span').text(config.pitch);

        if (config.replacements) {

            this.$speechReplacements.empty();

            config.replacements.forEach((rep, id) => {
                this.$speechReplacements.append(this.prepareReplacementHtml(rep, id));
            });
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
        this.pickers.font.setColor(config.fontColor);
        this.pickers.highlight.setColor(config.highlightColor);
        this.pickers.background.setColor(config.backgroundColor);

        // Apply the styles
        this.applyStyles(config);

        console.log("Loaded settings", config);
    },

    prepareReplacementHtml(rep, id) {
        return `
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

        const isSpeechServiceChanged = newConfig.ttsUrl !== this.config.ttsUrl;

        if (
            newConfig.ttsUrl !== this.config.ttsUrl
            || newConfig.voice !== this.config.voice
            || newConfig.speed !== this.config.speed
            || newConfig.pitch !== this.config.pitch
            || JSON.stringify(newConfig.replacements) !== JSON.stringify(this.config.replacements)
        ) {
            newConfig.updatedAt = Date.now();
            ReaderService.stop();
        }

        const isFontChanged = (
            newConfig.fontFamily !== this.config.fontFamily
            || newConfig.fontSize !== this.config.fontSize
            || newConfig.lineHeight !== this.config.lineHeight
            || newConfig.letterSpacing !== this.config.letterSpacing
        );

        console.log("Monitoring config", this.config, newConfig);

        this.saving = true;
        this.config = newConfig;

        this.applyStyles(newConfig);

        ReaderService.updateTempOratorConfig(newConfig);
        await this.saveSettings(newConfig);

        if (isFontChanged) {
            await App.sleep(1000);
            ReaderService.scrollToParagraph(undefined, undefined);
        }

        if (isSpeechServiceChanged) this.loadSettings(newConfig);

        this.saving = false;
    },

    buildConfigJson() {
        let speechVoice = "";
        const selectedService = this.$speechService.val();

        if (selectedService.includes('kokoro')) {
            speechVoice = $('.check-box-group-voice.kokoro input:checked').map((i, el) => {
                const voice = $(el).val();
                const amount = $(`#kv_amount_${voice}`).val();
                return `${voice}(${amount})`;
            }).get().join("+");
        } else if (selectedService === DEFAULT_EDGE_TTS_URL) {
            speechVoice = $('.check-box-group-voice.edgetts input:checked').map((i, el) => $(el).val()).get().join("+");
        } else {
            speechVoice = this.$speechVoice.val();
        }

        this.$speechVoice.val(speechVoice);

        const config = structuredClone(this.config);
        config.ttsUrl = this.$speechService.val().trim();
        config.voice = this.$speechVoice.val().trim();
        config.speed = this.$speechSpeed.val().trim();
        config.pitch = this.$speechPitch.val().trim();

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
        config.fontColor = this.pickers.font.getColor().toHEXA().toString();
        config.highlightColor = this.pickers.highlight.getColor().toHEXA().toString();
        config.backgroundColor = this.pickers.background.getColor().toHEXA().toString();

        return config;
    },

    addNewSpeechReplacement() {
        const newConfig = this.buildConfigJson();
        const replacements = newConfig.replacements ?? [];
        this.$speechReplacements.append(this.prepareReplacementHtml(['', ''], replacements));
    },

    removeSpeechReplacement(button) {
        $(button).closest('.speech-cust-item').remove();
    },

    async applyStyles(config) {
        const hlColorWoTrans = config.highlightColor.substring(0, 7);
        const hlColorDarkened = this.darkenHex(config.highlightColor, 20);
        const scrollMarginTop = config.lineHeight * (config.lineHeight < 25 ? 3 : 1);

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
            
            .reader-container .reader-paragraph {
                scroll-margin-top: ${scrollMarginTop}pt !important;
            }
            
            /*
            .reader-container .reader-paragraph.active {
                background-color: ${config.highlightColor} !important;
            }
            */
            
            .reader-container .highlight {
                background-color: ${config.highlightColor} !important;
                border: 1px solid ${hlColorDarkened} !important;
                /*background: linear-gradient(180deg, ${config.highlightColor} 0%, ${hlColorDarkened} 100%) !important;*/
            }
            
            .playback-chapter-item.active {
                background-color: ${hlColorWoTrans}60 !important;
            }
        `);

        backgroundColor = tinycolor(config.backgroundColor);
        if (backgroundColor.isDark()) {
            $('#playback-controls').addClass('dark-mode');
            $('.reader-container-wrapper').addClass('dark-mode');
        } else {
            $('#playback-controls').removeClass('dark-mode');
            $('.reader-container-wrapper').removeClass('dark-mode');
        }
    },

    darkenHex(hex, amount = 20) {
        // Remove hash if present
        hex = hex.replace(/^#/, '');

        // Parse r, g, b, and a (default alpha to FF if not present)
        let r = parseInt(hex.substring(0, 2), 16);
        let g = parseInt(hex.substring(2, 4), 16);
        let b = parseInt(hex.substring(4, 6), 16);
        let a = hex.length === 8 ? hex.substring(6, 8) : '';

        // Apply darkening and clamp between 0 and 255
        const darken = (val) => Math.max(0, val - amount).toString(16).padStart(2, '0');

        return `#${darken(r)}${darken(g)}${darken(b)}${a}`;
    }

}