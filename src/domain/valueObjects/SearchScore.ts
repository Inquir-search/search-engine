/**
 * SearchScore Value Object
 * Represents a relevance score for a document in search results
 */
export class SearchScore {
    private readonly _value: number;

    constructor(value: number) {
        if (typeof value !== 'number' || isNaN(value)) {
            throw new Error('SearchScore must be a valid number');
        }

        if (value < 0) {
            throw new Error('SearchScore cannot be negative');
        }

        if (!isFinite(value)) {
            throw new Error('SearchScore must be finite');
        }

        this._value = value;
        Object.freeze(this);
    }

    get value(): number {
        return this._value;
    }

    equals(other: SearchScore): boolean {
        if (!(other instanceof SearchScore)) {
            return false;
        }
        return this._value === other._value;
    }

    toString(): string {
        return this._value.toString();
    }

    isHigherThan(other: SearchScore): boolean {
        if (!(other instanceof SearchScore)) {
            throw new Error('Can only compare with another SearchScore');
        }
        return this._value > other._value;
    }

    isLowerThan(other: SearchScore): boolean {
        if (!(other instanceof SearchScore)) {
            throw new Error('Can only compare with another SearchScore');
        }
        return this._value < other._value;
    }

    add(other: SearchScore): SearchScore {
        if (!(other instanceof SearchScore)) {
            throw new Error('Can only add another SearchScore');
        }
        return new SearchScore(this._value + other._value);
    }

    multiply(factor: number): SearchScore {
        if (typeof factor !== 'number' || isNaN(factor) || factor < 0) {
            throw new Error('Factor must be a non-negative number');
        }
        return new SearchScore(this._value * factor);
    }

    normalize(maxScore: SearchScore): SearchScore {
        if (!(maxScore instanceof SearchScore)) {
            throw new Error('maxScore must be a SearchScore');
        }
        if (maxScore._value === 0) {
            return SearchScore.zero();
        }
        return new SearchScore(this._value / maxScore._value);
    }

    static zero(): SearchScore {
        return new SearchScore(0);
    }

    static fromNumber(value: number): SearchScore {
        return new SearchScore(value);
    }

    static max(score1: SearchScore, score2: SearchScore): SearchScore {
        if (!(score1 instanceof SearchScore) || !(score2 instanceof SearchScore)) {
            throw new Error('Both arguments must be SearchScore instances');
        }
        return score1._value >= score2._value ? score1 : score2;
    }
}