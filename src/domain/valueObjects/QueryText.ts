/**
 * QueryText Value Object
 * Represents search query text with validation and normalization
 */
export class QueryText {
    private readonly _originalValue: string;
    private readonly _normalizedValue: string;

    constructor(value: string) {
        if (typeof value !== 'string') {
            throw new Error('QueryText must be a string');
        }

        if (value.length > 1000) {
            throw new Error('QueryText cannot exceed 1000 characters');
        }

        this._originalValue = value;
        this._normalizedValue = this._normalize(value);
        Object.freeze(this);
    }

    get value(): string {
        return this._normalizedValue;
    }

    get originalValue(): string {
        return this._originalValue;
    }

    equals(other: QueryText): boolean {
        if (!(other instanceof QueryText)) {
            return false;
        }
        return this._normalizedValue === other._normalizedValue;
    }

    toString(): string {
        return this._normalizedValue;
    }

    isEmpty(): boolean {
        return this._normalizedValue.trim() === '';
    }

    isMatchAll(): boolean {
        return this._normalizedValue === '*' || this._normalizedValue === '';
    }

    getTerms(): string[] {
        if (this.isEmpty()) {
            return [];
        }
        return this._normalizedValue.split(/\s+/).filter(term => term.length > 0);
    }

    getTermCount(): number {
        return this.getTerms().length;
    }

    containsWildcards(): boolean {
        return this._normalizedValue.includes('*') || this._normalizedValue.includes('?');
    }

    isPhrase(): boolean {
        return this._normalizedValue.includes('"');
    }

    private _normalize(value: string): string {
        return value.trim().replace(/\s+/g, ' ');
    }

    static fromString(value: string): QueryText {
        return new QueryText(value);
    }

    static empty(): QueryText {
        return new QueryText('');
    }

    static matchAll(): QueryText {
        return new QueryText('*');
    }

    static isValid(value: string): boolean {
        try {
            new QueryText(value);
            return true;
        } catch {
            return false;
        }
    }
}