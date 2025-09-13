/**
 * IndexName Value Object
 * Represents an index name with validation and normalization
 */
export class IndexName {
    private readonly _value: string;

    constructor(value: string) {
        if (!value || typeof value !== 'string') {
            throw new Error('IndexName must be a non-empty string');
        }

        if (value.length > 255) {
            throw new Error('IndexName cannot exceed 255 characters');
        }

        // Validate index name format (lowercase alphanumeric, hyphens, underscores)
        if (!/^[a-z0-9_-]+$/.test(value)) {
            throw new Error('IndexName can only contain lowercase alphanumeric characters, hyphens, and underscores');
        }

        // Cannot start with underscore or hyphen
        if (value.startsWith('_') || value.startsWith('-')) {
            throw new Error('IndexName cannot start with underscore or hyphen');
        }

        this._value = value;
        Object.freeze(this);
    }

    get value(): string {
        return this._value;
    }

    equals(other: IndexName): boolean {
        if (!(other instanceof IndexName)) {
            return false;
        }
        return this._value === other._value;
    }

    toString(): string {
        return this._value;
    }

    isDefault(): boolean {
        return this._value === 'default';
    }

    static fromString(value: string): IndexName {
        return new IndexName(value);
    }

    static default(): IndexName {
        return new IndexName('default');
    }

    static normalize(value: string): string {
        if (!value || typeof value !== 'string') {
            return value;
        }

        // Convert to lowercase and replace invalid characters
        return value.toLowerCase()
            .replace(/[^a-z0-9_-]/g, '_')
            .replace(/^[_-]+/, '')
            .replace(/[_-]+$/, '')
            .substring(0, 255);
    }

    static isValid(value: string): boolean {
        try {
            new IndexName(value);
            return true;
        } catch {
            return false;
        }
    }
}