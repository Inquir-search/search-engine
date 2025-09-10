import Tokenizer from '../domain/Tokenizer.js';
import StopwordsManager from './StopwordsManager.js';

// Value Objects
export class TokenizationResult {
    constructor(
        public readonly tokens: string[],
        public readonly field: string,
        public readonly analyzer: string
    ) { }

    isEmpty(): boolean {
        return this.tokens.length === 0;
    }

    hasTokens(): boolean {
        return this.tokens.length > 0;
    }

    getTokenCount(): number {
        return this.tokens.length;
    }
}

export class TokenizationStatistics {
    constructor(
        public tokenizations: number = 0,
        public cacheHits: number = 0,
        public cacheMisses: number = 0
    ) { }

    recordTokenization(): void {
        this.tokenizations++;
        this.cacheMisses++;
    }

    recordCacheHit(): void {
        this.cacheHits++;
    }

    getCacheHitRate(): string {
        if (this.tokenizations === 0) return '0%';
        return ((this.cacheHits / this.tokenizations) * 100).toFixed(2) + '%';
    }

    reset(): void {
        this.tokenizations = 0;
        this.cacheHits = 0;
        this.cacheMisses = 0;
    }

    toPlainObject(): TokenizationStatsData {
        return {
            tokenizations: this.tokenizations,
            cacheHits: this.cacheHits,
            cacheMisses: this.cacheMisses,
            cacheHitRate: this.getCacheHitRate()
        };
    }
}

// Domain Services
export class FieldDetectionService {
    /**
     * Dynamically detect text fields from a document
     */
    static detectTextFields(document: DocumentLike): string[] {
        const textFields: string[] = [];

        const exploreFields = (obj: any, prefix: string = ''): void => {
            for (const [field, value] of Object.entries(obj)) {
                if (field === 'id') continue; // Skip ID field

                const fieldName = prefix ? `${prefix}.${field}` : field;

                if (typeof value === 'string' && value.trim().length > 0) {
                    textFields.push(fieldName);
                } else if (typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)) {
                    // Recursively explore nested objects
                    exploreFields(value, fieldName);
                }
            }
        };

        exploreFields(document);
        return textFields;
    }

    /**
     * Dynamically detect array fields from a document
     */
    static detectArrayFields(document: DocumentLike): string[] {
        const arrayFields: string[] = [];

        const exploreFields = (obj: any, prefix: string = ''): void => {
            for (const [field, value] of Object.entries(obj)) {
                if (field === 'id') continue; // Skip ID field

                const fieldName = prefix ? `${prefix}.${field}` : field;

                if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
                    arrayFields.push(fieldName);
                } else if (typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)) {
                    // Recursively explore nested objects
                    exploreFields(value, fieldName);
                }
            }
        };

        exploreFields(document);
        return arrayFields;
    }

    /**
     * Extract text fields from a document
     */
    static extractTextFields(document: DocumentLike, textFields?: string[], arrayFields?: string[]): Map<string, string> {
        const extractedFields = new Map<string, string>();

        // Use provided text fields or detect dynamically
        const textFieldsToCheck = textFields || this.detectTextFields(document);

        for (const field of textFieldsToCheck) {
            const fieldValue = this.getNestedFieldValue(document, field);
            if (fieldValue && typeof fieldValue === 'string') {
                extractedFields.set(field, fieldValue);
            }
        }

        // Use provided array fields or detect dynamically
        const arrayFieldsToCheck = arrayFields || this.detectArrayFields(document);

        for (const field of arrayFieldsToCheck) {
            const fieldValue = this.getNestedFieldValue(document, field);
            if (fieldValue && Array.isArray(fieldValue)) {
                extractedFields.set(field, fieldValue.join(' '));
            }
        }

        return extractedFields;
    }

    private static getNestedFieldValue(obj: any, fieldPath: string): any {
        const parts = fieldPath.split('.');
        let current = obj;

        for (const part of parts) {
            if (current && typeof current === 'object' && part in current) {
                current = current[part];
            } else {
                return undefined;
            }
        }

        return current;
    }
}

export class QueryTokenizationService {
    constructor(
        private readonly tokenizer: SharedMemoryTokenizer
    ) { }

