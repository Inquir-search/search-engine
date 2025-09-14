import QueryEngine from "./QueryEngine.js";
import GeoEngine from "./GeoEngine.js";
import FacetEngine from "./FacetEngine.js";
import PersonalizationEngine from "./PersonalizationEngine.js";
import InvertedIndex from "./InvertedIndex.js";

export default class SearchEngine {
    constructor({
        name = 'default',
        tokenizer,
        scorerFactory,
        invertedIndex,
        rankingPipeline,
        stopwordsManager,
        synonymEngine,
        facetFields = [],
        mappingsManager,
        persistence,
        aof,
        flushIntervalMs = 10000
    }) {
        this.name = name;
        this.tokenizer = tokenizer;
        this.scorerFactoryBuilder = scorerFactory || (() => ({ score: () => 1 }));
        this.invertedIndex = invertedIndex;
        this.documents = new Map();
        this.docLengths = new Map();
        this.totalDocs = 0;
        this.avgDocLength = 0;
        this.persistence = persistence;
        this.aof = aof;
        this.flushIntervalMs = flushIntervalMs;
        this.flushTimer = null;
        this.stopwordsManager = stopwordsManager;
        this.synonymEngine = synonymEngine;
        this.facetEngine = new FacetEngine(facetFields);
        this.geoEngine = new GeoEngine();
        this.personalizationEngine = new PersonalizationEngine();
        this.mappingsManager = mappingsManager;
        this.rankingPipeline = rankingPipeline;
        this._facetFields = facetFields;

        this.queryEngine = new QueryEngine(
            this.invertedIndex,
            this.synonymEngine,
            this.tokenizer,
            this.documents
        );

        this._tryLoadFromStorage();
        this._startFlushTimer();
    }

    get facetFields() {
        return this._facetFields;
    }

    set facetFields(fields) {
        this._facetFields = fields;
        this.facetEngine = new FacetEngine(fields);
        // Re-add all existing documents to the new facet engine
        for (const doc of this.documents.values()) {
            this.facetEngine.add(doc);
        }
    }

    _tryLoadFromStorage() {
        if (!this.persistence) {
            this.scorer = this.scorerFactoryBuilder(
                this.totalDocs,
                this.avgDocLength,
                this.docLengths,
                this.invertedIndex
            );
            this.queryEngine.scorer = this.scorer;
            return;
        }

        const state = this.persistence.loadSnapshotSync();
        if (state) {
            if (state.indexName) {
                this.name = state.indexName;
            }
            this.documents = new Map(state.documents);
            // Ensure query engine uses the restored documents map
            this.queryEngine.documents = this.documents;

            this.invertedIndex = InvertedIndex.deserialize(state.invertedIndex);
            this.queryEngine.invertedIndex = this.invertedIndex;
            this.docLengths = new Map(state.docLengths);
            this.totalDocs = state.totalDocs;
            this.avgDocLength = state.avgDocLength;
            console.log(`Restored snapshot with ${this.totalDocs} documents`);

            // Rebuild facet index from restored documents
            for (const doc of this.documents.values()) {
                this.facetEngine.add(doc);
            }

            // Validate document consistency
            const docIds = new Set(this.documents.keys());
            let inconsistentCount = 0;

            for (const [term, posting] of this.invertedIndex.index.entries()) {
                for (const docId of posting.keys()) {
                    if (!docIds.has(docId)) {
                        inconsistentCount++;
                        posting.delete(docId);
                    }
                }
                // Clean up empty postings
                if (posting.size === 0) {
                    this.invertedIndex.index.delete(term);
                }
            }

            if (inconsistentCount > 0) {
                console.log(`⚠️  Fixed ${inconsistentCount} inconsistent document references`);
            }
        }
        this.scorer = this.scorerFactoryBuilder(
            this.totalDocs,
            this.avgDocLength,
            this.docLengths,
            this.invertedIndex
        );
        // Ensure query engine uses the current scorer after loading
        this.queryEngine.scorer = this.scorer;
    }

