import { QueryText, IndexName } from '../../domain/valueObjects/index.js';

/**
 * SearchQuery
 * Represents a search query with all its parameters
 */
export class SearchQuery {
    public readonly queryText: QueryText;
    public readonly query: any; // Raw query object for compatibility
    public readonly indexName: IndexName;
    public readonly from: number;
    public readonly size: number;
    public readonly filters: Filter[];
    public readonly aggregations: Record<string, any>;
    public readonly sort: SortOption[];

    constructor({
        queryText,
        query,
        indexName,
        from = 0,
        size = 10,
        filters = [],
        aggregations = {},
        sort = []
    }: {
        queryText: QueryText;
        query?: any;
        indexName: IndexName;
        from?: number;
        size?: number;
        filters?: Filter[];
        aggregations?: Record<string, any>;
        sort?: SortOption[];
    }) {
        if (!(queryText instanceof QueryText)) {
            throw new Error('queryText must be a QueryText instance');
        }

        if (!(indexName instanceof IndexName)) {
            throw new Error('indexName must be an IndexName instance');
        }

        this.queryText = queryText;
        this.query = query || queryText.value; // Use provided query or fallback to queryText
        this.indexName = indexName;
        this.from = from;
        this.size = size;
        this.filters = filters;
        this.aggregations = aggregations;
        this.sort = sort;

        Object.freeze(this);
    }

    isValid(): boolean {
        return this.from >= 0 &&
            this.size > 0 &&
            this.size <= 1000 &&
            this.queryText !== null &&
            this.indexName !== null;
    }

    isEmpty(): boolean {
        return this.queryText.isEmpty();
    }

    isMatchAll(): boolean {
        return this.queryText.isMatchAll();
    }

    hasFilters(): boolean {
        return this.filters.length > 0;
    }

    hasAggregations(): boolean {
        return Object.keys(this.aggregations).length > 0;
    }

    hasSort(): boolean {
        return this.sort.length > 0;
    }

    getTerms(): string[] {
        return this.queryText.getTerms();
    }

    getTermCount(): number {
        return this.queryText.getTermCount();
    }

    /**
     * Creates a nested query for querying nested objects
     */
    static createNestedQuery(path: string, query: NestedInnerQuery, scoreMode: NestedScoreMode = 'avg'): NestedQuery {
        return {
            nested: {
                path,
                query,
                score_mode: scoreMode
            }
        };
    }

    /**
     * Creates a complex boolean query with nested support
     */
    static createComplexBoolQuery({
        must = [],
        should = [],
        must_not = [],
        filter = [],
        minimum_should_match = 0,
        boost = 1.0
    }: ComplexBoolQueryParams): ComplexBoolQuery {
        return {
            bool: {
                must,
                should,
                must_not,
                filter,
                minimum_should_match,
                boost
            }
        };
    }

    /**
 * Creates a nested path-based query for deeply nested structures
 */
    static createPathQuery(path: string, field: string, value: any, queryType: 'match' | 'term' | 'range' = 'match'): NestedQuery {
        const fullPath = `${path}.${field}`;

        let innerQuery: NestedInnerQuery;
        switch (queryType) {
            case 'term':
                innerQuery = {
                    term: {
                        [fullPath]: value
                    }
                };
                break;
            case 'range':
                innerQuery = {
                    range: {
                        [fullPath]: value
                    }
                };
                break;
            default:
                innerQuery = {
                    match: {
                        [fullPath]: value
                    }
                };
        }

        return this.createNestedQuery(path, innerQuery);
    }

    /**
 * Creates a multi-level nested query for complex nested structures
 */
    static createMultiLevelNestedQuery(levels: NestedLevel[]): DomainQuery {
        if (levels.length === 0) {
            throw new Error('At least one nested level is required');
        }

        // Start with the innermost query
        let result: DomainQuery = this.createNestedQuery(
            levels[levels.length - 1].path,
            levels[levels.length - 1].query,
            levels[levels.length - 1].scoreMode
        );

        // Wrap each subsequent level from inside out
        for (let i = levels.length - 2; i >= 0; i--) {
            result = {
                nested: {
                    path: levels[i].path,
                    query: result as any, // The nested query becomes the inner query
                    score_mode: levels[i].scoreMode || 'avg'
                }
            };
        }

        return result;
    }

