import MappingsManager from "./MappingsManager.js";
import RankingPipeline from "./RankingPipeline.js";
import SynonymEngine from "./SynonymEngine.js";

export default class QueryEngine {
    constructor(invertedIndex, synonymEngine, tokenizer, documents) {
        this.invertedIndex = invertedIndex;
        this.synonymEngine = synonymEngine;
        this.tokenizer = tokenizer;
        this.documents = documents;
    }

    search(query, context = {}) {
        return this._search(query);
    }

    execute(query) {
        return this._search(query);
    }

    _search(query) {
        if (!query) {
            return new Set();
        }

        if (query.bool) {
            const bool = query.bool;
            const mustSets = [];
            const shouldSets = [];
            const mustNotSets = [];

            // Process must clauses
            for (const clause of bool.must ?? []) {
                const docSet = this._processClause(clause);
                mustSets.push(docSet);
            }

            // Process must_not clauses
            for (const clause of bool.must_not ?? []) {
                const docSet = this._processClause(clause);
                mustNotSets.push(docSet);
            }

            // Process should clauses
            for (const clause of bool.should ?? []) {
                const docSet = this._processClause(clause);
                shouldSets.push(docSet);
            }

            // Combine results
            let result;
            if (mustSets.length > 0) {
                // When must clauses exist, they define the base result set
                result = this._intersectSets(mustSets);
                // should clauses are used for scoring/boosting, not filtering
                // so we don't union them with must results
            } else if (shouldSets.length > 0) {
                // When only should clauses exist, at least one should match
                result = this._unionSets(shouldSets);
            } else {
                result = new Set();
            }

            // Apply must_not (subtract)
            for (const mustNotSet of mustNotSets) {
                result = this._subtractSets(result, mustNotSet);
            }

            return result;
        }
        // If not a bool query, treat as a single clause
        return this._processClause(query);
    }

    _processClause(clause) {
        if (clause.match) {
            // Unified syntax: { field, value }
            const { field, value } = clause.match;
            return this._tokenToDocs(field, value);
        }
        if (clause.term) {
            // Unified syntax: { field, value }
            const { field, value } = clause.term;
            return this._termToDocs(field, value);
        }
        if (clause.range) {
            // Range syntax: { field, gte, lte }
            const { field, gte, lte } = clause.range;
            return this._rangeToDocs(field, { gte, lte });
        }
        if (clause.geo_distance) {
            // Geo distance syntax: { field, center, distance }
            const { field, center, distance } = clause.geo_distance;
            return this._geoToDocs(field, center, distance);
        }
        if (clause.prefix) {
            // Unified syntax: { field, value }
            const { field, value } = clause.prefix;
            return this._prefixToDocs(field, value);
        }
        if (clause.fuzzy) {
            // Unified syntax: { field, value, fuzziness }
            const { field, value, fuzziness = 2 } = clause.fuzzy;
            return this._fuzzyToDocs(field, value, fuzziness);
        }
        if (clause.wildcard) {
            // Unified syntax: { field, value }
            const { field, value } = clause.wildcard;
            return this._wildcardToDocs(field, value);
        }
        if (clause.match_phrase) {
            // Unified syntax: { field, value, slop }
            const { field, value, slop = 0 } = clause.match_phrase;
            return this._phraseToDocs(field, value, slop);
        }
        if (clause.phrase) {
            // Unified syntax: { field, value, slop }
            const { field, value, slop = 0 } = clause.phrase;
            return this._phraseToDocs(field, value, slop);
        }
        return new Set();
    }

    _tokenToDocs(field, q) {
        if (!q || !field) return new Set();

        // Tokenize the query string to handle multi-word queries
        const queryWords = (typeof q === 'string' ? q.toLowerCase().split(/\s+/).filter(Boolean) : []);

        if (queryWords.length === 1) {
            // Single word query - use original logic with synonyms
            const tokens = this._expandSynonyms(field, q);
            const result = new Set();
            for (const token of tokens) {
                const posting = this.invertedIndex.getPosting(token);
                for (const docId of posting.keys()) {
                    result.add(docId);
                }
            }
            return result;
        } else if (queryWords.length > 1) {
            // Multi-word query - find documents that contain ALL words (AND logic)
            const wordSets = queryWords.map(word => {
                const tokens = this._expandSynonyms(field, word);
                const wordDocs = new Set();
                for (const token of tokens) {
                    const posting = this.invertedIndex.getPosting(token);
                    for (const docId of posting.keys()) {
                        wordDocs.add(docId);
                    }
                }
                return wordDocs;
            });

            // Intersect all sets to find documents containing ALL words
            let result = wordSets[0] || new Set();
            for (let i = 1; i < wordSets.length; i++) {
                result = new Set([...result].filter(docId => wordSets[i].has(docId)));
            }
            return result;
        }
        return new Set();
    }

