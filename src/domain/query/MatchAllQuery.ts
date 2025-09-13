import { Query } from './BoolQuery';

export class MatchAllQuery implements Query {
    public readonly boost: number;

    constructor(boost: number = 1.0) {
        this.boost = boost;

        Object.freeze(this);
    }

    toElasticsearchQuery(): any {
        return {
            match_all: {
                boost: this.boost
            }
        };
    }

    toString(): string {
        return '*';
    }

    equals(other: any): boolean {
        if (!(other instanceof MatchAllQuery)) {
            return false;
        }
        return this.boost === other.boost;
    }
}