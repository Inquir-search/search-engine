import { Query } from './BoolQuery';

export class FuzzyQuery implements Query {
    public readonly field: string;
    public readonly value: string;
    public readonly fuzziness: number;

    constructor(field: string, value: string, fuzziness: number = 1) {
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

    getFuzziness(): number {
        return this.fuzziness;
    }

    toElasticsearchQuery(): any {
        return {
            fuzzy: {
                [this.field]: {
                    value: this.value,
                    fuzziness: this.fuzziness
                }
            }
        };
    }

    toString(): string {
        return `${this.field}:${this.value}~${this.fuzziness}`;
    }

    equals(other: any): boolean {
        if (!(other instanceof FuzzyQuery)) {
            return false;
        }
        return this.field === other.field && this.value === other.value && this.fuzziness === other.fuzziness;
    }
}