import { Query } from './BoolQuery';

export class RangeQuery implements Query {
    public readonly field: string;
    public readonly gte?: number | string;
    public readonly lte?: number | string;
    public readonly gt?: number | string;
    public readonly lt?: number | string;

    constructor(field: string, gte?: number | string, lte?: number | string, gt?: number | string, lt?: number | string) {
        this.field = field;
        this.gte = gte;
        this.lte = lte;
        this.gt = gt;
        this.lt = lt;

        Object.freeze(this);
    }

    getField(): string {
        return this.field;
    }

    getGte(): number | string | undefined {
        return this.gte;
    }

    getLte(): number | string | undefined {
        return this.lte;
    }

    getGt(): number | string | undefined {
        return this.gt;
    }

    getLt(): number | string | undefined {
        return this.lt;
    }

    toElasticsearchQuery(): any {
        const rangeClause: any = {};

        if (this.gte !== undefined) {
            rangeClause.gte = this.gte;
        }

        if (this.lte !== undefined) {
            rangeClause.lte = this.lte;
        }

        if (this.gt !== undefined) {
            rangeClause.gt = this.gt;
        }

        if (this.lt !== undefined) {
            rangeClause.lt = this.lt;
        }

        return {
            range: {
                [this.field]: rangeClause
            }
        };
    }

    toString(): string {
        const parts: string[] = [];
        if (this.gte !== undefined) {
            parts.push(`${this.field} >= ${this.gte}`);
        }
        if (this.lte !== undefined) {
            parts.push(`${this.field} <= ${this.lte}`);
        }
        if (this.gt !== undefined) {
            parts.push(`${this.field} > ${this.gt}`);
        }
        if (this.lt !== undefined) {
            parts.push(`${this.field} < ${this.lt}`);
        }
        return parts.join(' AND ');
    }

    equals(other: any): boolean {
        if (!(other instanceof RangeQuery)) {
            return false;
        }
        return this.field === other.field &&
            this.gte === other.gte &&
            this.lte === other.lte &&
            this.gt === other.gt &&
            this.lt === other.lt;
    }
}