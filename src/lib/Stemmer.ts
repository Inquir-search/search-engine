import { LanguageDetector } from './LanguageDetector.js';
import { SnowballStemmer } from './SnowballStemmer.js';

/**
 * Main stemmer class that combines language detection with Snowball stemming
 */
export class Stemmer {
    private readonly languageDetector: LanguageDetector;
    private readonly snowballStemmer: SnowballStemmer;
    private readonly stemCache: Map<string, string> = new Map();
    private options: StemmerOptions;
    private stats: StemmerStats;

    constructor(options: Partial<StemmerOptions> = {}) {
        this.options = {
            enabled: options.enabled !== false, // Default: true
            autoDetectLanguage: options.autoDetectLanguage !== false, // Default: true
            defaultLanguage: options.defaultLanguage || 'en',
            cacheSize: options.cacheSize || 10000,
            ...options
        };

        // Initialize components
        this.languageDetector = new LanguageDetector();
        this.snowballStemmer = new SnowballStemmer();

        // Statistics
        this.stats = {
            totalStems: 0,
            cacheHits: 0,
            cacheMisses: 0,
            languageDetections: 0,
            stemmingOperations: 0
        };
    }

    /**
     * Stem a single word
     * @param word - Word to stem
     * @param language - Optional language hint
     * @returns Stemmed word
     */
    async stem(word: string, language: string | null = null): Promise<string> {
        if (!this.options.enabled || !word || typeof word !== 'string') {
            return word;
        }

        this.stats.totalStems++;

        // Check cache first
        const actualLanguage = language || this.options.defaultLanguage;
        const cacheKey = `${word.toLowerCase()}:${actualLanguage}`;

        if (this.stemCache.has(cacheKey)) {
            this.stats.cacheHits++;
            return this.stemCache.get(cacheKey)!;
        }

        this.stats.cacheMisses++;

        // Detect language if auto-detection is enabled and no language provided
        let detectedLanguage = actualLanguage;
        if (!language && this.options.autoDetectLanguage) {
            detectedLanguage = await this.languageDetector.detect(word);
            this.stats.languageDetections++;
        }

        // Stem the word using Snowball
        const stemmedWord = await this.snowballStemmer.stem(word, detectedLanguage);
        this.stats.stemmingOperations++;

        // Update cache
        this._updateCache(cacheKey, stemmedWord);

        return stemmedWord;
    }

    /**
     * Stem an array of words
     * @param words - Words to stem
     * @param language - Optional language hint
     * @returns Array of stemmed words
     */
    async stemWords(words: string[], language: string | null = null): Promise<string[]> {
        if (!this.options.enabled || !Array.isArray(words)) {
            return words;
        }

        // Detect language once for the entire array if auto-detection is enabled
        let detectedLanguage = language || this.options.defaultLanguage;
        if (!language && this.options.autoDetectLanguage && words.length > 0) {
            const sampleText = words.slice(0, 10).join(' '); // Use first 10 words as sample
            detectedLanguage = await this.languageDetector.detect(sampleText);
            this.stats.languageDetections++;
        }

        const results: string[] = [];
        for (const word of words) {
            if (!word || typeof word !== 'string') {
                results.push(word);
                continue;
            }

            this.stats.totalStems++;

            // Check cache
            const cacheKey = `${word.toLowerCase()}:${detectedLanguage}`;
            if (this.stemCache.has(cacheKey)) {
                this.stats.cacheHits++;
                results.push(this.stemCache.get(cacheKey)!);
                continue;
            }

            this.stats.cacheMisses++;

            // Stem the word
            const stemmedWord = await this.snowballStemmer.stem(word, detectedLanguage);
            this.stats.stemmingOperations++;

            // Update cache
            this._updateCache(cacheKey, stemmedWord);

            results.push(stemmedWord);
        }

        return results;
    }

