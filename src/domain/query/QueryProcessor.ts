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
import { RawQuery as Query } from './types';
import { SharedQueryProcessor } from './SharedQueryProcessor';

// Type definitions for query processing
export interface QueryProcessorOptions {
    invertedIndex: any;
    synonymEngine: any;
    tokenizer: any;
    documents: Map<string, any>;
    mappingsManager: any;
}

export interface ProcessingResult {
    documents: Set<string>;
    scores?: Map<string, number>;
}

// Helper function for edit distance (Levenshtein)
function levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];
    for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= str1.length; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    return matrix[str2.length][str1.length];
}

export class QueryProcessor {
    private readonly invertedIndex: any;
    private readonly synonymEngine: any;
    private readonly tokenizer: any;
    private readonly documents: Map<string, any>;
    private readonly mappingsManager: any;

    // Performance optimization caches - these are the key to faster search
    private readonly _fieldTokensCache: Map<string, Set<string>> = new Map();
    private _textFieldsCache: Set<string> | null = null;
    private _allTokensCache: Set<string> | null = null;
    private _cacheVersion: number = 0;

    constructor(options: QueryProcessorOptions) {
        this.invertedIndex = options.invertedIndex;
        this.synonymEngine = options.synonymEngine;
        this.tokenizer = options.tokenizer;
        this.documents = options.documents;
        this.mappingsManager = options.mappingsManager;
    }

    execute(query: Query): ProcessingResult {
        if (!query) {
            return { documents: new Set() };
        }

        if ('match_all' in query) {
            const result = this._processMatchAll(query);
            return result;
        } else if ('term' in query) {
            const result = this._processTerm(query);
            return result;
        } else if ('match' in query) {
            const result = this._processMatch(query);
            return result;
        } else if ('bool' in query) {
            const result = this._processBool(query);
            return result;
        } else if ('range' in query) {
            const result = this._processRange(query);
            return result;
        } else if ('prefix' in query) {
            const result = this._processPrefix(query);
            return result;
        } else if ('wildcard' in query) {
            const result = this._processWildcard(query);
            return result;
        } else if ('fuzzy' in query) {
            return this._processFuzzy(query);
        } else if ('geo_distance' in query) {
            return this._processGeoDistance(query);
        } else if ('phrase' in query) {
            return this._processPhrase(query);
        } else if ('match_phrase' in query) {
            return this._processMatchPhrase(query);
        }

        return { documents: new Set() };
    }

    private _normalizeQuery(query: Query): Query {
        // Handle different query formats and normalize them
        return query;
    }

    private _processMatchAll(query: Query): ProcessingResult {
        const allDocuments = new Set(this.documents.keys());
        return { documents: allDocuments };
    }

    private _processTerm(query: Query): ProcessingResult {
        if (query.term) {
            if (query.term.field && query.term.value !== undefined) {
                const termQuery = query.term!;
                const field = termQuery.field;
                const value = termQuery.value;
                const fuzziness = termQuery.fuzziness || 0;
                if (field && value !== undefined) {
                    return this._processSingleTerm(field, value, fuzziness);
                }
            } else {
                const fieldNames = Object.keys(query.term).filter(key => key !== 'fuzziness');
                if (fieldNames.length > 0) {
                    const fieldName = fieldNames[0];
                    const value = query.term[fieldName];
                    const fuzziness = query.term.fuzziness || 0;
                    return this._processSingleTerm(fieldName, value, fuzziness);
                }
            }
        }
        return { documents: new Set() };
    }

