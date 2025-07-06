/**
 * @fileoverview Type definitions for the Advanced Search Engine library
 */

/**
 * @typedef {Object} SearchResult
 * @property {string} id - Document identifier
 * @property {number} score - Relevance score
 * @property {Object} fields - Document fields
 */

/**
 * @typedef {Object} SearchResponse
 * @property {SearchResult[]} hits - Array of search results
 * @property {number} total - Total number of matching documents
 * @property {number} took - Time taken for search in milliseconds
 * @property {Object.<string, Array>} [facets] - Facet aggregations if requested
 */

/**
 * @typedef {Object} MatchQuery
 * @property {string} field - Field to search in
 * @property {string} value - Value to search for
 */

/**
 * @typedef {Object} TermQuery
 * @property {string} field - Field to search in
 * @property {string} value - Exact term to match
 */

/**
 * @typedef {Object} PrefixQuery
 * @property {string} field - Field to search in
 * @property {string} value - Prefix to match
 */

/**
 * @typedef {Object} WildcardQuery
 * @property {string} field - Field to search in
 * @property {string} value - Pattern with * and ? wildcards
 */

/**
 * @typedef {Object} FuzzyQuery
 * @property {string} field - Field to search in
 * @property {string} value - Term to fuzzy match
 * @property {number} [fuzziness=2] - Maximum edit distance
 */

/**
 * @typedef {Object} RangeQuery
 * @property {string} field - Field to search in
 * @property {number|string} [gte] - Greater than or equal to
 * @property {number|string} [lte] - Less than or equal to
 * @property {number|string} [gt] - Greater than
 * @property {number|string} [lt] - Less than
 */

/**
 * @typedef {Object} MatchPhraseQuery
 * @property {string} field - Field to search in
 * @property {string} value - Phrase to match
 * @property {number} [slop=0] - Maximum word distance tolerance
 */

/**
 * @typedef {Object} PhraseQuery
 * @property {string} field - Field to search in
 * @property {string} value - Terms as space-separated string
 * @property {number} [slop=0] - Maximum word distance tolerance
 */

/**
 * @typedef {Object} GeoDistanceQuery
 * @property {string} field - Field containing geo coordinates
 * @property {{lat: number, lon: number}} center - Center point
 * @property {string} distance - Distance string (e.g., "10km", "5mi")
 */

/**
 * @typedef {Object} BoolQuery
 * @property {Array<Query>} [must] - Queries that must match
 * @property {Array<Query>} [should] - Queries that should match
 * @property {Array<Query>} [must_not] - Queries that must not match
 */

/**
 * @typedef {Object} Query
 * @property {MatchQuery} [match] - Match query
 * @property {TermQuery} [term] - Term query
 * @property {PrefixQuery} [prefix] - Prefix query
 * @property {WildcardQuery} [wildcard] - Wildcard query
 * @property {FuzzyQuery} [fuzzy] - Fuzzy query
 * @property {RangeQuery} [range] - Range query
 * @property {MatchPhraseQuery} [match_phrase] - Match phrase query
 * @property {PhraseQuery} [phrase] - Phrase query
 * @property {GeoDistanceQuery} [geo_distance] - Geo distance query
 * @property {BoolQuery} [bool] - Boolean query
 */

/**
 * @typedef {Object} SearchOptions
 * @property {number} [from=0] - Starting position for pagination
 * @property {number} [size=10] - Number of results to return
 * @property {boolean} [useOr=false] - Use OR logic instead of AND for multiple terms
 * @property {string[]} [facets] - Fields to generate facet aggregations for
 */

/**
 * @typedef {Object} SearchRequest
 * @property {Query} [query] - Search query
 * @property {BoolQuery} [bool] - Boolean query (alternative to query)
 * @property {SearchOptions} [options] - Search options
 */

/**
 * @typedef {Object} FieldMapping
 * @property {'text'|'keyword'|'float'|'integer'|'boolean'|'date'|'geo_point'} type - Field type
 * @property {boolean} [index=true] - Whether field should be indexed
 * @property {string} [analyzer] - Text analyzer to use
 */

/**
 * @typedef {Object} SearchEngineOptions
 * @property {Object.<string, FieldMapping>} [mappings] - Field mappings
 * @property {string[]} [stopwords] - Custom stopwords list
 * @property {string[]} [facetFields] - Fields to enable faceting on
 * @property {boolean} [autoSave=true] - Whether to auto-save mappings
 */

/**
 * @typedef {Object} Document
 * @property {string} id - Unique document identifier
 * @property {Object} [fields] - Document fields (any additional properties)
 */

export { } 