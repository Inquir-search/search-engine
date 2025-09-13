import { FieldName, QueryText } from '../valueObjects/index';
import { Query } from './BoolQuery';

/**
 * MatchQuery
 * Represents a match query with rich behavior
 */
export class MatchQuery implements Query {
    public readonly field: FieldName | '*';
    public readonly value: QueryText;
    public readonly fuzziness?: number;

    constructor(field: string, value: string, fuzziness?: number) {
        this.field = field === '*' ? field : new FieldName(field);
        this.value = new QueryText(value);
        this.fuzziness = fuzziness;

        Object.freeze(this);
    }

    getField(): FieldName | '*' {
        return this.field;
    }

    getValue(): QueryText {
        return this.value;
    }

    getFuzziness(): number | undefined {
        return this.fuzziness;
    }

    isWildcardField(): boolean {
        return this.field === '*';
    }

    isFuzzy(): boolean {
        return this.fuzziness !== undefined && this.fuzziness > 0;
    }

    isEmpty(): boolean {
        return this.value.isEmpty();
    }

    isPhrase(): boolean {
        return this.value.isPhrase();
    }

    containsWildcards(): boolean {
        return this.value.containsWildcards();
    }

    getTerms(): string[] {
        return this.value.getTerms();
    }

    getTermCount(): number {
        return this.value.getTermCount();
    }

    isMultiTerm(): boolean {
        return this.getTermCount() > 1;
    }

    validate(): boolean {
        if (this.isEmpty()) {
            throw new Error('MatchQuery value cannot be empty');
        }

        if (this.fuzziness !== undefined && (this.fuzziness < 0 || this.fuzziness > 2)) {
            throw new Error('Fuzziness must be between 0 and 2');
        }

        return true;
    }

    toElasticsearchQuery(): any {
        return {
            match: {
                [this.field === '*' ? '_all' : (this.field as FieldName).value]: {
                    query: this.value.value,
                    fuzziness: this.fuzziness
                }
            }
        };
    }

    toString(): string {
        const fieldStr = this.isWildcardField() ? '*' : (this.field as FieldName).value;
        const fuzzyStr = this.isFuzzy() ? `~${this.fuzziness}` : '';
        return `${fieldStr}:"${this.value.value}"${fuzzyStr}`;
    }

    equals(other: any): boolean {
        if (!(other instanceof MatchQuery)) {
            return false;
        }

        return this.field === other.field &&
            this.value.equals(other.value) &&
            this.fuzziness === other.fuzziness;
    }

    static fromString(queryString: string): MatchQuery {
        // Parse simple query strings like "field:value" or "field:value~2"
        const match = queryString.match(/^([^:]+):(.+)$/);
        if (!match) {
            return new MatchQuery('*', queryString);
        }

        const [, field, valueWithFuzz] = match;
        const fuzzyMatch = valueWithFuzz.match(/^(.+?)~(\d+)$/);

        if (fuzzyMatch) {
            const [, value, fuzziness] = fuzzyMatch;
            return new MatchQuery(field, value, parseInt(fuzziness));
        }

        return new MatchQuery(field, valueWithFuzz);
    }

    static wildcard(value: string, fuzziness?: number): MatchQuery {
        return new MatchQuery('*', value, fuzziness);
    }
}