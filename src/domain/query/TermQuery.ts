import { Query } from './BoolQuery';

export class TermQuery implements Query {
    public readonly field: string;
    public readonly value: string;
    public readonly fuzziness?: number;

    constructor(field: string, value: string, fuzziness?: number) {
        this.field = field;
        this.value = value;
        this.fuzziness = fuzziness;

        Object.freeze(this);
    }

    getField(): string {
        return this.field;
    }

    getValue(): string {
        return this.value;
    }

    getFuzziness(): number | undefined {
        return this.fuzziness;
    }

    toElasticsearchQuery(): any {
        return {
            term: {
                [this.field]: {
                    value: this.value,
                    ...(this.fuzziness !== undefined && { fuzziness: this.fuzziness })
                }
            }
        };
    }

    toString(): string {
        return `${this.field}:${this.value}`;
    }

    equals(other: any): boolean {
        if (!(other instanceof TermQuery)) {
            return false;
        }
        return this.field === other.field &&
            this.value === other.value &&
            this.fuzziness === other.fuzziness;
    }
}