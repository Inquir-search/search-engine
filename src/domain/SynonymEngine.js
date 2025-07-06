import fs from "fs";

export default class SynonymEngine {
    constructor(filepath = "./synonyms.json") {
        this.filepath = filepath;
        this.synonyms = new Map();
        this.load();
    }

    load() {
        if (fs.existsSync(this.filepath)) {
            const data = JSON.parse(fs.readFileSync(this.filepath, "utf-8"));
            for (const [key, values] of Object.entries(data)) {
                this.synonyms.set(key.toLowerCase(), new Set(values.map(v => v.toLowerCase())));
            }
        }
    }

    save() {
        const obj = {};
        for (const [k, v] of this.synonyms.entries()) {
            obj[k] = Array.from(v);
        }
        fs.writeFileSync(this.filepath, JSON.stringify(obj, null, 2));
        console.log(`Saved synonyms to ${this.filepath}`);
    }

    add(key, value) {
        key = key.toLowerCase();
        value = value.toLowerCase();
        if (!this.synonyms.has(key)) {
            this.synonyms.set(key, new Set());
        }
        this.synonyms.get(key).add(value);
        this.save();
    }

    get(key) {
        return this.synonyms.get(key.toLowerCase()) || new Set();
    }
}
