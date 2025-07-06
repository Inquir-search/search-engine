import fs from "fs";

export default class StopwordsManager {
    constructor({ filePath = './stopwords.json', get, autoSave = true } = {}) {
        this.filePath = (typeof filePath === 'string' && filePath) ? filePath : './stopwords.json';
        this.get = get;
        this.threshold = 1000;
        this.stopwords = new Set();
        this.autoSave = autoSave;
        this._load();
    }

    _load() {
        if (fs.existsSync(this.filePath)) {
            try {
                const content = fs.readFileSync(this.filePath, "utf-8");
                if (content.trim() === '') {
                    this.stopwords = new Set();
                    return;
                }
                const data = JSON.parse(content);
                this.stopwords = new Set(data);
            } catch (error) {
                console.warn(`Failed to load stopwords from ${this.filePath}:`, error.message);
                this.stopwords = new Set();
            }
        }
    }

    load() {
        return this._load();
    }

    save() {
        if (!this.autoSave) {
            return;
        }

        try {
            fs.writeFileSync(this.filePath, JSON.stringify(Array.from(this.stopwords), null, 2));
        } catch (error) {
            console.warn(`Failed to save stopwords to ${this.filePath}:`, error.message);
        }
    }

    add(word) {
        this.stopwords.add(word.toLowerCase());
        this.save();
    }

    get(word) {
        return this.stopwords.has(word.toLowerCase());
    }

    getAll() {
        return Array.from(this.stopwords);
    }

    autoDetect(termFrequencies) {
        for (const [term, count] of termFrequencies.entries()) {
            if (count >= this.threshold && !this.stopwords.has(term)) {
                console.log(`auto-stopword detected: ${term}`);
                this.stopwords.add(term);
            }
        }
        this.save();
    }
}
