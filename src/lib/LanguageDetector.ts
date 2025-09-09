/**
 * Language detector using CLD (Compact Language Detector)
 */
export class LanguageDetector {
    private cld: any = null;
    private cache: Map<string, string> = new Map();
    private readonly maxCacheSize: number;
    private readonly defaultLanguage: string;

    constructor(options: LanguageDetectorOptions = {}) {
        this.defaultLanguage = options.defaultLanguage || 'en';
        this.maxCacheSize = options.maxCacheSize || 1000;

        // Initialize CLD asynchronously
        this._initializeCld();
    }

    /**
     * Initialize CLD asynchronously
     */
    private async _initializeCld(): Promise<void> {
        try {
            // Try to load CLD if available
            const cldModule = await import('cld');
            this.cld = cldModule.default;
        } catch (error) {
            // CLD not available, will use fallback
            this.cld = null;
        }
    }

    /**
     * Detect language from text
     * @param text - Text to analyze
     * @returns Language code (e.g., 'en', 'es', 'fr')
     */
    async detect(text: string): Promise<string> {
        if (!this.cld) {
            return this.defaultLanguage; // Use configured default if CLD is not available
        }

        // Clean text for better detection
        const cleanText = this._cleanText(text);

        // Use cache for performance
        if (this.cache.has(cleanText)) {
            return this.cache.get(cleanText)!;
        }

        try {
            const result = await this.cld.detect(cleanText);
            const language = this._mapCldToStandardCode(result.language);

            // Cache the result
            this._addToCache(cleanText, language);

            return language;
        } catch (error) {
            // Fallback to configured default if detection fails
            return this.defaultLanguage;
        }
    }

    /**
     * Clean text for better language detection
     */
    private _cleanText(text: string): string {
        if (!text || typeof text !== 'string') {
            return '';
        }

        // Remove excessive whitespace and normalize
        return text
            .replace(/\s+/g, ' ')
            .replace(/[^\w\s\u00C0-\u017F\u0100-\u024F\u1E00-\u1EFF]/g, '') // Keep accented characters
            .trim()
            .substring(0, 1000); // Limit length for performance
    }

    /**
     * Map CLD language codes to standard ISO codes
     * @param cldLanguage - CLD language name
     * @returns Standard language code
     */
    private _mapCldToStandardCode(cldLanguage: string): string {
        // CLD returns language names, we need to map them to standard codes
        const mapping: Record<string, string> = {
            'ENGLISH': 'en',
            'SPANISH': 'es',
            'FRENCH': 'fr',
            'GERMAN': 'de',
            'ITALIAN': 'it',
            'PORTUGUESE': 'pt',
            'RUSSIAN': 'ru',
            'JAPANESE': 'ja',
            'CHINESE': 'zh',
            'KOREAN': 'ko',
            'ARABIC': 'ar',
            'DUTCH': 'nl',
            'SWEDISH': 'sv',
            'NORWEGIAN': 'no',
            'DANISH': 'da',
            'FINNISH': 'fi',
            'TURKISH': 'tr',
            'POLISH': 'pl',
            'CZECH': 'cs',
            'HUNGARIAN': 'hu',
            'ROMANIAN': 'ro',
            'BULGARIAN': 'bg',
            'GREEK': 'el',
            'HEBREW': 'he',
            'THAI': 'th',
            'VIETNAMESE': 'vi'
        };

        return mapping[cldLanguage] || this.defaultLanguage;
    }

    /**
     * Add result to cache with size limit
     */
    private _addToCache(text: string, language: string): void {
        if (this.cache.size >= this.maxCacheSize) {
            // Remove oldest entry
            const firstKey = this.cache.keys().next().value;
            if (firstKey) {
                this.cache.delete(firstKey);
            }
        }
        this.cache.set(text, language);
    }

    /**
     * Clear the detection cache
     */
    clearCache(): void {
        this.cache.clear();
    }

    /**
     * Get cache statistics
     */
    getCacheStats(): CacheStats {
        return {
            size: this.cache.size,
            maxSize: this.maxCacheSize
        };
    }

    /**
     * Update configuration
     */
    configure(options: Partial<LanguageDetectorOptions> = {}): void {
        if (options.defaultLanguage) {
            (this as any).defaultLanguage = options.defaultLanguage;
        }
        if (options.maxCacheSize) {
            (this as any).maxCacheSize = options.maxCacheSize;
        }
    }
}

export interface LanguageDetectorOptions {
    defaultLanguage?: string;
    maxCacheSize?: number;
}

export interface CacheStats {
    size: number;
    maxSize: number;
}