    /**
     * Synchronous version of stem for compatibility
     * @param word - Word to stem
     * @param language - Optional language code
     * @returns Stemmed word
     */
    stemSync(word: string, language: string | null = null): string {
        if (!this.options.enabled || !word || typeof word !== 'string') {
            return word;
        }

        this.stats.totalStems++;

        const actualLanguage = language || this.options.defaultLanguage;
        const cacheKey = `${word.toLowerCase()}:${actualLanguage}`;

        if (this.stemCache.has(cacheKey)) {
            this.stats.cacheHits++;
            return this.stemCache.get(cacheKey)!;
        }

        this.stats.cacheMisses++;

        // Use provided language or default (no auto-detection in sync mode)
        const stemmedWord = this.snowballStemmer.stem(word, actualLanguage);
        this.stats.stemmingOperations++;

        // Update cache
        this._updateCache(cacheKey, stemmedWord);

        return stemmedWord;
    }

    /**
     * Update cache with size limit
     */
    private _updateCache(key: string, value: string): void {
        if (this.stemCache.size >= this.options.cacheSize) {
            // Remove oldest entries (simple FIFO)
            const firstKey = this.stemCache.keys().next().value;
            this.stemCache.delete(firstKey);
        }
        this.stemCache.set(key, value);
    }

    /**
     * Clear the stemming cache
     */
    clearCache(): void {
        this.stemCache.clear();
        this.stats.cacheHits = 0;
        this.stats.cacheMisses = 0;
    }

    /**
     * Get cache statistics
     * @returns Cache statistics
     */
    getCacheStats(): CacheStats {
        return {
            size: this.stemCache.size,
            maxSize: this.options.cacheSize,
            hitRate: this.stats.cacheHits + this.stats.cacheMisses > 0
                ? (this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses))
                : 0
        };
    }

    /**
     * Get stemming statistics
     * @returns Stemming statistics
     */
    getStats(): StemmerFullStats {
        return {
            ...this.stats,
            cache: this.getCacheStats(),
            supportedLanguages: this.getSupportedLanguages()
        };
    }

    /**
     * Get supported languages from Snowball stemmer
     * @returns Array of supported language codes
     */
    getSupportedLanguages(): string[] {
        return this.snowballStemmer.getSupportedLanguages();
    }

    /**
     * Check if a language is supported
     * @param language - Language code
     * @returns Whether the language is supported
     */
    isLanguageSupported(language: string): boolean {
        return this.snowballStemmer.isLanguageSupported(language);
    }

    /**
     * Get information about available stemmers
     * @returns Information about all available stemmers
     */
    getStemmersInfo(): any {
        return this.snowballStemmer.getAllStemmersInfo();
    }

    /**
     * Reset all statistics
     */
    resetStats(): void {
        this.stats = {
            totalStems: 0,
            cacheHits: 0,
            cacheMisses: 0,
            languageDetections: 0,
            stemmingOperations: 0
        };
    }

    /**
     * Configure stemmer options
     * @param newOptions - New options to merge
     */
    configure(newOptions: Partial<StemmerOptions>): void {
        this.options = { ...this.options, ...newOptions };

        // Resize cache if needed
        if (newOptions.cacheSize && newOptions.cacheSize !== this.options.cacheSize) {
            while (this.stemCache.size > newOptions.cacheSize) {
                const firstKey = this.stemCache.keys().next().value;
                this.stemCache.delete(firstKey);
            }
        }
    }

    /**
     * Get current configuration
     * @returns Current configuration
     */
    getConfiguration(): StemmerOptions {
        return { ...this.options };
    }
}

export interface StemmerOptions {
    enabled: boolean;
    autoDetectLanguage: boolean;
    defaultLanguage: string;
    cacheSize: number;
}

export interface StemmerStats {
    totalStems: number;
    cacheHits: number;
    cacheMisses: number;
    languageDetections: number;
    stemmingOperations: number;
}

export interface CacheStats {
    size: number;
    maxSize: number;
    hitRate: number;
}

export interface StemmerFullStats extends StemmerStats {
    cache: CacheStats;
    supportedLanguages: string[];
}