    _startFlushTimer() {
        if (this.persistence) {
            this.flushTimer = setInterval(() => this.flush(), this.flushIntervalMs);
        }
    }

    flush() {
        if (!this.persistence) return;

        const state = {
            // Ensure deterministic ordering for snapshot contents
            documents: Array.from(this.documents.entries()).sort((a, b) => a[0].localeCompare(b[0])),
            invertedIndex: this.invertedIndex.serialize(),
            docLengths: Array.from(this.docLengths.entries()).sort((a, b) => a[0].localeCompare(b[0])),
            totalDocs: this.totalDocs,
            avgDocLength: this.avgDocLength,
            indexName: this.name,
        };
        this.persistence.saveSnapshot(state);
        console.log('Flushed snapshot');
    }

    shutdown() {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
        }
        this.flush();
        if (this.aof) {
            this.aof.close();
        }
    }

    add(doc) {
        if (!doc || !doc.id) {
            throw new Error('Document and document id cannot be null');
        }

        if (this.documents.has(doc.id)) {
            this.delete(doc.id);
        }

        // Auto-extend mappings for new fields
        this.mappingsManager.autoExtend(doc);

        this.documents.set(doc.id, doc);

        let allTokens = [];

        for (const field of Object.keys(doc).filter(k => k !== "id")) {
            const type = this.mappingsManager.getFieldType(field);
            const value = doc[field];
            if (value == null) continue;

            if (type === "text" && typeof value === "string") {
                // Use standard analyzer for text fields by default
                const tokens = this.tokenizer.tokenize(value, 'standard');
                // console.log(`Indexing doc ${doc.id}, field ${field}, tokens: ${tokens}`);
                allTokens = allTokens.concat(tokens);
                tokens.forEach((token, pos) => {
                    this.invertedIndex.addToken(`${field}:${token}`, doc.id, pos);
                });
            } else if (type === "keyword" && typeof value === "string") {
                // Use keyword analyzer for keyword fields
                const tokens = this.tokenizer.tokenize(value, 'keyword');
                tokens.forEach((token, pos) => {
                    this.invertedIndex.addToken(`${field}:${token}`, doc.id, pos);
                });
            } else if (type === "email" && typeof value === "string") {
                // Use email analyzer for email fields
                const tokens = this.tokenizer.tokenize(value, 'email');
                tokens.forEach((token, pos) => {
                    this.invertedIndex.addToken(`${field}:${token}`, doc.id, pos);
                });
            } else if (type === "url" && typeof value === "string") {
                // Use URL analyzer for URL fields
                const tokens = this.tokenizer.tokenize(value, 'url');
                tokens.forEach((token, pos) => {
                    this.invertedIndex.addToken(`${field}:${token}`, doc.id, pos);
                });
            } else if (type === "phone" && typeof value === "string") {
                // Use phone analyzer for phone fields
                const tokens = this.tokenizer.tokenize(value, 'phone');
                tokens.forEach((token, pos) => {
                    this.invertedIndex.addToken(`${field}:${token}`, doc.id, pos);
                });
            } else if (type === "geo_point" && Array.isArray(value)) {
                // geo handled in geoEngine, store raw in doc
            } else if (
                ["float", "integer", "double", "long", "short", "byte"].includes(type) ||
                type === "boolean" ||
                type === "date"
            ) {
                // just store in documents, no inverted
            }
        }

        this.docLengths.set(doc.id, allTokens.length);
        this.totalDocs++;
        this._recalculateAvgDocLength();

        this.scorer = this.scorerFactoryBuilder(
            this.totalDocs,
            this.avgDocLength,
            this.docLengths,
            this.invertedIndex
        );
        this.queryEngine.scorer = this.scorer;

        this.facetEngine.add(doc);

        const termCounts = new Map();
        for (const [token, posting] of this.invertedIndex.index.entries()) {
            termCounts.set(token.split(":")[1], posting.size);
        }
        this.stopwordsManager.autoDetect(termCounts);

        if (this.aof) {
            this.aof.append({ type: "add", doc });
        }
    }

    delete(docId) {
        if (this.documents.delete(docId)) {
            this.docLengths.delete(docId);
            this.totalDocs--;

            for (const [term, posting] of this.invertedIndex.index.entries()) {
                posting.delete(docId);
                if (posting.size === 0) {
                    this.invertedIndex.index.delete(term);
                }
            }

            this._recalculateAvgDocLength();
            if (this.aof) {
                this.aof.append({ type: "delete", docId });
            }
        }
    }

    remove(docId) {
        return this.delete(docId);
    }

    search(query, context = {}) {
        // Handle pagination parameters
        const from = context.from || 0;
        const size = context.size !== undefined ? context.size : 10;

        // If no query is provided, return all documents
        if (!query || (typeof query === 'object' && Object.keys(query).length === 0)) {
            return this._returnAllDocs(from, size);
        }

        let finalQuery = query;

        // If the query is a simple string, transform it into a proper bool query
        if (typeof query === 'string') {
            const textFields = this.mappingsManager.getTextFields();

            // First tokenize to get filtered tokens
            const queryTerms = this.tokenizer.tokenize(query, 'standard');
            if (queryTerms.length === 0) {
                return this._returnAllDocs(from, size, true);
            }

            // Determine operator: 'and' or 'or' (default: 'and' for backwards compatibility)
            const operator = context.operator || 'and';

            if (operator === 'or') {
                // OR logic: Create individual match queries for each term
                const shouldClauses = [];

                for (const field of textFields) {
                    const analyzer = (this.mappingsManager.getFieldType(field) === 'keyword') ? 'keyword' : 'standard';
                    const fieldTokens = this.tokenizer.tokenize(query, analyzer);

                    if (fieldTokens.length > 0) {
                        // Create individual match queries for each token to enable OR behavior
                        for (const token of fieldTokens) {
                            shouldClauses.push({
                                match: {
                                    field,
                                    value: token
                                }
                            });
                        }
                    }
                }

                finalQuery = {
                    bool: {
                        should: shouldClauses
                    }
                };
            } else {
                // AND logic: Create match queries with full terms (default behavior)
                const filteredQuery = queryTerms.join(' ');
                finalQuery = {
                    bool: {
                        should: textFields.map(field => {
                            const analyzer = (this.mappingsManager.getFieldType(field) === 'keyword') ? 'keyword' : 'standard';
                            const fieldTokens = this.tokenizer.tokenize(query, analyzer);
                            const fieldQuery = fieldTokens.length > 0 ? fieldTokens.join(' ') : filteredQuery;
                            return {
                                match: {
                                    field,
                                    value: fieldQuery
                                }
                            };
                        })
                    }
                };
            }
        }

        // Ensure scorer is always valid
        if (!this.scorer || typeof this.scorer.score !== 'function') {
            if (this.scorerFactoryBuilder) {
                this.scorer = this.scorerFactoryBuilder(
                    this.totalDocs,
                    this.avgDocLength,
                    this.docLengths,
                    this.invertedIndex
                );
            } else {
                throw new Error('No scorerFactoryBuilder available to create scorer');
            }
        }

        // Check if all query terms are stopwords (i.e., all token arrays are empty for all fields)
        const textFields = this.mappingsManager.getTextFields();
        const tokenizer = this.tokenizer;
        let allEmpty = false;
        if (finalQuery && finalQuery.bool && (finalQuery.bool.should || finalQuery.bool.must)) {
            // Special case: if both should and must arrays are empty or malformed, this should return no results, not all results
            if ((!finalQuery.bool.should || !Array.isArray(finalQuery.bool.should) || finalQuery.bool.should.length === 0) && (!finalQuery.bool.must || !Array.isArray(finalQuery.bool.must) || finalQuery.bool.must.length === 0)) {
                const facets = this.facetEngine.calculate(new Set());
                return {
                    hits: [],
                    facets,
                    total: 0,
                    from,
                    size
                };
            }

            let queryTermsByField = {};
            let hasNonMatchClauses = false;

            // Process should clauses
            if (finalQuery.bool.should && Array.isArray(finalQuery.bool.should)) {
                hasNonMatchClauses = this._collectTokensFromClauses(finalQuery.bool.should, tokenizer, queryTermsByField) || hasNonMatchClauses;
            }

            // Process must clauses
            if (finalQuery.bool.must && Array.isArray(finalQuery.bool.must)) {
                hasNonMatchClauses = this._collectTokensFromClauses(finalQuery.bool.must, tokenizer, queryTermsByField) || hasNonMatchClauses;
            }

            allEmpty = Object.values(queryTermsByField).every(arr => arr.length === 0) && !hasNonMatchClauses;
        }
        if (allEmpty) {
            return this._returnAllDocs(from, size);
        }

        const docIds = this.queryEngine.search(finalQuery, context);

        // If no documents match the query, return empty results
        if (docIds.size === 0) {
            const facets = this.facetEngine.calculate(new Set());
            return {
                hits: [],
                facets,
                total: 0,
                from,
                size
            };
        }

        const docsToRank = [...docIds].map(id => this.documents.get(id)).filter(Boolean);

        const rankedDocs = this.rankingPipeline.rankWithDocuments(
            docsToRank,
            finalQuery,
            this.scorer,
            this.personalizationEngine,
            context,
            this.invertedIndex,
            this.tokenizer,
            this.mappingsManager,
        );

        // Apply pagination
        const paginatedDocs = rankedDocs.slice(from, from + size);

        const facets = this.facetEngine.calculate(new Set(rankedDocs.map(d => d.id)));
        return {
            hits: paginatedDocs,
            facets,
            total: rankedDocs.length,
            from,
            size
        };
    }

    _returnAllDocs(from, size, facetsFromAll = false) {
        const allDocs = Array.from(this.documents.values()).map(doc => ({
            ...doc,
            _score: 1.0
        }));
        const paginatedDocs = allDocs.slice(from, from + size);
        const facetDocs = facetsFromAll ? allDocs : paginatedDocs;
        const facets = this.facetEngine.calculate(new Set(facetDocs.map(d => d.id)));
        return {
            hits: paginatedDocs,
            facets,
            total: this.totalDocs,
            from,
            size
        };
    }

    _collectTokensFromClauses(clauses, tokenizer, queryTermsByField) {
        let hasNonMatch = false;
        for (const clause of clauses) {
            if (clause && clause.match && clause.match.field && clause.match.value) {
                const field = clause.match.field;
                const analyzer = (this.mappingsManager.getFieldType(field) === 'keyword') ? 'keyword' : 'standard';
                const tokens = tokenizer.tokenize(clause.match.value, analyzer);
                queryTermsByField[field] = tokens;
            } else if (clause && (clause.term || clause.prefix || clause.wildcard || clause.fuzzy || clause.range || clause.geo_distance || clause.match_phrase || clause.phrase)) {
                hasNonMatch = true;
            }
        }
        return hasNonMatch;
    }

    clean() {
        this.documents = new Map();
        this.docLengths = new Map();
        this.invertedIndex = new InvertedIndex();
        this.totalDocs = 0;
        this.avgDocLength = 0;
        this.queryEngine = new QueryEngine(this.invertedIndex, this.synonymEngine, this.tokenizer, this.documents);
        this.facetEngine = new FacetEngine(this._facetFields);
        // Re-initialize the scorer
        if (this.scorerFactoryBuilder) {
            this.scorer = this.scorerFactoryBuilder(
                this.totalDocs,
                this.avgDocLength,
                this.docLengths,
                this.invertedIndex
            );
        }
        // console.log('Engine state has been wiped.');
    }

    _recalculateAvgDocLength() {
        let total = 0;
        for (const len of this.docLengths.values()) {
            total += len;
        }
        this.avgDocLength = total / (this.totalDocs || 1);
    }
}
