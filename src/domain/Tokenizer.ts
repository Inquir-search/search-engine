import { Stemmer } from '../lib/Stemmer.js';

/**
 * Analyzer Types
 */
export enum AnalyzerType {
    STANDARD = 'standard',
    SIMPLE = 'simple',
    WHITESPACE = 'whitespace',
    KEYWORD = 'keyword',
    PATTERN = 'pattern',
    EMAIL = 'email',
    URL = 'url',
    PHONE = 'phone',
    ADVANCED = 'advanced',
    STEMMING = 'stemming',
    CUSTOM = 'custom'
}

/**
 * Tokenizer Options
 */
export interface TokenizerOptions {
    stemming?: boolean;
    stemmingOptions?: Record<string, any>;
}

/**
 * Stemming Options
 */
export interface StemmingOptions {
    language?: string;
    aggressive?: boolean;
    customRules?: Record<string, string>;
}

/**
 * Custom Analyzer Options
 */
export interface CustomAnalyzerOptions {
    lowercase?: boolean;
    removeStopwords?: boolean;
    minLength?: number;
    maxLength?: number;
    preserveHyphens?: boolean;
    preserveApostrophes?: boolean;
    customPattern?: string;
}

/**
 * Stemming Statistics
 */
export interface StemmingStats {
    enabled: boolean;
    cacheSize?: number;
    hitRate?: number;
    [key: string]: any;
}

/**
 * Stopwords Manager Interface
 */
export interface IStopwordsManager {
    getAll(): string[];
    has(word: string): boolean;
}

/**
 * Tokenizer Interface
 */
export interface ITokenizer {
    tokenize(text: string, analyzer?: AnalyzerType): string[];
    tokenizeWithStemming(text: string, analyzer?: AnalyzerType, options?: StemmingOptions): Promise<string[]>;
    setStemming(enabled: boolean, options?: StemmingOptions): void;
}

/**
 * Tokenizer Domain Service
 * Handles text tokenization with various analyzers and stemming support
 */
export default class Tokenizer implements ITokenizer {
    private readonly stopwordsManager: IStopwordsManager;
    private readonly stopwordsSet: Set<string>;
    private stemmingEnabled: boolean;
    private stemmingOptions: Record<string, any>;
    private stemmer?: Stemmer;

    constructor(stopwordsManager: IStopwordsManager, options: TokenizerOptions = {}) {
        if (!stopwordsManager) {
            throw new Error('Stopwords manager is required');
        }

        this.stopwordsManager = stopwordsManager;
        this.stopwordsSet = new Set(this.stopwordsManager.getAll());

        // Initialize stemmer if stemming is enabled
        this.stemmingEnabled = options.stemming || false;
        this.stemmingOptions = options.stemmingOptions || {};

        if (this.stemmingEnabled) {
            this.stemmer = new Stemmer(this.stemmingOptions);
        }
    }

    /**
     * Main tokenize method that applies the default analyzer (synchronous)
     * @param text - Text to tokenize
     * @param analyzer - Analyzer type to use
     * @returns Array of tokens
     */
    tokenize(text: string, analyzer: AnalyzerType = AnalyzerType.STANDARD): string[] {
        if (!text || typeof text !== 'string') {
            return [];
        }

        switch (analyzer) {
            case AnalyzerType.STANDARD:
                return this.standardAnalyzer(text);
            case AnalyzerType.SIMPLE:
                return this.simpleAnalyzer(text);
            case AnalyzerType.WHITESPACE:
                return this.whitespaceAnalyzer(text);
            case AnalyzerType.KEYWORD:
                return this.keywordAnalyzer(text);
            case AnalyzerType.PATTERN:
                return this.patternAnalyzer(text);
            case AnalyzerType.EMAIL:
                return this.emailAnalyzer(text);
            case AnalyzerType.URL:
                return this.urlAnalyzer(text);
            case AnalyzerType.PHONE:
                return this.phoneAnalyzer(text);
            case AnalyzerType.ADVANCED:
                return this.advancedAnalyzer(text);
            default:
                return this.standardAnalyzer(text);
        }
    }

    /**
     * Async tokenize method that supports stemming
     * @param text - Text to tokenize
     * @param analyzer - Analyzer type to use
     * @param options - Stemming options
     * @returns Promise resolving to array of tokens
     */
    async tokenizeWithStemming(text: string, analyzer: AnalyzerType = AnalyzerType.STANDARD, options: StemmingOptions = {}): Promise<string[]> {
        if (!text || typeof text !== 'string') {
            return [];
        }

        let tokens: string[];
        if (analyzer === AnalyzerType.STEMMING) {
            tokens = await this.stemmingAnalyzer(text, options);
        } else {
            tokens = this.tokenize(text, analyzer);

            // Apply stemming if enabled and stemmer is available
            if (this.stemmingEnabled && this.stemmer && tokens.length > 0) {
                try {
                    const stemmedTokens = await this.stemmer.stemWords(tokens, text);
                    return stemmedTokens;
                } catch (error) {
                    console.error('Stemming error:', error);
                    return tokens; // Fallback to original tokens
                }
            }
        }

        return tokens;
    }