    /**
     * Tokenize a query object
     */
    tokenizeQuery(query: QueryLike): Map<string, TokenizedQuery> {
        const tokenizedQueries = new Map<string, TokenizedQuery>();

        if (!query || typeof query !== 'object') {
            return tokenizedQueries;
        }

        // Handle different query types
        if ('match' in query && query.match) {
            const field = query.match.field || 'content';
            const value = query.match.value;
            const analyzer = this.tokenizer.getAnalyzerForField(field);
            const tokens = this.tokenizer.tokenize(value, analyzer);
            tokenizedQueries.set('match', { field, tokens });
        }

        if ('term' in query && query.term) {
            const field = query.term.field || 'content';
            const value = query.term.value;
            const analyzer = this.tokenizer.getAnalyzerForField(field);
            const tokens = this.tokenizer.tokenize(value, analyzer);
            tokenizedQueries.set('term', { field, tokens });
        }

        if ('prefix' in query && query.prefix) {
            const field = query.prefix.field || 'content';
            const value = query.prefix.value;
            const analyzer = this.tokenizer.getAnalyzerForField(field);
            const tokens = this.tokenizer.tokenize(value, analyzer);
            tokenizedQueries.set('prefix', { field, tokens });
        }

        if ('wildcard' in query && query.wildcard) {
            const field = query.wildcard.field || 'content';
            const value = query.wildcard.value;
            // For wildcard, we need to extract meaningful tokens without wildcards
            const cleanValue = value.replace(/[\*\?]/g, '');
            const analyzer = this.tokenizer.getAnalyzerForField(field);
            const tokens = this.tokenizer.tokenize(cleanValue, analyzer);
            tokenizedQueries.set('wildcard', { field, tokens, originalValue: value });
        }

        if ('fuzzy' in query && query.fuzzy) {
            const field = query.fuzzy.field || 'content';
            const value = query.fuzzy.value;
            const analyzer = this.tokenizer.getAnalyzerForField(field);
            const tokens = this.tokenizer.tokenize(value, analyzer);
            tokenizedQueries.set('fuzzy', {
                field,
                tokens,
                fuzziness: query.fuzzy.fuzziness || 2
            });
        }

        return tokenizedQueries;
    }
}

export class HashingService {
    /**
     * Hash a token for consistent shared memory addressing
     */
    static hashToken(token: string): number {
        let hash = 0;
        if (token.length === 0) return hash;

        for (let i = 0; i < token.length; i++) {
            const char = token.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }

        return Math.abs(hash);
    }
}

/**
 * SharedMemoryTokenizer - Wrapper around the domain Tokenizer optimized for SharedArrayBuffer usage
 * Provides token caching and optimization for high-performance shared memory operations
 */
export default class SharedMemoryTokenizer {
    private readonly stopwordsManager: StopwordsManager;
    private readonly tokenizer: Tokenizer;
    private readonly tokenCache: Map<string, string[]> = new Map();
    private readonly maxCacheSize: number;
    private readonly defaultAnalyzer: string;
    private readonly fieldAnalyzers: Map<string, string> = new Map();
    private readonly textFields: string[] | null;
    private readonly arrayFields: string[] | null;
    private readonly stats: TokenizationStatistics;
    private readonly queryTokenizationService: QueryTokenizationService;

    constructor(options: SharedMemoryTokenizerOptions = {}) {
        // Initialize stopwords manager
        this.stopwordsManager = new StopwordsManager();

        // Initialize the domain tokenizer
        this.tokenizer = new Tokenizer(this.stopwordsManager, {
            stemming: options.stemming || false,
            stemmingOptions: options.stemmingOptions || {}
        });

        // Configuration
        this.maxCacheSize = options.maxCacheSize || 1000;
        this.defaultAnalyzer = options.defaultAnalyzer || 'standard';
        this.textFields = options.textFields || null;
        this.arrayFields = options.arrayFields || null;

        // Initialize field analyzers
        if (options.fieldAnalyzers) {
            for (const [field, analyzer] of Object.entries(options.fieldAnalyzers)) {
                this.fieldAnalyzers.set(field, analyzer);
            }
        }

        // Statistics tracking
        this.stats = new TokenizationStatistics();

        // Initialize query tokenization service
        this.queryTokenizationService = new QueryTokenizationService(this);
    }

    /**
     * Tokenize text with caching for performance
     */
    tokenize(text: string, analyzer: string | null = null): string[] {
        if (!text || typeof text !== 'string') {
            return [];
        }

        // Use provided analyzer or default
        const useAnalyzer = analyzer || this.defaultAnalyzer;

        // Create cache key
        const cacheKey = `${useAnalyzer}:${text}`;

        // Check cache first
        if (this.tokenCache.has(cacheKey)) {
            this.stats.recordCacheHit();
            return this.tokenCache.get(cacheKey)!;
        }

        // Tokenize using the domain tokenizer
        const tokens = this.tokenizer.tokenize(text, useAnalyzer as any);

        // Cache the result (with size limit)
        if (this.tokenCache.size >= this.maxCacheSize) {
            // Remove oldest entry
            const firstKey = this.tokenCache.keys().next().value;
            if (firstKey) {
                this.tokenCache.delete(firstKey);
            }
        }

        this.tokenCache.set(cacheKey, tokens);
        this.stats.recordTokenization();

        return tokens;
    }

