const fs = require('fs');
const path = require('path');

class I18n {
    constructor() {
        this.locales = {};
        this.currentLocale = 'zh-CN';
        this.loadLocales();
    }

    loadLocales() {
        const localesPath = __dirname;
        const files = fs.readdirSync(localesPath);

        files.forEach(file => {
            if (file.endsWith('.json')) {
                const locale = file.replace('.json', '');
                const content = fs.readFileSync(path.join(localesPath, file), 'utf8');
                this.locales[locale] = JSON.parse(content);
            }
        });
    }

    loadFromConfig(configLanguage) {
        if (configLanguage && this.locales[configLanguage]) {
            this.currentLocale = configLanguage;
            return true;
        }
        return false;
    }

    setLocale(locale) {
        if (this.locales[locale]) {
            this.currentLocale = locale;
        }
    }

    getLocale() {
        return this.currentLocale;
    }

    t(key, params = {}) {
        const keys = key.split('.');
        let value = this.locales[this.currentLocale];

        for (const k of keys) {
            if (value && value[k]) {
                value = value[k];
            } else {
                return key;
            }
        }

        if (typeof value === 'string' && params) {
            return value.replace(/\{(\w+)\}/g, (match, key) => params[key] || match);
        }

        return value;
    }
}

module.exports = new I18n(); 