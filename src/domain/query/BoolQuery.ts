/**
 * BoolQuery
 * Represents a boolean query with rich behavior
 */

// Type definitions for boolean query
export interface Query {
    toElasticsearchQuery?(): any;
    toString(): string;
}

export interface BoolQueryOptions {
    must?: Query[];
    should?: Query[];
    must_not?: Query[];
    filter?: Query[];
    minimum_should_match?: number;
}

export class BoolQuery implements Query {
    public readonly must: Query[];
    public readonly should: Query[];
    public readonly must_not: Query[];
    public readonly filter: Query[];
    public readonly minimum_should_match: number;

    constructor(options: BoolQueryOptions = {}) {
        const {
            must = [],
            should = [],
            must_not = [],
            filter = [],
            minimum_should_match = 0
        } = options;

        this.must = Array.isArray(must) ? must : [must];
        this.should = Array.isArray(should) ? should : [should];
        this.must_not = Array.isArray(must_not) ? must_not : [must_not];
        this.filter = Array.isArray(filter) ? filter : [filter];
        this.minimum_should_match = minimum_should_match;

        Object.freeze(this);
    }

    getMust(): Query[] {
        return [...this.must];
    }

    getShould(): Query[] {
        return [...this.should];
    }

    getMustNot(): Query[] {
        return [...this.must_not];
    }

    getFilter(): Query[] {
        return [...this.filter];
    }

    getMinimumShouldMatch(): number {
        return this.minimum_should_match;
    }

    hasMust(): boolean {
        return this.must.length > 0;
    }

    hasShould(): boolean {
        return this.should.length > 0;
    }

    hasMustNot(): boolean {
        return this.must_not.length > 0;
    }

    hasFilter(): boolean {
        return this.filter.length > 0;
    }

    isEmpty(): boolean {
        return !this.hasMust() && !this.hasShould() && !this.hasMustNot() && !this.hasFilter();
    }

    isMatchAll(): boolean {
        return this.isEmpty();
    }

    isOnlyMust(): boolean {
        return this.hasMust() && !this.hasShould() && !this.hasMustNot() && !this.hasFilter();
    }

    isOnlyShould(): boolean {
        return !this.hasMust() && this.hasShould() && !this.hasMustNot() && !this.hasFilter();
    }

    isOnlyFilter(): boolean {
        return !this.hasMust() && !this.hasShould() && !this.hasMustNot() && this.hasFilter();
    }

    getClauseCount(): number {
        return this.must.length + this.should.length + this.must_not.length + this.filter.length;
    }

    validate(): boolean {
        if (this.isEmpty()) {
            throw new Error('BoolQuery must have at least one clause');
        }

        if (this.minimum_should_match < 0) {
            throw new Error('minimum_should_match must be non-negative');
        }

        if (this.minimum_should_match > 0 && !this.hasShould()) {
            throw new Error('minimum_should_match requires should clauses');
        }

        if (this.minimum_should_match > this.should.length) {
            throw new Error('minimum_should_match cannot exceed number of should clauses');
        }

        return true;
    }

    addMust(query: Query): BoolQuery {
        return new BoolQuery({
            must: [...this.must, query],
            should: this.should,
            must_not: this.must_not,
            filter: this.filter,
            minimum_should_match: this.minimum_should_match
        });
    }

    addShould(query: Query): BoolQuery {
        return new BoolQuery({
            must: this.must,
            should: [...this.should, query],
            must_not: this.must_not,
            filter: this.filter,
            minimum_should_match: this.minimum_should_match
        });
    }

    addMustNot(query: Query): BoolQuery {
        return new BoolQuery({
            must: this.must,
            should: this.should,
            must_not: [...this.must_not, query],
            filter: this.filter,
            minimum_should_match: this.minimum_should_match
        });
    }

    addFilter(query: Query): BoolQuery {
        return new BoolQuery({
            must: this.must,
            should: this.should,
            must_not: this.must_not,
            filter: [...this.filter, query],
            minimum_should_match: this.minimum_should_match
        });
    }

    setMinimumShouldMatch(value: number): BoolQuery {
        return new BoolQuery({
            must: this.must,
            should: this.should,
            must_not: this.must_not,
            filter: this.filter,
            minimum_should_match: value
        });
    }

    toElasticsearchQuery(): any {
        const query: any = {
            bool: {}
        };

        if (this.hasMust()) {
            query.bool.must = this.must.map(q => q.toElasticsearchQuery ? q.toElasticsearchQuery() : q);
        }

        if (this.hasShould()) {
            query.bool.should = this.should.map(q => q.toElasticsearchQuery ? q.toElasticsearchQuery() : q);
        }

        if (this.hasMustNot()) {
            query.bool.must_not = this.must_not.map(q => q.toElasticsearchQuery ? q.toElasticsearchQuery() : q);
        }

        if (this.hasFilter()) {
            query.bool.filter = this.filter.map(q => q.toElasticsearchQuery ? q.toElasticsearchQuery() : q);
        }

        if (this.minimum_should_match > 0) {
            query.bool.minimum_should_match = this.minimum_should_match;
        }

        return query;
    }

    toString(): string {
        const parts: string[] = [];

        if (this.hasMust()) {
            parts.push(`+${this.must.map(q => q.toString()).join(' +')}`);
        }

        if (this.hasShould()) {
            parts.push(`(${this.should.map(q => q.toString()).join(' OR ')})`);
        }

        if (this.hasMustNot()) {
            parts.push(`-${this.must_not.map(q => q.toString()).join(' -')}`);
        }

        if (this.hasFilter()) {
            parts.push(`[${this.filter.map(q => q.toString()).join(' AND ')}]`);
        }

        return parts.join(' ');
    }

    equals(other: any): boolean {
        if (!(other instanceof BoolQuery)) {
            return false;
        }

        return JSON.stringify(this.toElasticsearchQuery()) === JSON.stringify(other.toElasticsearchQuery());
    }

    static must(...queries: Query[]): BoolQuery {
        return new BoolQuery({ must: queries });
    }

    static should(...queries: Query[]): BoolQuery {
        return new BoolQuery({ should: queries });
    }

    static mustNot(...queries: Query[]): BoolQuery {
        return new BoolQuery({ must_not: queries });
    }

    static filter(...queries: Query[]): BoolQuery {
        return new BoolQuery({ filter: queries });
    }
}