/**
 * DocumentId Value Object
 * Represents a unique identifier for a document in the search engine
 */
export class DocumentId {
    private readonly _value: string;

    constructor(value: string) {
        if (!value || typeof value !== 'string') {
            throw new Error('DocumentId must be a non-empty string');
        }

        if (value.length > 255) {
            throw new Error('DocumentId cannot exceed 255 characters');
        }

        this._value = value;
        Object.freeze(this);
    }

    get value(): string {
        return this._value;
    }

    equals(other: DocumentId): boolean {
        if (!(other instanceof DocumentId)) {
            return false;
        }
        return this._value === other._value;
    }

    toString(): string {
        return this._value;
    }

    static fromString(value: string): DocumentId {
        return new DocumentId(value);
    }

    static isValid(value: string): boolean {
        try {
            new DocumentId(value);
            return true;
        } catch {
            return false;
        }
    }
}