    private _processSingleTerm(field: string, value: string, fuzziness: number): ProcessingResult {
        // Handle wildcard field '*' - search across all text fields
        if (field === '*') {
            const textFields = this._getTextFields();
            const allResults = new Set<string>();

            for (const textField of textFields) {
                const fieldResult = this._processSingleTerm(textField, value, fuzziness);
                for (const docId of fieldResult.documents) {
                    allResults.add(docId);
                }
            }

            return { documents: allResults };
        }

        const normalizedValue = this._normalize(field, value);
        const fieldType = this.mappingsManager.getFieldType(field);
        const analyzer = this._getAnalyzerForFieldType(fieldType);

        // Get tokens for the field
        const fieldTokens = this._getFieldTokens(field);

        const matchingTokens = new Set<string>();

        if (fuzziness === 0) {
            // Exact match
            if (fieldTokens.has(normalizedValue)) {
                matchingTokens.add(normalizedValue);
            }
        } else {
            // Fuzzy match - default to fuzziness 1 if undefined
            const actualFuzziness = fuzziness !== undefined ? fuzziness : 1;
            for (const token of fieldTokens) {
                if (levenshteinDistance(normalizedValue, token) <= actualFuzziness) {
                    matchingTokens.add(token);
                }
            }
        }

        // Add synonym expansion
        if (this.synonymEngine && this.synonymEngine.isEnabled()) {
            const synonyms = this.synonymEngine.getSynonyms(normalizedValue);
            for (const synonym of synonyms) {
                const normalizedSynonym = this._normalize(field, synonym);
                if (fieldTokens.has(normalizedSynonym)) {
                    matchingTokens.add(normalizedSynonym);
                }
            }
        }

        // Get documents containing matching tokens
        const resultDocuments = new Set<string>();
        for (const token of matchingTokens) {
            const docs = this.invertedIndex.getDocuments(field, token);
            for (const doc of docs) {
                resultDocuments.add(doc);
            }
        }

        return { documents: resultDocuments };
    }

    private _processMatch(query: Query): ProcessingResult {
        if (query.match) {
            const matchQuery = query.match;
            if (matchQuery.field && matchQuery.value !== undefined) {
                const field = matchQuery.field;
                const value = matchQuery.value;
                const fuzziness = matchQuery.fuzziness || 0;
                if (field && value !== undefined) {
                    return this._processSingleTerm(field, value, fuzziness);
                }
            } else {
                const fieldNames = Object.keys(matchQuery).filter(key => key !== 'fuzziness' && key !== 'boost');
                if (fieldNames.length > 0) {
                    const fieldName = fieldNames[0];
                    let value = matchQuery[fieldName];
                    let fuzziness = matchQuery.fuzziness;

                    if (typeof value === 'object' && value.query !== undefined) {
                        fuzziness = value.fuzziness || fuzziness;
                        value = value.query;
                    }
                    if (fieldName && value !== undefined) {
                        return this._processSingleTerm(fieldName, value, fuzziness || 0);
                    }
                }
            }
        }
        return { documents: new Set() };
    }

    private _processBool(query: Query): ProcessingResult {
        if (query.bool) {
            const boolQuery = query.bool;
            // NEW: Explicitly handle a bool query that defines an empty "should" array (and has no must/filter clauses)
            if (('should' in boolQuery) && Array.isArray(boolQuery.should) && boolQuery.should.length === 0 && (!boolQuery.must || !Array.isArray(boolQuery.must) || boolQuery.must.length === 0) && (!boolQuery.filter || !Array.isArray(boolQuery.filter) || boolQuery.filter.length === 0)) {
                // Elasticsearch semantics: an empty should clause with no must/filter means the whole bool query matches no documents.
                return { documents: new Set() };
            }

            let results = new Set<string>();

            // Process filter clauses first (mandatory)
            if (boolQuery.filter && Array.isArray(boolQuery.filter)) {
                for (const filterClause of boolQuery.filter) {
                    const filterResult = this.execute(filterClause);
                    if (results.size === 0) {
                        results = new Set(filterResult.documents);
                    } else {
                        results = new Set([...results].filter(docId => filterResult.documents.has(docId)));
                    }
                }
            }

            // Process must clauses (mandatory)
            if (boolQuery.must && Array.isArray(boolQuery.must)) {
                for (const mustClause of boolQuery.must) {
                    const mustResult = this.execute(mustClause);
                    if (results.size === 0) {
                        results = new Set(mustResult.documents);
                    } else {
                        results = new Set([...results].filter(docId => mustResult.documents.has(docId)));
                    }
                }
            }

            // Process should clauses (optional, but at least one must match if minimum_should_match is set)
            if (boolQuery.should && Array.isArray(boolQuery.should) && boolQuery.should.length > 0) {
                const shouldResults = new Set<string>();
                for (const shouldClause of boolQuery.should) {
                    const clauseResult = this.execute(shouldClause);
                    for (const docId of clauseResult.documents) {
                        shouldResults.add(docId);
                    }
                }

                // If we have must/filter results, intersect with should results
                if (results.size > 0) {
                    results = new Set([...results].filter(docId => shouldResults.has(docId)));
                } else {
                    results = shouldResults;
                }
            }

            // Process must_not clauses (exclusion)
            if (boolQuery.must_not && Array.isArray(boolQuery.must_not)) {
                for (const mustNotClause of boolQuery.must_not) {
                    const mustNotResult = this.execute(mustNotClause);
                    results = new Set([...results].filter(docId => !mustNotResult.documents.has(docId)));
                }
            }

            return { documents: results };
        }
        return { documents: new Set() };
    }