    /**
     * Standard analyzer - handles most text with proper punctuation and special character handling
     */
    private standardAnalyzer(text: string): string[] {
        return text
            .toLowerCase()
            // Handle contractions and possessives
            .replace(/(\w+)'(\w+)/g, '$1 $2') // don't -> don t, can't -> can t
            .replace(/(\w+)'s\b/g, '$1') // cat's -> cat
            .replace(/(\w+)s'\b/g, '$1s') // cats' -> cats
            // Handle special characters and punctuation
            .replace(/[^\w\s\-\.]/g, ' ') // Replace punctuation with spaces, keep hyphens and dots
            .replace(/\.+/g, ' ') // Replace multiple dots with space
            .replace(/\-+/g, ' ') // Replace multiple hyphens with space
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim()
            .split(' ')
            .filter(Boolean)
            .filter(token => !this.stopwordsSet.has(token) && token.length > 1);
    }

    /**
     * Simple analyzer - basic word splitting with minimal processing
     */
    private simpleAnalyzer(text: string): string[] {
        return text
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ') // Remove all non-word characters
            .replace(/\s+/g, ' ')
            .trim()
            .split(' ')
            .filter(Boolean)
            .filter(token => !this.stopwordsSet.has(token));
    }

    /**
     * Whitespace analyzer - splits only on whitespace, preserves all characters
     */
    private whitespaceAnalyzer(text: string): string[] {
        return text
            .split(/\s+/)
            .filter(Boolean)
            .filter(token => !this.stopwordsSet.has(token.toLowerCase()));
    }

    /**
     * Keyword analyzer - treats the entire text as a single token
     */
    private keywordAnalyzer(text: string): string[] {
        return text.trim() ? [text.trim()] : [];
    }

    /**
     * Pattern analyzer - uses regex patterns for specific tokenization
     */
    private patternAnalyzer(text: string): string[] {
        const tokens: string[] = [];

        // Extract words with optional hyphens and apostrophes
        const wordPattern = /\b[\w'-]+\b/g;
        let match: RegExpExecArray | null;

        while ((match = wordPattern.exec(text)) !== null) {
            const token = match[0].toLowerCase();
            if (token.length > 1 && !this.stopwordsSet.has(token)) {
                tokens.push(token);
            }
        }

        return tokens;
    }

    /**
     * Email analyzer - extracts and tokenizes email addresses
     */
    private emailAnalyzer(text: string): string[] {
        const tokens: string[] = [];

        // Extract email addresses
        const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
        let match: RegExpExecArray | null;

        while ((match = emailPattern.exec(text)) !== null) {
            const email = match[0].toLowerCase();
            tokens.push(email);

            // Also tokenize parts of the email
            const [local, domain] = email.split('@');
            if (local && local.length > 1) {
                tokens.push(local);
            }
            if (domain && domain.length > 1) {
                tokens.push(domain);
                // Add domain parts
                const domainParts = domain.split('.');
                domainParts.forEach(part => {
                    if (part.length > 1) {
                        tokens.push(part);
                    }
                });
            }
        }

        return tokens.filter(token => !this.stopwordsSet.has(token));
    }

    /**
     * URL analyzer - extracts and tokenizes URLs
     */
    private urlAnalyzer(text: string): string[] {
        const tokens: string[] = [];

        // Extract URLs
        const urlPattern = /https?:\/\/[^\s]+/g;
        let match: RegExpExecArray | null;

        while ((match = urlPattern.exec(text)) !== null) {
            const url = match[0].toLowerCase();
            tokens.push(url);

            // Parse URL parts
            try {
                const urlObj = new URL(url);

                // Add hostname
                if (urlObj.hostname) {
                    tokens.push(urlObj.hostname);
                    // Add hostname parts
                    const hostParts = urlObj.hostname.split('.');
                    hostParts.forEach(part => {
                        if (part.length > 1) {
                            tokens.push(part);
                        }
                    });
                }

                // Add pathname parts
                if (urlObj.pathname && urlObj.pathname !== '/') {
                    const pathParts = urlObj.pathname.split('/').filter(Boolean);
                    pathParts.forEach(part => {
                        if (part.length > 1) {
                            tokens.push(part);
                        }
                    });
                }
            } catch (error) {
                // If URL parsing fails, continue with basic tokenization
                }
        }

        return tokens.filter(token => !this.stopwordsSet.has(token));
    }

    /**
 * Phone analyzer - extracts and tokenizes phone numbers
 */
    private phoneAnalyzer(text: string): string[] {
        const tokens: string[] = [];

        // Enhanced phone number regex: matches various formats including parentheses
        const phonePattern = /((\+\d{1,3}[-.\s]?)?(\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4})/g;
        let match: RegExpExecArray | null;
        while ((match = phonePattern.exec(text)) !== null) {
            const phone = match[0];
            tokens.push(phone);

            // Extract just the digits
            const digits = phone.replace(/\D/g, '');
            if (digits.length >= 10) {
                tokens.push(digits);

                // Extract area code (first 3 digits after country code)
                let areaCode = '';
                if (digits.length > 10) {
                    // International format: country code + area code
                    areaCode = digits.substring(digits.length - 10, digits.length - 7);
                } else {
                    // US format: first 3 digits are area code
                    areaCode = digits.substring(0, 3);
                }
                if (areaCode) {
                    tokens.push(areaCode);
                }

                // Extract middle 3 digits (exchange)
                const middle = digits.length > 10
                    ? digits.substring(digits.length - 7, digits.length - 4)
                    : digits.substring(3, 6);
                if (middle) {
                    tokens.push(middle);
                }

                // Extract last 4 digits
                const last = digits.substring(digits.length - 4);
                if (last) {
                    tokens.push(last);
                }
            }
        }

        // If no full phone number was found, check if the input is a short numeric string
        // that could be a phone number component (area code, exchange, etc.)
        if (tokens.length === 0 && /^\d{3,4}$/.test(text.trim())) {
            // For short numeric strings, just return the string as-is
            tokens.push(text.trim());
        }

        return [...new Set(tokens)]; // Remove duplicates
    }

    /**
     * Advanced analyzer - comprehensive text analysis
     */
    private advancedAnalyzer(text: string): string[] {
        // Combine multiple analyzers
        const standardTokens = this.standardAnalyzer(text);
        const emailTokens = this.emailAnalyzer(text);
        const urlTokens = this.urlAnalyzer(text);
        const phoneTokens = this.phoneAnalyzer(text);

        // Merge and deduplicate
        const allTokens = new Set([...standardTokens, ...emailTokens, ...urlTokens, ...phoneTokens]);
        return Array.from(allTokens);
    }

    /**
     * Stemming analyzer - uses stemming for token processing
     */
    private async stemmingAnalyzer(text: string, options: StemmingOptions = {}): Promise<string[]> {
        if (!this.stemmer) {
            throw new Error('Stemmer not initialized');
        }

        const tokens = this.standardAnalyzer(text);
        if (tokens.length === 0) {
            return tokens;
        }

        try {
            return await this.stemmer.stemWords(tokens, text);
        } catch (error) {
            console.error('Stemming error:', error);
            return tokens;
        }
    }

    /**
     * Custom analyzer with configurable options
     */
    customAnalyzer(text: string, options: CustomAnalyzerOptions = {}): string[] {
        const {
            lowercase = true,
            removeStopwords = true,
            minLength = 1,
            maxLength = Infinity,
            preserveHyphens = false,
            preserveApostrophes = false,
            customPattern = null
        } = options;

        let processed = text;

        if (lowercase) {
            processed = processed.toLowerCase();
        }

        if (customPattern) {
            // Use custom regex pattern
            const matches = processed.match(new RegExp(customPattern, 'g')) || [];
            return matches.filter(token => {
                if (removeStopwords && this.stopwordsSet.has(token)) return false;
                if (token.length < minLength || token.length > maxLength) return false;
                return true;
            });
        }

        // Default processing
        if (!preserveApostrophes) {
            processed = processed.replace(/'/g, ' ');
        }

        if (!preserveHyphens) {
            processed = processed.replace(/-/g, ' ');
        }

        processed = processed
            .replace(/[^\w\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        const tokens = processed.split(' ')
            .filter(Boolean)
            .filter(token => {
                if (removeStopwords && this.stopwordsSet.has(token)) return false;
                if (token.length < minLength || token.length > maxLength) return false;
                return true;
            });

        return tokens;
    }

    /**
     * Enable or disable stemming
     * @param enabled - Whether to enable stemming
     * @param options - Stemming options
     */
    setStemming(enabled: boolean, options: StemmingOptions = {}): void {
        this.stemmingEnabled = enabled;
        if (enabled && !this.stemmer) {
            this.stemmer = new Stemmer({ ...this.stemmingOptions, ...options });
        } else if (enabled && this.stemmer) {
            this.stemmer.configure(options);
        }
    }

    /**
     * Get stemming statistics
     * @returns Stemming statistics
     */
    getStemmingStats(): StemmingStats {
        if (!this.stemmer) {
            return { enabled: false };
        }
        return {
            enabled: this.stemmingEnabled,
            ...this.stemmer.getStats()
        };
    }

    /**
     * Clear stemming cache
     */
    clearStemmingCache(): void {
        if (this.stemmer) {
            this.stemmer.clearCache();
        }
    }

    /**
     * Get supported analyzer types
     */
    static getSupportedAnalyzers(): AnalyzerType[] {
        return Object.values(AnalyzerType);
    }

    /**
     * Check if an analyzer is supported
     */
    static isAnalyzerSupported(analyzer: string): boolean {
        return Object.values(AnalyzerType).includes(analyzer as AnalyzerType);
    }
}

export { Tokenizer };