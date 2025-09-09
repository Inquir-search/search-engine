/**
 * FieldType Value Object
 * Represents a field type with validation and behavior
 */
export class FieldType {
    static readonly TEXT = 'text';
    static readonly KEYWORD = 'keyword';
    static readonly NUMBER = 'number';
    static readonly INTEGER = 'integer';
    static readonly FLOAT = 'float';
    static readonly DOUBLE = 'double';
    static readonly LONG = 'long';
    static readonly SHORT = 'short';
    static readonly BYTE = 'byte';
    static readonly BOOLEAN = 'boolean';
    static readonly DATE = 'date';
    static readonly GEO_POINT = 'geo_point';
    static readonly EMAIL = 'email';
    static readonly URL = 'url';
    static readonly PHONE = 'phone';
    static readonly OBJECT = 'object';

    static readonly VALID_TYPES = [
        FieldType.TEXT,
        FieldType.KEYWORD,
        FieldType.NUMBER,
        FieldType.INTEGER,
        FieldType.FLOAT,
        FieldType.DOUBLE,
        FieldType.LONG,
        FieldType.SHORT,
        FieldType.BYTE,
        FieldType.BOOLEAN,
        FieldType.DATE,
        FieldType.GEO_POINT,
        FieldType.EMAIL,
        FieldType.URL,
        FieldType.PHONE,
        FieldType.OBJECT
    ] as const;

    private readonly _value: string;

    constructor(value: string) {
        if (!value || typeof value !== 'string') {
            throw new Error('FieldType must be a non-empty string');
        }

        if (!FieldType.VALID_TYPES.includes(value as any)) {
            throw new Error(`Invalid field type: ${value}. Must be one of: ${FieldType.VALID_TYPES.join(', ')}`);
        }

        this._value = value;
        Object.freeze(this);
    }

    get value(): string {
        return this._value;
    }

    equals(other: FieldType): boolean {
        if (!(other instanceof FieldType)) {
            return false;
        }
        return this._value === other._value;
    }

    toString(): string {
        return this._value;
    }

    isTextual(): boolean {
        return [FieldType.TEXT, FieldType.KEYWORD, FieldType.EMAIL, FieldType.URL, FieldType.PHONE].includes(this._value);
    }

    isNumeric(): boolean {
        return [FieldType.NUMBER, FieldType.INTEGER, FieldType.FLOAT, FieldType.DOUBLE, FieldType.LONG, FieldType.SHORT, FieldType.BYTE].includes(this._value);
    }

    isSearchable(): boolean {
        return this.isTextual() || this._value === FieldType.BOOLEAN;
    }

    isAggregatable(): boolean {
        return this._value === FieldType.KEYWORD || this.isNumeric() || this._value === FieldType.BOOLEAN || this._value === FieldType.DATE;
    }

    isSortable(): boolean {
        return this.isNumeric() || this._value === FieldType.KEYWORD || this._value === FieldType.DATE;
    }

    getDefaultAnalyzer(): string {
        switch (this._value) {
            case FieldType.TEXT:
                return 'standard';
            case FieldType.EMAIL:
                return 'email';
            case FieldType.URL:
                return 'url';
            case FieldType.PHONE:
                return 'phone';
            default:
                return 'keyword';
        }
    }

    validateValue(value: any): boolean {
        switch (this._value) {
            case FieldType.TEXT:
            case FieldType.KEYWORD:
                return typeof value === 'string';
            case FieldType.EMAIL:
                return typeof value === 'string' && /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$/.test(value);
            case FieldType.URL:
                return typeof value === 'string' && /^https?:\/\/.+/.test(value);
            case FieldType.PHONE:
                return typeof value === 'string' && /^[\+]?[1-9][\d]{0,15}$/.test(value.replace(/[\s\-\(\)\.]/g, ''));
            case FieldType.NUMBER:
            case FieldType.INTEGER:
            case FieldType.FLOAT:
            case FieldType.DOUBLE:
            case FieldType.LONG:
            case FieldType.SHORT:
            case FieldType.BYTE:
                return typeof value === 'number';
            case FieldType.BOOLEAN:
                return typeof value === 'boolean';
            case FieldType.DATE:
                return value instanceof Date || !isNaN(Date.parse(value));
            case FieldType.GEO_POINT:
                return Array.isArray(value) && value.length === 2 && value.every(n => typeof n === 'number') ||
                    (typeof value === 'object' && value !== null && typeof value.lat === 'number' && typeof value.lon === 'number');
            case FieldType.OBJECT:
                return typeof value === 'object' && value !== null;
            default:
                return true;
        }
    }

    static fromString(value: string): FieldType {
        return new FieldType(value);
    }

    static text(): FieldType {
        return new FieldType(FieldType.TEXT);
    }

    static keyword(): FieldType {
        return new FieldType(FieldType.KEYWORD);
    }

    static number(): FieldType {
        return new FieldType(FieldType.NUMBER);
    }

    static boolean(): FieldType {
        return new FieldType(FieldType.BOOLEAN);
    }

    static date(): FieldType {
        return new FieldType(FieldType.DATE);
    }

    static geoPoint(): FieldType {
        return new FieldType(FieldType.GEO_POINT);
    }

    static email(): FieldType {
        return new FieldType(FieldType.EMAIL);
    }

    static url(): FieldType {
        return new FieldType(FieldType.URL);
    }

    static phone(): FieldType {
        return new FieldType(FieldType.PHONE);
    }

    static object(): FieldType {
        return new FieldType(FieldType.OBJECT);
    }

    static isValid(value: string): boolean {
        try {
            new FieldType(value);
            return true;
        } catch {
            return false;
        }
    }
}