    /**
     * Tokenize with stemming support
     */
    async tokenizeWithStemming(text: string, analyzer: string | null = null, options: TokenizationOptions = {}): Promise<string[]> {
        if (!text || typeof text !== 'string') {
            return [];
        }

        const useAnalyzer = analyzer || this.defaultAnalyzer;

        // Use stemming tokenizer
        const tokens = await this.tokenizer.tokenizeWithStemming(text, useAnalyzer as any, options);

        return tokens;
    }

    /**
     * Tokenize all text fields in a document
     */
    tokenizeDocument(document: DocumentLike): Map<string, TokenizationResult> {
        const tokenizedFields = new Map<string, TokenizationResult>();

        // Extract text fields from document
        const textFields = FieldDetectionService.extractTextFields(document, this.textFields || undefined, this.arrayFields || undefined);

        // Tokenize each text field
        for (const [field, text] of textFields) {
            const analyzer = this.getAnalyzerForField(field);
            const tokens = this.tokenize(text, analyzer);
            tokenizedFields.set(field, new TokenizationResult(tokens, field, analyzer));
        }

        return tokenizedFields;
    }

    /**
     * Tokenize a query object
     */
    tokenizeQuery(query: QueryLike): Map<string, TokenizedQuery> {
        return this.queryTokenizationService.tokenizeQuery(query);
    }

    /**
     * Extract text fields from a document
     */
    extractTextFields(document: DocumentLike): Map<string, string> {
        return FieldDetectionService.extractTextFields(document, this.textFields || undefined, this.arrayFields || undefined);
    }

    /**
     * Get analyzer for a specific field
     */
    getAnalyzerForField(field: string): string {
        // Use configured field analyzer or default
        return this.fieldAnalyzers.get(field) || this.defaultAnalyzer;
    }

    /**
     * Set analyzer for a specific field
     */
    setFieldAnalyzer(field: string, analyzer: string): void {
        this.fieldAnalyzers.set(field, analyzer);
    }

    /**
     * Clear tokenization cache
     */
    clearCache(): void {
        this.tokenCache.clear();
        this.stats.reset();
    }

    /**
     * Get tokenization statistics
     */
    getStats(): TokenizationStatsData & { cacheSize: number; maxCacheSize: number } {
        return {
            ...this.stats.toPlainObject(),
            cacheSize: this.tokenCache.size,
            maxCacheSize: this.maxCacheSize
        };
    }

    /**
     * Hash a token for consistent shared memory addressing
     */
    hashToken(token: string): number {
        return HashingService.hashToken(token);
    }

    /**
     * Get available analyzers
     */
    getAvailableAnalyzers(): string[] {
        return (this.tokenizer as any).getAvailableAnalyzers?.() || [];
    }

    /**
     * Check if analyzer is valid
     */
    isValidAnalyzer(analyzer: string): boolean {
        return (this.tokenizer as any).isValidAnalyzer?.(analyzer) || false;
    }
}

// Type Definitions
export interface SharedMemoryTokenizerOptions {
    stemming?: boolean;
    stemmingOptions?: Record<string, any>;
    maxCacheSize?: number;
    defaultAnalyzer?: string;
    fieldAnalyzers?: Record<string, string>;
    textFields?: string[];
    arrayFields?: string[];
}

export interface TokenizationOptions {
    [key: string]: any;
}

export interface DocumentLike {
    id?: string;
    [key: string]: any;
}

export interface QueryLike {
    match?: {
        field?: string;
        value: string;
    };
    term?: {
        field?: string;
        value: string;
    };
    prefix?: {
        field?: string;
        value: string;
    };
    wildcard?: {
        field?: string;
        value: string;
    };
    fuzzy?: {
        field?: string;
        value: string;
        fuzziness?: number;
    };
    [key: string]: any;
}

export interface TokenizedQuery {
    field: string;
    tokens: string[];
    originalValue?: string;
    fuzziness?: number;
}

export interface TokenizationStatsData {
    tokenizations: number;
    cacheHits: number;
    cacheMisses: number;
    cacheHitRate: string;
}