    private _processRange(query: Query): ProcessingResult {
        if (query.range) {
            const rangeQuery = query.range;
            const field = rangeQuery.field;
            const conditions = {
                gte: rangeQuery.gte,
                lte: rangeQuery.lte,
                gt: rangeQuery.gt,
                lt: rangeQuery.lt
            };

            const resultDocuments = new Set<string>();
            for (const [docId, doc] of this.documents.entries()) {
                if (!field) continue;
                const value = this._getFieldValue(doc, field);
                if (value === undefined || value === null) continue;

                let matches = true;
                if (conditions.gte !== undefined && value < conditions.gte) matches = false;
                if (conditions.gt !== undefined && value <= conditions.gt) matches = false;
                if (conditions.lte !== undefined && value > conditions.lte) matches = false;
                if (conditions.lt !== undefined && value >= conditions.lt) matches = false;

                if (matches) {
                    resultDocuments.add(docId);
                }
            }
            return { documents: resultDocuments };
        }
        return { documents: new Set() };
    }

    private _processPrefix(query: Query): ProcessingResult {
        if (query.prefix) {
            const prefixQuery = query.prefix;
            const field = prefixQuery.field;
            const value = prefixQuery.value;

            if (field === '*') {
                const textFields = this._getTextFields();
                const allResults = new Set<string>();
                for (const textField of textFields) {
                    const fieldResult = this._processPrefix({ prefix: { field: textField, value } });
                    for (const docId of fieldResult.documents) {
                        allResults.add(docId);
                    }
                }
                return { documents: allResults };
            }

            if (!field || value === undefined) return { documents: new Set() };
            const normalizedPrefix = this._normalize(field, value);
            const matchingTokens = new Set<string>();
            const fieldTokens = this._getFieldTokens(field);

            for (const token of fieldTokens) {
                if (token.startsWith(normalizedPrefix)) {
                    matchingTokens.add(token);
                }
            }

            const resultDocuments = new Set<string>();
            for (const token of matchingTokens) {
                const docs = this.invertedIndex.getDocuments(field, token);
                for (const doc of docs) {
                    resultDocuments.add(doc);
                }
            }
            return { documents: resultDocuments };
        }
        return { documents: new Set() };
    }

    private _processWildcard(query: Query): ProcessingResult {
        if (query.wildcard) {
            const wildcardQuery = query.wildcard;
            const field = wildcardQuery.field;
            const value = wildcardQuery.value;

            if (field === '*') {
                const textFields = this._getTextFields();
                const allResults = new Set<string>();
                for (const textField of textFields) {
                    const fieldResult = this._processWildcard({ wildcard: { field: textField, value } });
                    for (const docId of fieldResult.documents) {
                        allResults.add(docId);
                    }
                }
                return { documents: allResults };
            }

            if (!field || value === undefined) return { documents: new Set() };
            const regex = new RegExp(`^${value.replace(/\*/g, '.*').replace(/\?/g, '.')}$`);
            const matchingTokens = new Set<string>();
            const fieldTokens = this._getFieldTokens(field);

            for (const token of fieldTokens) {
                if (regex.test(token)) {
                    matchingTokens.add(token);
                }
            }

            const resultDocuments = new Set<string>();
            for (const token of matchingTokens) {
                const docs = this.invertedIndex.getDocuments(field, token);
                for (const doc of docs) {
                    resultDocuments.add(doc);
                }
            }
            return { documents: resultDocuments };
        }
        return { documents: new Set() };
    }

