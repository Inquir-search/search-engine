import PersonalizationEngine from "./PersonalizationEngine.js";

export default class RankingPipeline {
    constructor(scorer = null) {
        this.personalization = new PersonalizationEngine();
        this.scorer = scorer;
    }

    rank(docSet, queryTokens) {
        if (!docSet || docSet.length === 0) return [];
        if (!queryTokens || queryTokens.length === 0) {
            return docSet.map(docId => ({ id: docId, score: 0 }));
        }

        const scoredDocs = docSet.map(docId => {
            let score = 0;

            if (this.scorer && typeof this.scorer.score === 'function') {
                try {
                    score = this.scorer.score(docId);
                } catch (error) {
                    console.warn(`Scorer error for doc ${docId}:`, error);
                    score = 0;
                }
            }

            return { id: docId, score };
        });

        return scoredDocs.sort((a, b) => b.score - a.score);
    }

    processResults(results, documents) {
        if (!results || !documents) return [];
        const out = [];
        for (const result of results) {
            const doc = documents.get(result.id);
            if (doc) {
                out.push({ ...doc, score: result.score });
            }
        }
        return out;
    }

    extractQueryTokens(query) {
        const tokens = [];
        const stack = [query];

        while (stack.length > 0) {
            const currentQuery = stack.pop();

            if (!currentQuery) continue;

            if (currentQuery.bool) {
                const must = currentQuery.bool.must || [];
                const should = currentQuery.bool.should || [];
                const mustNot = currentQuery.bool.must_not || [];

                [...must, ...should, ...mustNot].forEach(clause => stack.push(clause));
            } else if (currentQuery.term && currentQuery.term.value) {
                tokens.push(currentQuery.term.value);
            } else if (currentQuery.match && currentQuery.match.value) {
                tokens.push(currentQuery.match.value);
            } else if (currentQuery.prefix && currentQuery.prefix.value) {
                tokens.push(currentQuery.prefix.value);
            } else if (currentQuery.wildcard && currentQuery.wildcard.value) {
                tokens.push(currentQuery.wildcard.value);
            } else if (currentQuery.fuzzy && currentQuery.fuzzy.value) {
                tokens.push(currentQuery.fuzzy.value);
            } else if (currentQuery.match_phrase && currentQuery.match_phrase.value) {
                tokens.push(currentQuery.match_phrase.value);
            } else if (currentQuery.phrase && currentQuery.phrase.value) {
                tokens.push(currentQuery.phrase.value);
            }
        }

        return tokens;
    }

    paginate(results, from, size) {
        if (!results) return [];
        return results.slice(from, from + size);
    }

    // Legacy method for backward compatibility
    rankWithDocuments(docs, query, scorer, personalizationEngine, context, invertedIndex, tokenizer, mappingsManager) {
        if (!docs) return [];

        const queryTermsByField = this._getQueryTerms(query, tokenizer, mappingsManager);
        // console.log('RankingPipeline - queryTermsByField:', queryTermsByField);

        const scoredDocs = docs.map(doc => {
            if (!doc) return null;

            let totalScore = 0;
            const docId = doc.id;
            // console.log('RankingPipeline - processing doc:', docId);

            for (const field in queryTermsByField) {
                const terms = queryTermsByField[field];
                for (const term of terms) {
                    const token = `${field}:${term}`;
                    const posting = invertedIndex.getPosting(token);
                    // console.log('RankingPipeline - token:', token, 'posting has docId:', posting.has(docId));
                    if (posting.has(docId)) {
                        const docInfo = posting.get(docId);
                        const tf = docInfo && docInfo.positions ? docInfo.positions.length : 0;
                        const score = scorer.score(token, docId, tf);
                        // console.log('RankingPipeline - score for', token, 'docId:', docId, 'tf:', tf, 'score:', score);
                        totalScore += score;
                    }
                }
            }

            // console.log('RankingPipeline - totalScore for docId:', docId, '=', totalScore);
            return { ...doc, _score: totalScore };
        }).filter(Boolean);

        const sortedDocs = scoredDocs.sort((a, b) => b._score - a._score);
        return sortedDocs;
    }

    _getQueryTerms(query, tokenizer, mappingsManager) {
        const terms = {};
        if (query.bool) {
            const must = query.bool.must || [];
            const should = query.bool.should || [];

            // Helper to get analyzer for a field
            const getAnalyzer = (field, mappingsManager) => {
                // Try to get field type from mappingsManager if available
                if (mappingsManager && mappingsManager.getFieldType) {
                    const type = mappingsManager.getFieldType(field);
                    if (type === 'keyword') return 'keyword';
                    if (type === 'text') return 'standard';
                }
                // fallback: keyword if field name is 'name', else standard
                if (field && field.toLowerCase().includes('name')) return 'keyword';
                return 'standard';
            };

            const processClause = clause => {
                if (clause.match) {
                    const field = clause.match.field;
                    const queryText = clause.match.value;
                    if (!terms[field]) {
                        terms[field] = [];
                    }
                    const analyzer = getAnalyzer(field, mappingsManager);
                    const tokens = tokenizer.tokenize(queryText, analyzer);
                    terms[field].push(...tokens);
                } else if (clause.term) {
                    const field = clause.term.field;
                    const value = clause.term.value;
                    if (!terms[field]) {
                        terms[field] = [];
                    }
                    const analyzer = getAnalyzer(field, mappingsManager);
                    const tokens = tokenizer.tokenize(value, analyzer);
                    terms[field].push(...tokens);
                }
            };

            for (const clause of must) {
                processClause(clause);
            }

            for (const clause of should) {
                processClause(clause);
            }
        } else if (typeof query === 'string') {
            // Fallback for simple string queries: assume all fields
            // (This branch is for robustness, but your SearchEngine always wraps as bool)
            const tokens = tokenizer.tokenize(query, 'standard');
            // console.log('Tokenizer tokens for simple query:', tokens);
            terms['name'] = tokens; // fallback to 'name' field for test
        }
        return terms;
    }
}
