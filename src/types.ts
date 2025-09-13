/**
 * @fileoverview Type definitions for the Advanced Search Engine library
 */

export interface SearchResult {
    id: string;
    score: number;
    fields: Record<string, any>;
}

export interface SearchResponse {
    hits: SearchResult[];
    total: number;
    took: number;
    facets?: Record<string, any[]>;
}

export interface MatchQuery {
    field: string;
    value: string;
}

export interface TermQuery {
    field: string;
    value: string;
}

export interface PrefixQuery {
    field: string;
    value: string;
}

export interface WildcardQuery {
    field: string;
    value: string;
}

export interface FuzzyQuery {
    field: string;
    value: string;
    fuzziness?: number;
}

export interface RangeQuery {
    field: string;
    gte?: number | string;
    lte?: number | string;
    gt?: number | string;
    lt?: number | string;
}

export interface MatchPhraseQuery {
    field: string;
    value: string;
    slop?: number;
}

export interface PhraseQuery {
    field: string;
    value: string;
    slop?: number;
}

export interface GeoDistanceQuery {
    field: string;
    center: {
        lat: number;
        lon: number;
    };
    distance: string;
}

export interface BoolQuery {
    must?: Query[];
    should?: Query[];
    must_not?: Query[];
}

export interface Query {
    match?: MatchQuery;
    term?: TermQuery;
    prefix?: PrefixQuery;
    wildcard?: WildcardQuery;
    fuzzy?: FuzzyQuery;
    range?: RangeQuery;
    match_phrase?: MatchPhraseQuery;
    phrase?: PhraseQuery;
    geo_distance?: GeoDistanceQuery;
    bool?: BoolQuery;
}

export interface SearchOptions {
    from?: number;
    size?: number;
    useOr?: boolean;
    facets?: string[];
}

export interface SearchRequest {
    query?: Query;
    bool?: BoolQuery;
    options?: SearchOptions;
}

export type FieldType = 'text' | 'keyword' | 'float' | 'integer' | 'boolean' | 'date' | 'geo_point';

export interface FieldMapping {
    type: FieldType;
    index?: boolean;
    analyzer?: string;
}

export interface SearchEngineOptions {
    mappings?: Record<string, FieldMapping>;
    stopwords?: string[];
    facetFields?: string[];
    autoSave?: boolean;
}

export interface Document {
    id: string;
    [key: string]: any;
}

// Re-export key value objects and entities for convenience
export { DocumentId, FieldName, FieldType as FieldTypeVO, IndexName, QueryText, SearchScore } from './domain/valueObjects/index.js';
export { Document as DocumentEntity } from './domain/entities/Document.js';
export { DocumentAddedEvent } from './domain/events/DocumentAddedEvent.js';
export { DocumentRepository } from './domain/repositories/DocumentRepository.js';
export { SearchRepository } from './domain/repositories/SearchRepository.js';
export { InMemoryDocumentRepository } from './infrastructure/repositories/InMemoryDocumentRepository.js';