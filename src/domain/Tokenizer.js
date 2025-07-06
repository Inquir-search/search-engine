export default class Tokenizer {
    constructor(stopwordsManager) {
        this.stopwordsManager = stopwordsManager;
        this.stopwordsSet = new Set(this.stopwordsManager.getAll());
    }

    /**
     * Main tokenize method that applies the default analyzer
     */
    tokenize(text, analyzer = 'standard') {
        if (!text || typeof text !== 'string') return [];

        switch (analyzer) {
            case 'standard':
                return this.standardAnalyzer(text);
            case 'simple':
                return this.simpleAnalyzer(text);
            case 'whitespace':
                return this.whitespaceAnalyzer(text);
            case 'keyword':
                return this.keywordAnalyzer(text);
            case 'pattern':
                return this.patternAnalyzer(text);
            case 'email':
                return this.emailAnalyzer(text);
            case 'url':
                return this.urlAnalyzer(text);
            case 'phone':
                return this.phoneAnalyzer(text);
            default:
                return this.standardAnalyzer(text);
        }
    }

    /**
     * Standard analyzer - handles most text with proper punctuation and special character handling
     */
    standardAnalyzer(text) {
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
    simpleAnalyzer(text) {
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
    whitespaceAnalyzer(text) {
        return text
            .split(/\s+/)
            .filter(Boolean)
            .filter(token => !this.stopwordsSet.has(token.toLowerCase()));
    }

    /**
     * Keyword analyzer - treats the entire text as a single token
     */
    keywordAnalyzer(text) {
        return text.trim() ? [text.trim()] : [];
    }

    /**
     * Pattern analyzer - uses regex patterns for specific tokenization
     */
    patternAnalyzer(text) {
        const tokens = [];

        // Extract words with optional hyphens and apostrophes
        const wordPattern = /\b[\w'-]+\b/g;
        let match;

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
    emailAnalyzer(text) {
        const tokens = [];

        // Extract email addresses
        const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
        let match;

        while ((match = emailPattern.exec(text)) !== null) {
            const email = match[0];
            // Tokenize email parts
            const [localPart, domain] = email.split('@');
            tokens.push(localPart.toLowerCase());
            tokens.push(domain.toLowerCase());

            // Tokenize domain parts
            const domainParts = domain.split('.');
            tokens.push(...domainParts.map(part => part.toLowerCase()));
        }

        return tokens.filter(token => token.length > 1);
    }

    /**
     * URL analyzer - extracts and tokenizes URLs
     */
    urlAnalyzer(text) {
        const tokens = [];

        // Extract URLs
        const urlPattern = /https?:\/\/[^\s]+/g;
        let match;

        while ((match = urlPattern.exec(text)) !== null) {
            const url = match[0];

            // Extract domain
            const domainMatch = url.match(/https?:\/\/([^\/\s]+)/);
            if (domainMatch) {
                const domain = domainMatch[1];
                tokens.push(domain.toLowerCase());

                // Tokenize domain parts
                const domainParts = domain.split('.');
                tokens.push(...domainParts.map(part => part.toLowerCase()));
            }

            // Extract path segments
            const pathMatch = url.match(/https?:\/\/[^\/\s]+(\/[^\s]*)/);
            if (pathMatch) {
                const path = pathMatch[1];
                const pathSegments = path.split('/').filter(Boolean);
                tokens.push(...pathSegments.map(segment => segment.toLowerCase()));
            }
        }

        return tokens.filter(token => token.length > 1);
    }

    /**
     * Phone analyzer - extracts and tokenizes phone numbers
     */
    phoneAnalyzer(text) {
        const tokens = [];

        // First, extract all digit sequences from the text
        const digitPattern = /\d+/g;
        let match;

        while ((match = digitPattern.exec(text)) !== null) {
            const digits = match[0];

            // Add the full digit sequence
            tokens.push(digits);

            // Add area code if it's a 10+ digit number
            if (digits.length >= 10) {
                tokens.push(digits.substring(0, 3));
            }

            // Extract all 3-digit sequences for better searching
            for (let i = 0; i <= digits.length - 3; i++) {
                const threeDigits = digits.substring(i, i + 3);
                if (threeDigits.length === 3) {
                    tokens.push(threeDigits);
                }
            }
        }

        // Also extract the full concatenated digits from the entire text
        const allDigits = text.replace(/\D/g, '');
        if (allDigits.length > 0) {
            tokens.push(allDigits);
        }

        // Remove duplicates while preserving order
        return [...new Set(tokens)];
    }

    /**
     * Advanced analyzer with multiple strategies
     */
    advancedAnalyzer(text) {
        const tokens = [];

        // Apply multiple analyzers and combine results
        const standardTokens = this.standardAnalyzer(text);
        const emailTokens = this.emailAnalyzer(text);
        const urlTokens = this.urlAnalyzer(text);
        const phoneTokens = this.phoneAnalyzer(text);

        tokens.push(...standardTokens, ...emailTokens, ...urlTokens, ...phoneTokens);

        // Remove duplicates while preserving order
        return [...new Set(tokens)];
    }

    /**
     * Custom analyzer with configurable options
     */
    customAnalyzer(text, options = {}) {
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
            .trim()
            .split(' ')
            .filter(Boolean)
            .filter(token => {
                if (removeStopwords && this.stopwordsSet.has(token)) return false;
                if (token.length < minLength || token.length > maxLength) return false;
                return true;
            });

        return processed;
    }
}
