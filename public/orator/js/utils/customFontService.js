const CustomFontService = {

    async init(config) {
        this.$fontInput = $('#font-input');
        this.$customFontsList = $('.custom-fonts-list');

        if (!config.customFonts || config.customFonts.length === 0) {
            return;
        }

        for (const font of config.customFonts) {
            this.registerFontFace(font);
            this.appendFontToUI(font);
        }
    },

    registerFontFace({name, dataUrl}) {
        const regularFace = new FontFace(
            name,
            `url(${dataUrl})`,
            {style: 'normal'}
        );
        const italicFace = new FontFace(
            name,
            `url(${dataUrl})`,
            {style: 'oblique 10deg'}
        );

        document.fonts.add(regularFace);
        document.fonts.add(italicFace);
    },

    async addFont(file) {
        const validExtensions = ['.ttf', '.otf', '.woff', '.woff2'];
        const fileExt = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();

        if (!validExtensions.includes(fileExt)) {
            alert('Please upload a valid font file (.ttf, .otf, .woff, .woff2)');
            return;
        }

        const maxSizeMB = 5;
        if (file.size > maxSizeMB * 1024 * 1024) {
            alert(`Font file is too large (max ${maxSizeMB}MB)`);
            return;
        }

        const baseName = file.name.slice(0, file.name.lastIndexOf('.'));
        let fontName = this.sanitizeFontName(baseName);

        const orator = await StorageService.getOratorJson();
        const existingFonts = orator.config.customFonts || [];

        let finalName = fontName;
        let counter = 1;
        while (existingFonts.some(f => f.name === finalName)) {
            finalName = `${fontName} ${counter}`;
            counter++;
        }

        const dataUrl = await this.fileToDataUrl(file);

        const newFont = {name: finalName, dataUrl};
        this.registerFontFace(newFont);

        existingFonts.push(newFont);
        orator.config.customFonts = existingFonts;

        SettingsService.config.customFonts = existingFonts;

        await StorageService.writeOratorJson(orator);

        this.appendFontToUI(newFont);
    },

    async removeFont(name) {
        const orator = await StorageService.getOratorJson();
        const existingFonts = orator.config.customFonts || [];

        const filtered = existingFonts.filter(f => f.name !== name);
        orator.config.customFonts = filtered;

        SettingsService.config.customFonts = filtered;

        await StorageService.writeOratorJson(orator);

        this.$customFontsList.find(`.custom-font-item[data-name="${name}"]`).remove();
        this.$fontInput.find(`option[data-custom-font="${name}"]`).remove();

        if (SettingsService.config.fontFamily === name) {
            SettingsService.config.fontFamily = DEFAULT_ORATOR_JSON.orator.config.fontFamily;
            this.$fontInput.val(SettingsService.config.fontFamily);
            SettingsService.monitorConfig();
        }
    },

    appendFontToUI({name}) {
        this.$customFontsList.append(this.prepareFontListItemHtml({name}));
        this.$fontInput.append(
            `<option value="${name}" data-custom-font="${name}" style="font-family:'${name}'">
                ${name}
            </option>`
        );
    },

    prepareFontListItemHtml({name}) {
        return `
            <div class="custom-font-item" data-name="${name}">
                <span class="custom-font-name">${name}</span>
                <button class="btn btn-sm custom-font-remove" data-name="${name}">
                    <i class="bi bi-trash3-fill"></i>
                </button>
            </div>
        `;
    },

    sanitizeFontName(name) {
        return name
            .replace(/[^a-zA-Z0-9\s]/g, '')
            .trim()
            .replace(/\s+/g, ' ')
            || 'Custom Font';
    },

    fileToDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

};
