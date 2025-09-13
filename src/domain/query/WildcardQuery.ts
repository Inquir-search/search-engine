import { Query } from './BoolQuery';

export class WildcardQuery implements Query {
    public readonly field: string;
    public readonly value: string;

    constructor(field: string, value: string) {
        this.field = field;
        this.value = value;
        Object.freeze(this);
    }

    getField(): string {
        return this.field;
    }

    getValue(): string {
        return this.value;
    }

    toElasticsearchQuery(): any {
        return {
            wildcard: {
                [this.field]: {
                    value: this.value
                }
            }
        };
    }

    toString(): string {
        return `${this.field}:${this.value}`;
    }

    equals(other: any): boolean {
        if (!(other instanceof WildcardQuery)) {
            return false;
        }
        return this.field === other.field && this.value === other.value;
    }
}