    _expandSynonyms(field, q) {
        const synonyms = this.synonymEngine?.get(q) ?? new Set();
        return [this._normalize(field, q), ...[...synonyms].map(syn => this._normalize(field, syn))];
    }

    _termToDocs(field, value) {
        const token = this._normalize(field, value);
        const posting = this.invertedIndex.getPosting(token);
        return new Set(posting.keys());
    }

    _rangeToDocs(field, range) {
        const result = new Set();
        if (!this.documents) return result;

        for (const [docId, doc] of this.documents.entries()) {
            const v = doc[field];
            if (v == null) continue;

            let matches = true;

            if (range.gte !== undefined && v < range.gte) {
                matches = false;
            }
            if (range.lte !== undefined && v > range.lte) {
                matches = false;
            }

            if (matches) {
                result.add(docId);
            }
        }
        return result;
    }

    _geoToDocs(field, center, distance) {
        const results = new Set();
        if (!this.documents) return results;
        for (const [docId, doc] of this.documents.entries()) {
            const coords = doc[field];
            if (!coords) continue;
            let lat, lon;
            if (Array.isArray(coords)) {
                [lat, lon] = coords;
            } else if (coords.lat !== undefined && coords.lon !== undefined) {
                lat = coords.lat;
                lon = coords.lon;
            } else {
                continue; // Invalid format
            }
            // Validate coordinates
            if (typeof lat !== 'number' || typeof lon !== 'number' || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
                continue;
            }
            const d = this._haversine(center.lat || center[1], center.lon || center[0], lat, lon);
            if (d <= distance) { // distance already in km from haversine
                results.add(docId);
            }
        }
        return results;
    }

    _geoDistanceToDocs(field, center, distance) {
        return this._geoToDocs(field, center, distance);
    }

    _prefixToDocs(field, prefix) {
        if (!prefix || !field) return new Set();
        // Tokenize the prefix string to handle multi-word prefixes
        const prefixWords = (typeof prefix === 'string' ? prefix.toLowerCase().split(/\s+/).filter(Boolean) : []);

        if (prefixWords.length === 1) {
            // Single word prefix - match tokens where the term starts with the prefix
            const word = prefixWords[0];
            const result = new Set();
            for (const token of this.invertedIndex.index.keys()) {
                if (token.startsWith(`${field}:`)) {
                    const term = token.split(':')[1];
                    if (term && term.startsWith(word)) {
                        const posting = this.invertedIndex.getPosting(token);
                        for (const docId of posting.keys()) {
                            result.add(docId);
                        }
                    }
                }
            }
            return result;
        } else if (prefixWords.length > 1) {
            // Multi-word prefix - find documents that contain ALL words (AND logic)
            const wordSets = prefixWords.map(word => {
                const wordDocs = new Set();
                for (const token of this.invertedIndex.index.keys()) {
                    if (token.startsWith(`${field}:`)) {
                        const term = token.split(':')[1];
                        if (term && term.startsWith(word)) {
                            const posting = this.invertedIndex.getPosting(token);
                            for (const docId of posting.keys()) {
                                wordDocs.add(docId);
                            }
                        }
                    }
                }
                return wordDocs;
            });

            // Intersect all sets to find documents containing ALL words
            let result = wordSets[0] || new Set();
            for (let i = 1; i < wordSets.length; i++) {
                result = new Set([...result].filter(docId => wordSets[i].has(docId)));
            }
            return result;
        }
        return new Set();
    }

    _fuzzyToDocs(field, q, fuzziness) {
        const result = new Set();
        const qNorm = q.toLowerCase();
        for (const token of this.invertedIndex.index.keys()) {
            if (!token.startsWith(`${field}:`)) {
                continue;
            }
            const term = token.split(":")[1].toLowerCase();
            const dist = this._levenshtein(term, qNorm);
            if (dist <= fuzziness) {
                const posting = this.invertedIndex.getPosting(token);
                for (const docId of posting.keys()) {
                    result.add(docId);
                }
            }
        }
        return result;
    }

