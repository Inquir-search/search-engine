import fs from "fs";

/**
 * SynonymEngine Interface
 * Defines the contract for synonym management operations
 */
export interface ISynonymEngine {
    add(key: string, value: string): void;
    get(key: string): Set<string>;
    getSynonyms(key: string): Set<string>;
    isEnabled(): boolean;
    load(): void;
    save(): void;
}

/**
 * SynonymData represents the structure of synonyms data
 */
export interface SynonymData {
    [key: string]: string[];
}

/**
 * SynonymEngine Domain Service
 * Manages synonyms for query expansion and text matching
 */
export default class SynonymEngine implements ISynonymEngine {
    private readonly filepath: string;
    private readonly synonyms: Map<string, Set<string>>;

    constructor(filepath: string = "./synonyms.json") {
        if (!filepath || typeof filepath !== 'string') {
            throw new Error('Filepath must be a non-empty string');
        }

        this.filepath = filepath;
        this.synonyms = new Map();
        this.load();
    }

    /**
     * Load synonyms from file
     */
    load(): void {
        try {
            if (fs.existsSync(this.filepath)) {
                const data = JSON.parse(fs.readFileSync(this.filepath, "utf-8")) as SynonymData;

                if (typeof data !== 'object' || data === null) {
                    throw new Error('Invalid synonym data format');
                }

                for (const [key, values] of Object.entries(data)) {
                    if (!Array.isArray(values)) {
                        continue; // Skip invalid entries
                    }

                    const synonymSet = new Set(
                        values
                            .filter(v => typeof v === 'string')
                            .map(v => v.toLowerCase())
                    );

                    if (synonymSet.size > 0) {
                        this.synonyms.set(key.toLowerCase(), synonymSet);
                    }
                }
            }
        } catch (error) {
            console.error(`Error loading synonyms from ${this.filepath}:`, error);
            // Continue with empty synonyms map
        }
    }

    /**
     * Save synonyms to file
     */
    save(): void {
        try {
            const obj: SynonymData = {};
            for (const [key, values] of this.synonyms.entries()) {
                obj[key] = Array.from(values);
            }

            fs.writeFileSync(this.filepath, JSON.stringify(obj, null, 2));
        } catch (error) {
            console.error(`Error saving synonyms to ${this.filepath}:`, error);
            throw new Error(`Failed to save synonyms: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Add a synonym for a key
     * @param key - The original term
     * @param value - The synonym to add
     */
    add(key: string, value: string): void {
        if (!key || typeof key !== 'string') {
            throw new Error('Key must be a non-empty string');
        }
        if (!value || typeof value !== 'string') {
            throw new Error('Value must be a non-empty string');
        }

        const normalizedKey = key.toLowerCase();
        const normalizedValue = value.toLowerCase();

        if (!this.synonyms.has(normalizedKey)) {
            this.synonyms.set(normalizedKey, new Set());
        }

        this.synonyms.get(normalizedKey)!.add(normalizedValue);
        this.save();
    }

    /**
     * Get synonyms for a key
     * @param key - The term to get synonyms for
     * @returns Set of synonyms
     */
    get(key: string): Set<string> {
        if (!key || typeof key !== 'string') {
            return new Set();
        }

        return this.synonyms.get(key.toLowerCase()) || new Set();
    }

    /**
     * Check if a key has synonyms
     * @param key - The term to check
     * @returns True if synonyms exist
     */
    has(key: string): boolean {
        if (!key || typeof key !== 'string') {
            return false;
        }

        return this.synonyms.has(key.toLowerCase());
    }

    /**
     * Get synonyms for a key (alias for get method for QueryProcessor compatibility)
     * @param key - The key to get synonyms for
     * @returns Set of synonyms or empty set if key not found
     */
    getSynonyms(key: string): Set<string> {
        return this.get(key);
    }

    /**
     * Check if synonym engine is enabled (has any synonyms)
     * @returns true if synonyms are available, false otherwise
     */
    isEnabled(): boolean {
        return this.synonyms.size > 0;
    }

    /**
     * Remove a synonym for a key
     * @param key - The original term
     * @param value - The synonym to remove
     * @returns True if synonym was removed
     */
    remove(key: string, value: string): boolean {
        if (!key || typeof key !== 'string' || !value || typeof value !== 'string') {
            return false;
        }

        const normalizedKey = key.toLowerCase();
        const normalizedValue = value.toLowerCase();

        if (this.synonyms.has(normalizedKey)) {
            const synonymSet = this.synonyms.get(normalizedKey)!;
            const removed = synonymSet.delete(normalizedValue);

            if (removed) {
                if (synonymSet.size === 0) {
                    this.synonyms.delete(normalizedKey);
                }
                this.save();
            }

            return removed;
        }

        return false;
    }

    /**
     * Remove all synonyms for a key
     * @param key - The original term
     * @returns True if key was removed
     */
    removeKey(key: string): boolean {
        if (!key || typeof key !== 'string') {
            return false;
        }

        const normalizedKey = key.toLowerCase();
        const removed = this.synonyms.delete(normalizedKey);

        if (removed) {
            this.save();
        }

        return removed;
    }

    /**
     * Clear all synonyms
     */
    clear(): void {
        this.synonyms.clear();
        this.save();
    }

    /**
     * Get all synonym keys
     * @returns Array of all keys
     */
    getKeys(): string[] {
        return Array.from(this.synonyms.keys());
    }

    /**
     * Get total number of synonym entries
     * @returns Number of synonym entries
     */
    size(): number {
        return this.synonyms.size;
    }

    /**
     * Get statistics about synonyms
     * @returns Statistics object
     */
    getStats(): { totalKeys: number; totalSynonyms: number; averageSynonymsPerKey: number } {
        const totalKeys = this.synonyms.size;
        let totalSynonyms = 0;

        for (const synonymSet of this.synonyms.values()) {
            totalSynonyms += synonymSet.size;
        }

        return {
            totalKeys,
            totalSynonyms,
            averageSynonymsPerKey: totalKeys > 0 ? totalSynonyms / totalKeys : 0
        };
    }
}

export { SynonymEngine };