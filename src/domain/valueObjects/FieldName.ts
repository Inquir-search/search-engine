/**
 * FieldName Value Object
 * Represents a field name in a document with validation and normalization
 */
export class FieldName {
    private readonly _value: string;

    constructor(value: string) {
        if (!value || typeof value !== 'string') {
            throw new Error('FieldName must be a non-empty string');
        }

        if (value.length > 100) {
            throw new Error('FieldName cannot exceed 100 characters');
        }

        // Validate field name format (alphanumeric, dots, underscores)
        if (!/^[a-zA-Z0-9._-]+$/.test(value)) {
            throw new Error('FieldName can only contain alphanumeric characters, dots, underscores, and hyphens');
        }

        this._value = value;
        Object.freeze(this);
    }

    get value(): string {
        return this._value;
    }

    equals(other: FieldName): boolean {
        if (!(other instanceof FieldName)) {
            return false;
        }
        return this._value === other._value;
    }

    toString(): string {
        return this._value;
    }

    isNested(): boolean {
        return this._value.includes('.');
    }

    getParentField(): FieldName | null {
        const lastDotIndex = this._value.lastIndexOf('.');
        if (lastDotIndex === -1) {
            return null;
        }
        return new FieldName(this._value.substring(0, lastDotIndex));
    }

    getFieldName(): string {
        const lastDotIndex = this._value.lastIndexOf('.');
        if (lastDotIndex === -1) {
            return this._value;
        }
        return this._value.substring(lastDotIndex + 1);
    }

    static fromString(value: string): FieldName {
        return new FieldName(value);
    }

    static isValid(value: string): boolean {
        try {
            new FieldName(value);
            return true;
        } catch {
            return false;
        }
    }
}