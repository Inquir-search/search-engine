/**
 * SnowballStemmer - A wrapper around individual language stemmers
 * Dynamically loads stemmers based on language code
 */
export class SnowballStemmer {
    private readonly stemmers: Map<string, StemmerFunction> = new Map();
    private readonly supportedLanguages: string[] = [
        'am', 'ar', 'bg', 'de', 'dk', 'en', 'es', 'fi', 'fr', 'gr',
        'hu', 'id', 'ie', 'in', 'it', 'lt', 'nl', 'no', 'np', 'pt',
        'ro', 'rs', 'ru', 'se', 'sk', 'ta', 'tr', 'uk'
    ];

    /**
     * Stem a word using the appropriate language stemmer
     * @param word - Word to stem
     * @param language - Language code (e.g., 'en', 'fr', 'es')
     * @returns Stemmed word
     */
    async stem(word: string, language: string = 'en'): Promise<string> {
        if (!word || typeof word !== 'string') {
            return word;
        }

        const lang = language.toLowerCase();

        // Check if language is supported
        if (!this.supportedLanguages.includes(lang)) {
            return await this._stemWithLanguage(word, 'en');
        }

        return await this._stemWithLanguage(word, lang);
    }

    /**
     * Stem a word with a specific language
     */
    private async _stemWithLanguage(word: string, language: string): Promise<string> {
        try {
            // Get or load the stemmer for this language
            const stemmer = await this._getStemmer(language);
            if (stemmer) {
                return stemmer(word);
            }
        } catch (error) {
            console.error(`Error stemming word '${word}' with language '${language}':`, error);
        }

        // Fallback to original word
        return word;
    }

    /**
     * Get or load a stemmer for a specific language
     */
    private async _getStemmer(language: string): Promise<StemmerFunction | null> {
        if (this.stemmers.has(language)) {
            return this.stemmers.get(language)!;
        }

        try {
            // Dynamic import of the stemmer
            const stemmerModule = await this._importStemmer(language);
            if (stemmerModule && stemmerModule.stemmer) {
                this.stemmers.set(language, stemmerModule.stemmer);
                return stemmerModule.stemmer;
            }
        } catch (error) {
            console.error(`Failed to load stemmer for language '${language}':`, error);
        }

        return null;
    }

    /**
     * Import a stemmer module dynamically
     */
    private async _importStemmer(language: string): Promise<StemmerModule | null> {
        try {
            // Dynamic import of the actual stemmer file
            const stemmerPath = `./stemmers/${language}.js`;
            const stemmerModule = await import(stemmerPath);

            if (stemmerModule && stemmerModule.stemmer) {
                return stemmerModule;
            }
        } catch (error) {
            console.error(`Error importing stemmer for ${language}:`, error);
            // Fallback to built-in stemmers
            return this._getBuiltInStemmer(language);
        }

        return null;
    }

    /**
     * Get built-in stemmer as fallback
     */
    private _getBuiltInStemmer(language: string): StemmerModule | null {
        const builtInStemmers: Record<string, StemmerFunction> = {
            'en': this._createEnglishStemmer(),
            'fr': this._createFrenchStemmer(),
            'es': this._createSpanishStemmer(),
            'de': this._createGermanStemmer(),
            'it': this._createItalianStemmer(),
            'pt': this._createPortugueseStemmer(),
            'nl': this._createDutchStemmer(),
            'ru': this._createRussianStemmer(),
            // Add more languages as needed
        };

        return builtInStemmers[language] ? { stemmer: builtInStemmers[language] } : null;
    }

    /**
     * Create English stemmer (simplified Porter algorithm)
     */
    private _createEnglishStemmer(): StemmerFunction {
        return (word: string): string => {
            if (word.length < 3) return word;

            // Simple English stemming rules
            let stem = word.toLowerCase();

            // Remove common suffixes
            if (stem.endsWith('ing')) {
                stem = stem.slice(0, -3);
                if (stem.length >= 3) return stem;
            }
            if (stem.endsWith('ed')) {
                stem = stem.slice(0, -2);
                if (stem.length >= 3) return stem;
            }
            if (stem.endsWith('er')) {
                stem = stem.slice(0, -2);
                if (stem.length >= 3) return stem;
            }
            if (stem.endsWith('est')) {
                stem = stem.slice(0, -3);
                if (stem.length >= 3) return stem;
            }
            if (stem.endsWith('ly')) {
                stem = stem.slice(0, -2);
                if (stem.length >= 3) return stem;
            }
            if (stem.endsWith('s')) {
                stem = stem.slice(0, -1);
                if (stem.length >= 3) return stem;
            }

            return stem;
        };
    }

    /**
     * Create French stemmer (simplified)
     */
    private _createFrenchStemmer(): StemmerFunction {
        return (word: string): string => {
            if (word.length < 3) return word;

            let stem = word.toLowerCase();

            // Simple French stemming
            if (stem.endsWith('ement')) {
                stem = stem.slice(0, -5);
            } else if (stem.endsWith('ation')) {
                stem = stem.slice(0, -4);
            } else if (stem.endsWith('ment')) {
                stem = stem.slice(0, -3);
            } else if (stem.endsWith('s')) {
                stem = stem.slice(0, -1);
            }

            return stem;
        };
    }