    _wildcardToDocs(field, pattern) {
        const result = new Set();

        // Handle empty pattern
        if (!pattern || pattern.trim() === '') {
            return result;
        }

        // Only treat as special if pattern contains special chars EXCEPT * and ?
        const hasSpecialChars = /[@#$%^&()_+\-=\[\]{};':"\\|,.<>\/]/.test(pattern); // removed * and ?

        if (hasSpecialChars && this.documents) {
            // For patterns with special characters, search across full field values
            const regex = this._wildcardToRegex(pattern.toLowerCase());

            for (const [docId, doc] of this.documents.entries()) {
                const fieldValue = doc[field];
                if (fieldValue && typeof fieldValue === 'string') {
                    if (regex.test(fieldValue.toLowerCase())) {
                        result.add(docId);
                    }
                }
            }
        } else {
            // For simple patterns, search through tokens in the inverted index
            const regex = this._wildcardToRegex(pattern.toLowerCase());

            // Search through all tokens in the inverted index
            for (const token of this.invertedIndex.index.keys()) {
                // Check if token belongs to the specified field
                if (!token.startsWith(`${field}:`)) {
                    continue;
                }

                // Extract the term part (remove field prefix)
                const term = token.split(":")[1];

                // Test if the term matches the wildcard pattern
                if (regex.test(term)) {
                    const posting = this.invertedIndex.getPosting(token);
                    for (const docId of posting.keys()) {
                        result.add(docId);
                    }
                }
            }
        }

        return result;
    }

    _phraseToDocs(field, phrase, slop) {
        const tokens = phrase.toLowerCase().split(/\s+/);
        const termPostings = tokens.map(token => {
            const posting = this.invertedIndex.getPosting(`${field}:${token}`) || new Map();
            return posting;
        });

        if (termPostings.some(posting => posting.size === 0)) {
            return new Set();
        }

        const result = new Set();
        const firstPosting = termPostings[0];
        for (const docId of firstPosting.keys()) {
            const positionsList = termPostings.map(posting => {
                const docInfo = posting.get(docId);
                return docInfo ? docInfo.positions : [];
            });
            if (this._checkPhrase(positionsList, slop)) {
                result.add(docId);
            }
        }
        return result;
    }

    _checkPositionsWithSlop(positionsList, slop = 0) {
        // For each position in the first term
        for (const start of positionsList[0]) {
            let match = true;
            // For each subsequent term, check if it has a position at start + i (+/- slop)
            for (let i = 1; i < positionsList.length; i++) {
                const expected = start + i;
                const positions = positionsList[i];
                if (!positions.some(p => Math.abs(p - expected) <= slop)) {
                    match = false;
                    break;
                }
            }
            if (match) return true;
        }
        return false;
    }

    _checkPhrase(positionsList, slop = 0) {
        // For each position in the first term
        for (const start of positionsList[0]) {
            let match = true;
            // For each subsequent term, check if it has a position at start + i (+/- slop)
            for (let i = 1; i < positionsList.length; i++) {
                const expected = start + i;
                const positions = positionsList[i];
                if (!positions.some(p => Math.abs(p - expected) <= slop)) {
                    match = false;
                    break;
                }
            }
            if (match) return true;
        }
        return false;
    }

    _normalize(field, token) {
        return `${field}:${token.toLowerCase()}`;
    }

    _wildcardToRegex(pattern) {
        // Handle empty pattern
        if (!pattern || pattern.trim() === '') {
            return new RegExp('.*');
        }

        // Escape special regex characters except * and ?
        const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');

        // Convert wildcard characters to regex patterns
        const regexPattern = "^" +
            escaped
                .replace(/\*/g, ".*")  // * matches zero or more characters
                .replace(/\?/g, ".")   // ? matches exactly one character
            + "$";

        try {
            return new RegExp(regexPattern, 'i'); // Case insensitive
        } catch (error) {
            // console.warn(`Invalid wildcard pattern: ${pattern}, using literal match`);
            // Fallback to literal match if regex is invalid
            for (const token of this.invertedIndex.index.keys()) {
                if (token.startsWith(`${field}:`)) {
                    const term = token.split(':')[1];
                    if (term && term.startsWith(pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&'))) {
                        const posting = this.invertedIndex.getPosting(token);
                        for (const docId of posting.keys()) {
                            result.add(docId);
                        }
                    }
                }
            }
        }
        return result;
    }

    _levenshtein(a, b) {
        const dp = Array.from({ length: a.length + 1 }, () =>
            new Array(b.length + 1).fill(0)
        );
        for (let i = 0; i <= a.length; i++) dp[i][0] = i;
        for (let j = 0; j <= b.length; j++) dp[0][j] = j;
        for (let i = 1; i <= a.length; i++) {
            for (let j = 1; j <= b.length; j++) {
                if (a[i - 1] === b[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1];
                } else {
                    dp[i][j] = Math.min(
                        dp[i - 1][j - 1],
                        dp[i][j - 1],
                        dp[i - 1][j]
                    ) + 1;
                }
            }
        }
        return dp[a.length][b.length];
    }

    _haversine(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth's radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    _unionSets(sets) {
        const result = new Set();
        for (const set of sets) {
            for (const item of set) {
                result.add(item);
            }
        }
        return result;
    }

    _intersectSets(sets) {
        if (sets.length === 0) return new Set();
        if (sets.length === 1) return new Set(sets[0]);

        let result = new Set(sets[0]);
        for (let i = 1; i < sets.length; i++) {
            result = new Set([...result].filter(x => sets[i].has(x)));
        }
        return result;
    }

    _subtractSets(setA, setB) {
        const result = new Set();
        for (const item of setA) {
            if (!setB.has(item)) {
                result.add(item);
            }
        }
        return result;
    }
}