    /**
     * Enhanced toDomainQuery with nested query support
     */
    toDomainQuery(): DomainQuery {
        if (this.isEmpty()) {
            return { match_all: {} };
        }

        if (this.queryText.isPhrase()) {
            return {
                match_phrase: {
                    field: '*',
                    value: this.queryText.value.replace(/"/g, '')
                }
            };
        }

        if (this.queryText.containsWildcards()) {
            return {
                wildcard: {
                    field: '*',
                    value: this.queryText.value
                }
            };
        }

        const terms = this.getTerms();
        if (terms.length === 1) {
            return {
                match: {
                    field: '*',
                    value: terms[0]
                }
            };
        }

        // Multiple terms - use bool query with AND logic
        return {
            bool: {
                must: terms.map(term => ({
                    match: {
                        field: '*',
                        value: term
                    }
                }))
            }
        };
    }

    /**
     * Converts to domain query with nested and filter support
     */
    toEnhancedDomainQuery(): DomainQuery {
        const baseQuery = this.toDomainQuery();

        // If we have filters, wrap in a bool query
        if (this.hasFilters()) {
            const filterQueries = this.filters.map(filter => this.filterToDomainQuery(filter));

            if (baseQuery.match_all) {
                return {
                    bool: {
                        filter: filterQueries
                    }
                };
            } else {
                return {
                    bool: {
                        must: [baseQuery],
                        filter: filterQueries
                    }
                };
            }
        }

        return baseQuery;
    }

    /**
     * Converts a filter to a domain query (OpenSearch compatible)
     */
    private filterToDomainQuery(filter: Filter): DomainQuery {
        const { field, value, operator = 'eq' } = filter;

        switch (operator) {
            case 'eq':
                return { term: { [field]: value } };
            case 'ne':
                return {
                    bool: {
                        must_not: [{ term: { [field]: value } }]
                    }
                };
            case 'gt':
            case 'gte':
            case 'lt':
            case 'lte':
                return {
                    range: {
                        [field]: {
                            [operator]: value
                        }
                    }
                };
            case 'in':
                return {
                    bool: {
                        should: Array.isArray(value) ? value.map(v => ({ term: { [field]: v } })) : [{ term: { [field]: value } }]
                    }
                };
            case 'nin':
                return {
                    bool: {
                        must_not: Array.isArray(value) ? value.map(v => ({ term: { [field]: v } })) : [{ term: { [field]: value } }]
                    }
                };
            case 'exists':
                return { exists: { field } };
            case 'missing':
                return {
                    bool: {
                        must_not: [{ exists: { field } }]
                    }
                };
            default:
                return { term: { [field]: value } };
        }
    }

    static fromCommand(command: SearchCommand): SearchQuery {
        return new SearchQuery({
            queryText: new QueryText(command.query || ''),
            indexName: new IndexName(command.indexName || 'default'),
            from: command.from || 0,
            size: command.size || 10,
            filters: command.filters || [],
            aggregations: command.aggregations || {},
            sort: command.sort || []
        });
    }
}

// Enhanced interfaces for nested query support
export interface Filter {
    field: string;
    value: any;
    operator?: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin' | 'exists' | 'missing';
}

export interface SortOption {
    field: string;
    order: 'asc' | 'desc';
}

export interface SearchCommand {
    query?: string;
    indexName?: string;
    from?: number;
    size?: number;
    filters?: Filter[];
    aggregations?: Record<string, any>;
    sort?: SortOption[];
    userContext?: Record<string, any>;
}

export interface NestedQuery {
    nested: {
        path: string;
        query: NestedInnerQuery;
        score_mode?: NestedScoreMode;
        boost?: number;
        ignore_unmapped?: boolean;
    };
}

export interface NestedInnerQuery {
    match?: {
        [field: string]: {
            query: string;
            fuzziness?: number;
            boost?: number;
        } | string;
    };
    term?: {
        [field: string]: {
            value: any;
            boost?: number;
        } | any;
    };
    range?: {
        [field: string]: {
            gte?: any;
            lte?: any;
            gt?: any;
            lt?: any;
            boost?: number;
        };
    };
    bool?: {
        must?: NestedInnerQuery[];
        should?: NestedInnerQuery[];
        must_not?: NestedInnerQuery[];
        filter?: NestedInnerQuery[];
        minimum_should_match?: number;
        boost?: number;
    };
    exists?: {
        field: string;
    };
    wildcard?: {
        [field: string]: {
            value: string;
            boost?: number;
        } | string;
    };
    fuzzy?: {
        [field: string]: {
            value: string;
            fuzziness?: number;
            boost?: number;
        };
    };
    prefix?: {
        [field: string]: {
            value: string;
            boost?: number;
        } | string;
    };
    match_all?: {
        boost?: number;
    };
    match_phrase?: {
        [field: string]: {
            query: string;
            slop?: number;
            boost?: number;
        } | string;
    };
}

export type NestedScoreMode = 'avg' | 'sum' | 'max' | 'min' | 'none';

export interface NestedLevel {
    path: string;
    query: NestedInnerQuery;
    scoreMode?: NestedScoreMode;
}

export interface ComplexBoolQuery {
    bool: {
        must?: DomainQuery[];
        should?: DomainQuery[];
        must_not?: DomainQuery[];
        filter?: DomainQuery[];
        minimum_should_match?: number;
        boost?: number;
    };
}

export interface ComplexBoolQueryParams {
    must?: DomainQuery[];
    should?: DomainQuery[];
    must_not?: DomainQuery[];
    filter?: DomainQuery[];
    minimum_should_match?: number;
    boost?: number;
}

// Enhanced DomainQuery interface with full nested support (OpenSearch compatible)
export interface DomainQuery {
    match_all?: {
        boost?: number;
    };
    match_phrase?: {
        [field: string]: {
            query: string;
            slop?: number;
            boost?: number;
        } | string;
    } | {
        field: string;
        value: string;
        slop?: number;
        boost?: number;
    };
    wildcard?: {
        [field: string]: {
            value: string;
            boost?: number;
        } | string;
    } | {
        field: string;
        value: string;
        boost?: number;
    };
    match?: {
        [field: string]: {
            query: string;
            fuzziness?: number;
            boost?: number;
        } | string;
    } | {
        field: string;
        value: string;
        fuzziness?: number;
        boost?: number;
    };
    term?: {
        [field: string]: {
            value: any;
            boost?: number;
        } | any;
    } | {
        field: string;
        value: any;
        boost?: number;
    };
    range?: {
        [field: string]: {
            gte?: any;
            lte?: any;
            gt?: any;
            lt?: any;
            boost?: number;
        };
    } | {
        field: string;
        gte?: any;
        lte?: any;
        gt?: any;
        lt?: any;
        boost?: number;
    };
    exists?: {
        field: string;
    };
    prefix?: {
        [field: string]: {
            value: string;
            boost?: number;
        } | string;
    } | {
        field: string;
        value: string;
        boost?: number;
    };
    fuzzy?: {
        [field: string]: {
            value: string;
            fuzziness?: number;
            boost?: number;
        };
    } | {
        field: string;
        value: string;
        fuzziness?: number;
        boost?: number;
    };
    bool?: {
        must?: DomainQuery[];
        should?: DomainQuery[];
        must_not?: DomainQuery[];
        filter?: DomainQuery[];
        minimum_should_match?: number;
        boost?: number;
    };
    nested?: {
        path: string;
        query: NestedInnerQuery | DomainQuery;
        score_mode?: NestedScoreMode;
        boost?: number;
        ignore_unmapped?: boolean;
    };
}