    /**
     * Create Spanish stemmer (simplified)
     */
    private _createSpanishStemmer(): StemmerFunction {
        return (word: string): string => {
            if (word.length < 3) return word;

            let stem = word.toLowerCase();

            // Simple Spanish stemming
            if (stem.endsWith('mente')) {
                stem = stem.slice(0, -5);
            } else if (stem.endsWith('ción')) {
                stem = stem.slice(0, -3) + 'c';
            } else if (stem.endsWith('s')) {
                stem = stem.slice(0, -1);
            }

            return stem;
        };
    }

    /**
     * Create German stemmer (simplified)
     */
    private _createGermanStemmer(): StemmerFunction {
        return (word: string): string => {
            if (word.length < 3) return word;

            let stem = word.toLowerCase();

            // Simple German stemming
            if (stem.endsWith('ung')) {
                stem = stem.slice(0, -3);
            } else if (stem.endsWith('heit')) {
                stem = stem.slice(0, -4);
            } else if (stem.endsWith('keit')) {
                stem = stem.slice(0, -4);
            } else if (stem.endsWith('en')) {
                stem = stem.slice(0, -2);
            } else if (stem.endsWith('er')) {
                stem = stem.slice(0, -2);
            } else if (stem.endsWith('e')) {
                stem = stem.slice(0, -1);
            }

            return stem;
        };
    }

    /**
     * Create Italian stemmer (simplified)
     */
    private _createItalianStemmer(): StemmerFunction {
        return (word: string): string => {
            if (word.length < 3) return word;

            let stem = word.toLowerCase();

            // Simple Italian stemming
            if (stem.endsWith('mente')) {
                stem = stem.slice(0, -5);
            } else if (stem.endsWith('zione')) {
                stem = stem.slice(0, -4);
            } else if (stem.endsWith('s')) {
                stem = stem.slice(0, -1);
            }

            return stem;
        };
    }

    /**
     * Create Portuguese stemmer (simplified)
     */
    private _createPortugueseStemmer(): StemmerFunction {
        return (word: string): string => {
            if (word.length < 3) return word;

            let stem = word.toLowerCase();

            // Simple Portuguese stemming
            if (stem.endsWith('mente')) {
                stem = stem.slice(0, -5);
            } else if (stem.endsWith('ção')) {
                stem = stem.slice(0, -3) + 'c';
            } else if (stem.endsWith('s')) {
                stem = stem.slice(0, -1);
            }

            return stem;
        };
    }

    /**
     * Create Dutch stemmer (simplified)
     */
    private _createDutchStemmer(): StemmerFunction {
        return (word: string): string => {
            if (word.length < 3) return word;

            let stem = word.toLowerCase();

            // Simple Dutch stemming
            if (stem.endsWith('heid')) {
                stem = stem.slice(0, -4);
            } else if (stem.endsWith('ing')) {
                stem = stem.slice(0, -3);
            } else if (stem.endsWith('en')) {
                stem = stem.slice(0, -2);
            } else if (stem.endsWith('e')) {
                stem = stem.slice(0, -1);
            }

            return stem;
        };
    }

    /**
     * Create Russian stemmer (simplified)
     */
    private _createRussianStemmer(): StemmerFunction {
        return (word: string): string => {
            if (word.length < 3) return word;

            let stem = word.toLowerCase();

            // Simple Russian stemming
            if (stem.endsWith('ость')) {
                stem = stem.slice(0, -3);
            } else if (stem.endsWith('ние')) {
                stem = stem.slice(0, -3);
            } else if (stem.endsWith('ая')) {
                stem = stem.slice(0, -2);
            } else if (stem.endsWith('ый')) {
                stem = stem.slice(0, -2);
            }

            return stem;
        };
    }

    /**
     * Get list of supported languages
     * @returns Array of supported language codes
     */
    getSupportedLanguages(): string[] {
        return [...this.supportedLanguages];
    }

    /**
     * Check if a language is supported
     * @param language - Language code
     * @returns Whether the language is supported
     */
    isLanguageSupported(language: string): boolean {
        return this.supportedLanguages.includes(language.toLowerCase());
    }

    /**
     * Get information about all available stemmers
     * @returns Information about stemmers
     */
    getAllStemmersInfo(): StemmerInfo {
        return {
            supportedLanguages: this.supportedLanguages,
            loadedStemmers: Array.from(this.stemmers.keys()),
            totalSupported: this.supportedLanguages.length,
            totalLoaded: this.stemmers.size
        };
    }

    /**
     * Clear the stemmer cache
     */
    clearCache(): void {
        this.stemmers.clear();
    }
}

export type StemmerFunction = (word: string) => string;

export interface StemmerModule {
    stemmer: StemmerFunction;
}

export interface StemmerInfo {
    supportedLanguages: string[];
    loadedStemmers: string[];
    totalSupported: number;
    totalLoaded: number;
}