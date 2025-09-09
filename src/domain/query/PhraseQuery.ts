import { Query } from './BoolQuery';

export class PhraseQuery implements Query {
    public readonly field: string;
    public readonly value: string;
    public readonly slop: number;
    public readonly fuzziness?: number;

    constructor(field: string, value: string, slop: number = 0, fuzziness?: number) {
        this.field = field;
        this.value = value;
        this.slop = slop;
        this.fuzziness = fuzziness;

        Object.freeze(this);
    }

    getField(): string {
        return this.field;
    }

    getValue(): string {
        return this.value;
    }

    getSlop(): number {
        return this.slop;
    }

    getFuzziness(): number | undefined {
        return this.fuzziness;
    }

    toElasticsearchQuery(): any {
        return {
            match_phrase: {
                [this.field]: {
                    query: this.value,
                    slop: this.slop,
                    ...(this.fuzziness !== undefined && { fuzziness: this.fuzziness })
                }
            }
        };
    }

    toString(): string {
        return `${this.field}:"${this.value}"${this.slop > 0 ? `~${this.slop}` : ''}`;
    }

    equals(other: any): boolean {
        if (!(other instanceof PhraseQuery)) {
            return false;
        }
        return this.field === other.field &&
            this.value === other.value &&
            this.slop === other.slop &&
            this.fuzziness === other.fuzziness;
    }
}