    /**
     * Fuzzy wildcard matching implementation
     */
    private _fuzzyWildcardMatch(value: string, pattern: string, fuzziness: number): boolean {
        // This is a simplified placeholder.
        // A real implementation might use a more advanced algorithm like a Trie with fuzzy matching.
        const regex = new RegExp(`^${pattern.replace(/\*/g, '.*').replace(/\?/g, '.')}$`);
        if (regex.test(value)) return true;
        if (levenshteinDistance(value, pattern) <= fuzziness) return true;
        return false;
    }

    private _processFuzzy(query: Query): ProcessingResult {
        if (query.fuzzy) {
            const fuzzyQuery = query.fuzzy;
            const field = fuzzyQuery.field;
            const value = fuzzyQuery.value;
            const fuzziness = fuzzyQuery.fuzziness !== undefined ? fuzzyQuery.fuzziness : 1;
            if (field && value !== undefined) {
                return this._processSingleTerm(field, value, fuzziness);
            }
        }
        return { documents: new Set() };
    }

    private _processGeoDistance(query: Query): ProcessingResult {
        if (query.geo_distance) {
            const geoQuery = query.geo_distance;
            const field = geoQuery.field;
            // Accept distance as number (treated as kilometres) or string with units (e.g. "100km", "5000m")
            let distanceMeters: number | null = null;
            if (typeof geoQuery.distance === 'number') {
                distanceMeters = geoQuery.distance * 1000; // assume km → metres
            } else if (typeof geoQuery.distance === 'string') {
                const trimmed = geoQuery.distance.trim().toLowerCase();
                if (trimmed.endsWith('km')) {
                    distanceMeters = parseFloat(trimmed.replace(/km$/, '')) * 1000;
                } else if (trimmed.endsWith('m')) {
                    distanceMeters = parseFloat(trimmed.replace(/m$/, ''));
                } else {
                    // Default to kilometres when unit unspecified
                    distanceMeters = parseFloat(trimmed) * 1000;
                }
            }

            const center = geoQuery.location || geoQuery.center;
            if (!center || !field || distanceMeters == null || isNaN(distanceMeters)) {
                return { documents: new Set() };
            }

            // Interpret centre either as [lat, lon] array or {lat, lon}
            let centerLat: number, centerLon: number;
            if (Array.isArray(center)) {
                // Accept [lat, lon] (most common) but also fallback to [lon, lat] by checking ranges
                const [first, second] = center;
                // Latitude is -90..90, longitude is -180..180 – simple heuristic
                if (Math.abs(first) <= 90 && Math.abs(second) <= 180) {
                    centerLat = first;
                    centerLon = second;
                } else {
                    centerLat = second;
                    centerLon = first;
                }
            } else if (typeof center === 'object' && 'lat' in center && 'lon' in center) {
                centerLat = center.lat;
                centerLon = center.lon;
            } else {
                return { documents: new Set() };
            }

            const resultDocuments = new Set<string>();
            for (const [docId, doc] of this.documents.entries()) {
                const geoPoint = this._getFieldValue(doc, field);
                if (!geoPoint) continue;

                let docLat: number, docLon: number;
                if (Array.isArray(geoPoint)) {
                    const [first, second] = geoPoint;
                    if (Math.abs(first) <= 90 && Math.abs(second) <= 180) {
                        docLat = first;
                        docLon = second;
                    } else {
                        docLat = second;
                        docLon = first;
                    }
                } else if (typeof geoPoint === 'object' && 'lat' in geoPoint && 'lon' in geoPoint) {
                    docLat = geoPoint.lat;
                    docLon = geoPoint.lon;
                } else {
                    continue;
                }

                const dist = this._calculateDistance(centerLat, centerLon, docLat, docLon);
                if (dist <= distanceMeters) {
                    resultDocuments.add(docId);
                }
            }
            return { documents: resultDocuments };
        }
        return { documents: new Set() };
    }

