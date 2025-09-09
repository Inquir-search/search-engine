import { SearchScore } from '../../domain/valueObjects/index.js';

// Import facet types from FacetEngine
export interface FacetBucket {
    key: string | number;
    doc_count: number;
}

export interface TermsAggregationResult {
    buckets: FacetBucket[];
    doc_count_error_upper_bound: number;
    sum_other_doc_count: number;
}

export interface FacetResults {
    [field: string]: {
        [value: string]: number;
    };
}

export interface FacetData {
    [field: string]: TermsAggregationResult | FacetResults[string];
}

/**
 * SearchResult
 * Represents the result of a search operation
 */
export class SearchResult {
    public readonly hits: SearchHit[];
    public readonly total: number;
    public readonly from: number;
    public readonly size: number;
    public readonly aggregations: Record<string, any>;
    public readonly facets: FacetData;
    public readonly took: number;

    constructor({
        hits = [],
        total = 0,
        from = 0,
        size = 10,
        aggregations = {},
        facets = {},
        took = 0
    }: {
        hits?: SearchHit[];
        total?: number;
        from?: number;
        size?: number;
        aggregations?: Record<string, any>;
        facets?: FacetData;
        took?: number;
    }) {
        this.hits = hits.map(hit => this._normalizeHit(hit));
        this.total = total;
        this.from = from;
        this.size = size;
        this.aggregations = aggregations;
        this.facets = facets;
        this.took = took;

        Object.freeze(this);
    }

    private _normalizeHit(hit: SearchHit): SearchHit {
        if (!hit._score) {
            hit._score = SearchScore.fromNumber(1.0);
        } else if (!(hit._score instanceof SearchScore)) {
            hit._score = SearchScore.fromNumber(hit._score as number);
        }

        return hit;
    }

    isEmpty(): boolean {
        return this.hits.length === 0;
    }

    hasMoreResults(): boolean {
        return this.from + this.size < this.total;
    }

    getMaxScore(): SearchScore {
        if (this.isEmpty()) {
            return SearchScore.zero();
        }

        return this.hits.reduce((max, hit) => {
            return SearchScore.max(max, hit._score);
        }, SearchScore.zero());
    }

    hasAggregations(): boolean {
        return Object.keys(this.aggregations).length > 0;
    }

    hasFacets(): boolean {
        return Object.keys(this.facets).length > 0;
    }

    getAggregation(name: string): any {
        return this.aggregations[name];
    }

    getFacet(field: string): TermsAggregationResult | FacetResults[string] | undefined {
        return this.facets[field];
    }

    getFacetBuckets(field: string): FacetBucket[] {
        const facet = this.facets[field];
        if (!facet) return [];

        // If it's already in TermsAggregationResult format
        if (typeof facet === 'object' && 'buckets' in facet) {
            return (facet as TermsAggregationResult).buckets;
        }

        // Convert simple FacetResults format to buckets
        if (typeof facet === 'object') {
            return Object.entries(facet as Record<string, number>).map(([key, doc_count]) => ({
                key,
                doc_count
            }));
        }

        return [];
    }

    toJSON(): SearchResultJSON {
        return {
            hits: this.hits.map(hit => ({
                ...hit,
                _score: hit._score.value
            })),
            total: this.total,
            from: this.from,
            size: this.size,
            aggregations: this.aggregations,
            facets: this.facets,
            took: this.took
        };
    }

    static empty(): SearchResult {
        return new SearchResult({
            hits: [],
            total: 0,
            from: 0,
            size: 0,
            aggregations: {},
            facets: {},
            took: 0
        });
    }
}

export interface SearchHit {
    _id: string;
    _score: SearchScore;
    _source: Record<string, any>;
    [key: string]: any;
}

export interface SearchResultJSON {
    hits: Array<{
        _id: string;
        _score: number;
        _source: Record<string, any>;
        [key: string]: any;
    }>;
    total: number;
    from: number;
    size: number;
    aggregations: Record<string, any>;
    facets: FacetData;
    took: number;
}