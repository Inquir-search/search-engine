import { TermQuery } from './TermQuery';
import { MatchQuery } from './MatchQuery';
import { MatchAllQuery } from './MatchAllQuery';
import { BoolQuery } from './BoolQuery';
import { RangeQuery } from './RangeQuery';
import { PrefixQuery } from './PrefixQuery';
import { WildcardQuery } from './WildcardQuery';
import { FuzzyQuery } from './FuzzyQuery';
import { GeoDistanceQuery } from './GeoDistanceQuery';
import { PhraseQuery } from './PhraseQuery';

export interface RawQuery {
    match_all?: { boost?: number };
    bool?: {
        must?: RawQuery | RawQuery[];
        should?: RawQuery | RawQuery[];
        must_not?: RawQuery | RawQuery[];
        filter?: RawQuery | RawQuery[];
        minimum_should_match?: number;
    };
    term?: {
        field?: string;
        value?: string;
        fuzziness?: number;
        [fieldName: string]: any;
    };
    match?: {
        field?: string;
        value?: string;
        fuzziness?: number;
        [fieldName: string]: any;
    };
    range?: {
        field?: string;
        gte?: number | string;
        lte?: number | string;
        gt?: number | string;
        lt?: number | string;
        [fieldName: string]: any;
    };
    prefix?: {
        field?: string;
        value?: string;
        [fieldName: string]: any;
    };
    wildcard?: {
        field?: string;
        value?: string;
        [fieldName: string]: any;
    };
    fuzzy?: {
        field?: string;
        value?: string;
        fuzziness?: number;
        [fieldName: string]: any;
    };
    geo_distance?: {
        field: string;
        location?: { lat: number; lon: number } | [number, number];
        center?: { lat: number; lon: number } | [number, number];
        distance: string | number;
    };
    match_phrase?: {
        field?: string;
        value?: string;
        slop?: number;
        fuzziness?: number;
        [fieldName: string]: any;
    };
    phrase?: {
        field?: string;
        value?: string;
        slop?: number;
        fuzziness?: number;
        [fieldName: string]: any;
    };
}

export type QueryType =
    | TermQuery
    | MatchQuery
    | MatchAllQuery
    | BoolQuery
    | RangeQuery
    | PrefixQuery
    | WildcardQuery
    | FuzzyQuery
    | GeoDistanceQuery
    | PhraseQuery;