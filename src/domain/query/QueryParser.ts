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
import { RawQuery, QueryType } from './types';

// Type definitions for query parsing
export interface ParseOptions {
    operator?: 'and' | 'or';
}

export class QueryParser {
    static parse(raw: string | RawQuery | null | undefined, options: ParseOptions = {}): QueryType | null {
        if (!raw) return null;

        // Handle string queries by converting to match queries
        if (typeof raw === 'string') {
            const terms = raw.trim().split(/\s+/).filter(term => term.length > 0);
            if (terms.length === 0) return null;

            // For single term, create a simple match query
            if (terms.length === 1) {
                return new MatchQuery('*', terms[0]); // '*' means search all text fields
            }

            // For multiple terms, check operator option (default is AND)
            const operator = options.operator || 'and';
            const clauses = terms.map(term => new MatchQuery('*', term));

            if (operator.toLowerCase() === 'or') {
                // Use OR logic - should clauses
                return new BoolQuery({ should: clauses });
            } else {
                // Use AND logic - must clauses (default)
                return new BoolQuery({ must: clauses });
            }
        }

        if (raw.match_all) {
            return new MatchAllQuery(raw.match_all.boost);
        }

        if (raw.bool) {
            // Ensure all fields are arrays
            const must = Array.isArray(raw.bool.must) ? raw.bool.must : (raw.bool.must ? [raw.bool.must] : []);
            const should = Array.isArray(raw.bool.should) ? raw.bool.should : (raw.bool.should ? [raw.bool.should] : []);
            const must_not = Array.isArray(raw.bool.must_not) ? raw.bool.must_not : (raw.bool.must_not ? [raw.bool.must_not] : []);
            const filter = Array.isArray(raw.bool.filter) ? raw.bool.filter : (raw.bool.filter ? [raw.bool.filter] : []);

            return new BoolQuery({
                must: must.map(q => QueryParser.parse(q, options)).filter(q => q !== null) as QueryType[],
                should: should.map(q => QueryParser.parse(q, options)).filter(q => q !== null) as QueryType[],
                must_not: must_not.map(q => QueryParser.parse(q, options)).filter(q => q !== null) as QueryType[],
                filter: filter.map(q => QueryParser.parse(q, options)).filter(q => q !== null) as QueryType[],
                minimum_should_match: raw.bool.minimum_should_match || 0
            });
        }

        if (raw.term) {
            // Handle both internal format and OpenSearch format
            if (raw.term.field && raw.term.value !== undefined) {
                return new TermQuery(raw.term.field, raw.term.value, raw.term.fuzziness);
            } else {
                // OpenSearch format: { term: { fieldName: "value" } }
                const fieldNames = Object.keys(raw.term).filter(key => key !== 'fuzziness');
                if (fieldNames.length > 0) {
                    const fieldName = fieldNames[0];
                    const value = raw.term[fieldName];
                    return new TermQuery(fieldName, value, raw.term.fuzziness);
                }
            }
        }

        if (raw.match) {
            // Handle both internal format and OpenSearch format
            if (raw.match.field && raw.match.value !== undefined) {
                return new MatchQuery(raw.match.field, raw.match.value, raw.match.fuzziness);
            } else {
                // OpenSearch format: { match: { fieldName: "value" } }
                const fieldNames = Object.keys(raw.match).filter(key => key !== 'fuzziness' && key !== 'boost');
                if (fieldNames.length > 0) {
                    const fieldName = fieldNames[0];
                    let value = raw.match[fieldName];
                    let fuzziness = raw.match.fuzziness;

                    // Handle OpenSearch object format: { match: { fieldName: { query: "value", fuzziness: 1 } } }
                    if (typeof value === 'object' && value.query !== undefined) {
                        fuzziness = value.fuzziness || fuzziness;
                        value = value.query;
                    }

                    return new MatchQuery(fieldName, value, fuzziness);
                }
            }
        }

        if (raw.range) {
            // Handle both internal format and OpenSearch format
            if (raw.range.field) {
                return new RangeQuery(raw.range.field, raw.range.gte, raw.range.lte, raw.range.gt, raw.range.lt);
            } else {
                // OpenSearch format: { range: { fieldName: { gte: 10, lte: 20 } } }
                const fieldNames = Object.keys(raw.range);
                if (fieldNames.length > 0) {
                    const fieldName = fieldNames[0];
                    const rangeConditions = raw.range[fieldName];
                    return new RangeQuery(fieldName, rangeConditions);
                }
            }
        }

        if (raw.prefix) {
            // Handle both internal format and OpenSearch format
            if (raw.prefix.field && raw.prefix.value !== undefined) {
                return new PrefixQuery(raw.prefix.field, raw.prefix.value);
            } else {
                // OpenSearch format: { prefix: { fieldName: "value" } }
                const fieldNames = Object.keys(raw.prefix).filter(key => key !== 'boost');
                if (fieldNames.length > 0) {
                    const fieldName = fieldNames[0];
                    let value = raw.prefix[fieldName];

                    // Handle OpenSearch object format: { prefix: { fieldName: { value: "prefix" } } }
                    if (typeof value === 'object' && value.value !== undefined) {
                        value = value.value;
                    }

                    return new PrefixQuery(fieldName, value);
                }
            }
        }

        if (raw.wildcard) {
            // Handle both internal format and OpenSearch format
            if (raw.wildcard.field && raw.wildcard.value !== undefined) {
                return new WildcardQuery(raw.wildcard.field, raw.wildcard.value);
            } else {
                // OpenSearch format: { wildcard: { fieldName: "value*" } }
                const fieldNames = Object.keys(raw.wildcard).filter(key => key !== 'boost');
                if (fieldNames.length > 0) {
                    const fieldName = fieldNames[0];
                    let value = raw.wildcard[fieldName];

                    // Handle OpenSearch object format: { wildcard: { fieldName: { value: "prefix*" } } }
                    if (typeof value === 'object' && value.value !== undefined) {
                        value = value.value;
                    }

                    return new WildcardQuery(fieldName, value);
                }
            }
        }

        if (raw.fuzzy) {
            // Handle both internal format and OpenSearch format
            if (raw.fuzzy.field && raw.fuzzy.value !== undefined) {
                return new FuzzyQuery(raw.fuzzy.field, raw.fuzzy.value, raw.fuzzy.fuzziness);
            } else {
                // OpenSearch format: { fuzzy: { fieldName: { value: "text", fuzziness: 1 } } }
                const fieldNames = Object.keys(raw.fuzzy).filter(key => key !== 'fuzziness' && key !== 'boost');
                if (fieldNames.length > 0) {
                    const fieldName = fieldNames[0];
                    let value = raw.fuzzy[fieldName];
                    let fuzziness = raw.fuzzy.fuzziness;

                    if (typeof value === 'object') {
                        fuzziness = value.fuzziness || fuzziness;
                        value = value.value;
                    }

                    return new FuzzyQuery(fieldName, value, fuzziness);
                }
            }
        }

        if (raw.geo_distance) {
            const location = raw.geo_distance.location || raw.geo_distance.center;
            if (location && typeof location === 'object' && 'lat' in location && 'lon' in location) {
                return new GeoDistanceQuery(raw.geo_distance.field, location, String(raw.geo_distance.distance));
            }
        }

        if (raw.match_phrase || raw.phrase) {
            const phraseData = raw.match_phrase || raw.phrase;
            if (phraseData) {
                if (phraseData.field && phraseData.value !== undefined) {
                    return new PhraseQuery(phraseData.field, phraseData.value, phraseData.slop, phraseData.fuzziness);
                } else {
                    const fieldNames = Object.keys(phraseData).filter(key => key !== 'slop' && key !== 'fuzziness' && key !== 'boost');
                    if (fieldNames.length > 0) {
                        const fieldName = fieldNames[0];
                        const value = phraseData[fieldName];
                        return new PhraseQuery(fieldName, value, phraseData.slop, phraseData.fuzziness);
                    }
                }
            }
        }

        return null;
    }
}