    private _calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
        const R = 6371e3; // metres
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c; // in metres
    }

    private _processPhrase(query: Query): ProcessingResult {
        const phraseData = query.match_phrase || query.phrase;
        if (phraseData) {
            const field = phraseData.field;
            const value = phraseData.value;
            const slop = phraseData.slop || 0;
            const fuzziness = phraseData.fuzziness || 0;

            if (!field || value === undefined) {
                return { documents: new Set() };
            }

            const phraseTokens = this.tokenizer.tokenize(value);
            if (phraseTokens.length === 0) {
                return { documents: new Set() };
            }

            // Get initial document set from the first token
            const firstTokenResult = this._processSingleTerm(field, phraseTokens[0], fuzziness);
            const candidateDocs = firstTokenResult.documents;
            const finalDocs = new Set<string>();

            for (const docId of candidateDocs) {
                const doc = this.documents.get(docId);
                if (!doc) continue;

                const fieldValue = this._getFieldValue(doc, field);
                if (typeof fieldValue !== 'string') continue;

                const docTokens = this.tokenizer.tokenize(fieldValue);

                if (fuzziness > 0) {
                    if (this._checkFuzzyPhraseProximity(docTokens, phraseTokens, slop, fuzziness)) {
                        finalDocs.add(docId);
                    }
                } else {
                    if (this._checkPhraseProximity(docTokens, phraseTokens, slop)) {
                        finalDocs.add(docId);
                    }
                }
            }
            return { documents: finalDocs };
        }
        return { documents: new Set() };
    }

    private _processMatchPhrase(query: Query): ProcessingResult {
        return this._processPhrase(query);
    }

    private _checkPhraseProximity(docTokens: string[], phraseTokens: string[], slop: number): boolean {
        if (phraseTokens.length === 0) return true;
        if (docTokens.length < phraseTokens.length) return false;

        const normalizedPhraseTokens = phraseTokens.map(token => token.toLowerCase());
        const normalizedDocTokens = docTokens.map(token => token.toLowerCase());

        // Find all possible starting positions for the phrase
        for (let i = 0; i <= normalizedDocTokens.length - normalizedPhraseTokens.length; i++) {
            let matches = 0;
            let maxGap = 0;
            let lastMatchPos = i - 1;

            for (let j = 0; j < normalizedPhraseTokens.length; j++) {
                const phraseToken = normalizedPhraseTokens[j];
                let found = false;

                // Look for the token within the allowed slop distance
                for (let k = Math.max(lastMatchPos + 1, i + j); k < Math.min(normalizedDocTokens.length, i + j + slop + 1); k++) {
                    if (normalizedDocTokens[k] === phraseToken) {
                        matches++;
                        const gap = k - lastMatchPos - 1;
                        maxGap = Math.max(maxGap, gap);
                        lastMatchPos = k;
                        found = true;
                        break;
                    }
                }

                if (!found) break;
            }

            if (matches === normalizedPhraseTokens.length && maxGap <= slop) {
                return true;
            }
        }

        return false;
    }

    private _checkFuzzyPhraseProximity(docTokens: string[], phraseTokens: string[], slop: number, fuzziness: number): boolean {
        if (phraseTokens.length === 0) return true;
        if (docTokens.length < phraseTokens.length) return false;

        const normalizedPhraseTokens = phraseTokens.map(token => token.toLowerCase());
        const normalizedDocTokens = docTokens.map(token => token.toLowerCase());

        // Find all possible starting positions for the fuzzy phrase
        for (let i = 0; i <= normalizedDocTokens.length - normalizedPhraseTokens.length; i++) {
            let matches = 0;
            let maxGap = 0;
            let lastMatchPos = i - 1;

            for (let j = 0; j < normalizedPhraseTokens.length; j++) {
                const phraseToken = normalizedPhraseTokens[j];
                let found = false;

                // Look for the token within the allowed slop distance with fuzziness
                for (let k = Math.max(lastMatchPos + 1, i + j); k < Math.min(normalizedDocTokens.length, i + j + slop + fuzziness + 1); k++) {
                    const docToken = normalizedDocTokens[k];
                    if (levenshteinDistance(phraseToken, docToken) <= fuzziness) {
                        matches++;
                        const gap = k - lastMatchPos - 1;
                        maxGap = Math.max(maxGap, gap);
                        lastMatchPos = k;
                        found = true;
                        break;
                    }
                }

                if (!found) {
                    break;
                }
            }

            // Check if we found all tokens within acceptable proximity
            if (matches === normalizedPhraseTokens.length && maxGap <= slop) {
                return true;
            }
        }

        return false;
    }

    private _normalize(field: string, token: string): string {
        // Apply field-specific normalization
        return token.toLowerCase();
    }

    private _getFieldValue(doc: any, field: string): any {
        // First try direct property access (for flattened nested documents)
        if (doc.hasOwnProperty(field)) {
            return doc[field];
        }

        // Then try nested field access (e.g., "user.name")
        const parts = field.split('.');
        let value = doc;
        for (const part of parts) {
            value = value?.[part];
            if (value === undefined) break;
        }
        return value;
    }

    private _unionSets(sets: Set<string>[]): Set<string> {
        const result = new Set<string>();
        for (const set of sets) {
            for (const item of set) {
                result.add(item);
            }
        }
        return result;
    }

    private _intersectSets(set1: Set<string>, set2: Set<string>): Set<string> {
        const result = new Set<string>();
        for (const item of set1) {
            if (set2.has(item)) {
                result.add(item);
            }
        }
        return result;
    }

    private _differenceSets(set1: Set<string>, set2: Set<string>): Set<string> {
        const result = new Set<string>();
        for (const item of set1) {
            if (!set2.has(item)) {
                result.add(item);
            }
        }
        return result;
    }

    private _getTextFields(): Set<string> {
        if (this._textFieldsCache === null) {
            this._textFieldsCache = new Set();
            if (this.mappingsManager && this.mappingsManager.getTextFields) {
                const textFields = this.mappingsManager.getTextFields();
                for (const field of textFields) {
                    this._textFieldsCache.add(field);
                }
            }
        }
        return this._textFieldsCache;
    }

    private _getAllTokensCached(): Set<string> {
        if (this._allTokensCache === null) {
            this._allTokensCache = new Set();
            if (this.invertedIndex && this.invertedIndex.getAllTokens) {
                const tokens = this.invertedIndex.getAllTokens();
                for (const token of tokens) {
                    this._allTokensCache.add(token);
                }
            }
        }
        return this._allTokensCache;
    }

    private _getFieldTokens(field: string): Set<string> {
        if (!this._fieldTokensCache.has(field)) {
            const tokens = new Set<string>();
            if (this.invertedIndex && this.invertedIndex.getFieldTokens) {
                const fieldTokens = this.invertedIndex.getFieldTokens(field);
                for (const token of fieldTokens) {
                    tokens.add(token);
                }
            }
            this._fieldTokensCache.set(field, tokens);
        }
        return this._fieldTokensCache.get(field)!;
    }

    private _invalidateCache(): void {
        this._cacheVersion++;
        this._fieldTokensCache.clear();
        this._textFieldsCache = null;
        this._allTokensCache = null;
    }

    private _getAnalyzerForFieldType(fieldType: string): string {
        switch (fieldType) {
            case 'text':
                return 'standard';
            case 'keyword':
                return 'keyword';
            default:
                return 'standard';
        }
    }

    // Public method to invalidate cache when index changes
    public invalidateCache(): void {
        this._invalidateCache();
    }
}