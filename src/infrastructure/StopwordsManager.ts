import fs from "fs";
import { getConfigManager } from './ConfigManager.js';

export interface StopwordsManagerOptions {
    filePath?: string;
    threshold?: number;
    autoSave?: boolean;
}

export class StopwordsManager {
    private readonly filePath: string;
    private readonly threshold: number;
    private readonly autoSave: boolean;
    private stopwords: Set<string>;

    constructor(options: StopwordsManagerOptions = {}) {
        const configManager = getConfigManager();
        const stopwordsConfig = configManager.get('stopwords');

        this.filePath = (typeof options.filePath === 'string' && options.filePath)
            ? options.filePath
            : (stopwordsConfig && stopwordsConfig.filePath) || './stopwords.json';
        this.threshold = options.threshold ?? (stopwordsConfig && stopwordsConfig.threshold) ?? 0.5;
        this.autoSave = options.autoSave ?? (stopwordsConfig && stopwordsConfig.autoSave) ?? true;
        this.stopwords = new Set();
        this.load();
    }

    private _load(): void {
        if (fs.existsSync(this.filePath)) {
            try {
                const content = fs.readFileSync(this.filePath, "utf-8");
                if (content.trim() === '') {
                    this.stopwords.clear();
                    return;
                }
                const data = JSON.parse(content);
                this.stopwords.clear();
                if (Array.isArray(data)) {
                    data.forEach(word => this.stopwords.add(word));
                }
            } catch (error) {
                // If there's an error reading the file, start with empty set
                this.stopwords.clear();
            }
        }
    }

    load(): void {
        this._load();
    }

    save(): void {
        if (!this.autoSave) {
            return;
        }

        try {
            fs.writeFileSync(this.filePath, JSON.stringify(Array.from(this.stopwords), null, 2));
        } catch (error) {
            // Silently handle write errors
        }
    }

    add(word: string): void {
        this.stopwords.add(word.toLowerCase());
        this.save();
    }

    get(word: string): boolean {
        return this.stopwords.has(word.toLowerCase());
    }

    has(word: string): boolean {
        return this.stopwords.has(word.toLowerCase());
    }

    getAll(): string[] {
        return Array.from(this.stopwords);
    }

    autoDetect(termFrequencies: Map<string, number>): void {
        for (const [term, count] of termFrequencies.entries()) {
            if (count >= this.threshold && !this.stopwords.has(term)) {
                this.stopwords.add(term);
            }
        }
        this.save();
    }

    clear(): void {
        this.stopwords.clear();
        this.save();
    }

    size(): number {
        return this.stopwords.size;
    }

    remove(word: string): boolean {
        const removed = this.stopwords.delete(word.toLowerCase());
        if (removed) {
            this.save();
        }
        return removed;
    }

    isEnabled(): boolean {
        return this.autoSave;
    }

    getThreshold(): number {
        return this.threshold;
    }

    getFilePath(): string {
        return this.filePath;
    }
}

export default StopwordsManager;