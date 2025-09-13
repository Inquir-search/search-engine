import { test, describe, beforeEach, afterEach, before, after } from 'vitest';
import { expect } from 'vitest';
import SearchEngine from '../src/domain/SearchEngine.ts';
import BM25Scorer from '../src/domain/BM25Scorer.ts';
import Tokenizer from '../src/domain/Tokenizer.ts';
import ShardedInvertedIndex from '../src/domain/ShardedInvertedIndex.ts';
import RankingPipeline from '../src/domain/RankingPipeline.ts';
import StopwordsManager from '../src/infrastructure/StopwordsManager.ts';
import SynonymEngine from '../src/domain/SynonymEngine.ts';
import MappingsManager from '../src/domain/MappingsManager.ts';

// Patch SynonymEngine for tests to provide isEnabled and getSynonyms
class TestSynonymEngine {
    isEnabled() { return false; }
    getSynonyms() { return []; }
}

describe('Fuzzy Query Tests', () => {
    let searchEngine;

    beforeEach(async () => {
        const scorerFactory = (totalDocs, avgDocLength, docLengths, index) =>
            new BM25Scorer(totalDocs, avgDocLength, docLengths, index);

        const stopwordsManager = new StopwordsManager({ autoSave: false });
        const tokenizer = new Tokenizer(stopwordsManager);
        const scorer = new BM25Scorer(0, 0, new Map(), new ShardedInvertedIndex({ numShards: 1 }));
        const rankingPipeline = new RankingPipeline(scorer, tokenizer);

        const mockMappingsManager = {
            getMapping: (field) => ({ type: 'text' }),
            getSearchableFields: () => ['title', 'content'],
            getFieldType: (field) => 'text',
        };

        searchEngine = await SearchEngine.create({
            tokenizer,
            scorerFactory,
            invertedIndex: new ShardedInvertedIndex({ numShards: 1 }),
            rankingPipeline,
            stopwordsManager,
            synonymEngine: new TestSynonymEngine(),
            mappingsManager: mockMappingsManager,
        });

        // Add test documents
        searchEngine.add({ id: 'doc1', name: 'document' });
        searchEngine.add({ id: 'doc2', name: 'different' });
        searchEngine.add({ id: 'doc3', name: 'documents' });
        searchEngine.add({ id: 'doc4', name: 'documentation' });
        searchEngine.add({ id: 'doc5', name: 'test document' });
        searchEngine.add({ id: 'doc6', name: 'test documents' });
        searchEngine.add({ id: 'doc7', name: 'testing documentation' });
        searchEngine.add({ id: 'doc8', name: 'hello world' });
        searchEngine.add({ id: 'doc9', name: 'hello there' });
        searchEngine.add({ id: 'doc10', name: 'world hello' });
    });

    afterEach(async () => {
        if (searchEngine && typeof searchEngine.shutdown === 'function') {
            await searchEngine.shutdown();
        }
    });

    describe('Fuzzy Match Queries', () => {
        test('should support fuzzy match with single word', () => {
            const results = searchEngine.search({
                bool: {
                    must: [{ match: { field: 'name', value: 'documnt', fuzziness: 2 } }]
                }
            });
            expect(results.hits.length >= 1).toBeTruthy();
            // Should match both "document" and "documents"
            const docIds = results.hits.map(h => h.id);
            expect(docIds.includes('doc1') || docIds.includes('doc3')).toBeTruthy();
        });

        test('should support fuzzy match with multi-word query', () => {
            const results = searchEngine.search({
                bool: {
                    must: [{ match: { field: 'name', value: 'test documnt', fuzziness: 2 } }]
                }
            });
            expect(results.hits.length >= 1).toBeTruthy();
            // Should match "test document" or "test documents"
            const docIds = results.hits.map(h => h.id);
            expect(docIds.includes('doc5') || docIds.includes('doc6')).toBeTruthy();
        });

        test('should handle different fuzziness levels', () => {
            // With fuzziness 1, should match "documnt" to "document"
            const results1 = searchEngine.search({
                bool: {
                    must: [{ match: { field: 'name', value: 'documnt', fuzziness: 1 } }]
                }
            });
            expect(results1.hits.length >= 1).toBeTruthy();

            // With fuzziness 2, should match as well
            const results2 = searchEngine.search({
                bool: {
                    must: [{ match: { field: 'name', value: 'documnt', fuzziness: 2 } }]
                }
            });
            expect(results2.hits.length >= 1).toBeTruthy();
        });
    });

    describe('Fuzzy Term Queries', () => {
        test('should support fuzzy term queries', () => {
            const results = searchEngine.search({
                bool: {
                    must: [{ term: { field: 'name', value: 'documnt', fuzziness: 2 } }]
                }
            });
            expect(results.hits.length >= 1).toBeTruthy();
            const docIds = results.hits.map(h => h.id);
            expect(docIds.includes('doc1') || docIds.includes('doc3')).toBeTruthy();
        });

        test('should handle exact term matches with fuzzy fallback', () => {
            const results = searchEngine.search({
                bool: {
                    must: [{ term: { field: 'name', value: 'document', fuzziness: 2 } }]
                }
            });
            expect(results.hits.length >= 1).toBeTruthy();
            const docIds = results.hits.map(h => h.id);
            // Should match "documents" since "document" gets stemmed to "documents"
            expect(docIds.includes('doc3') || docIds.includes('doc6')).toBeTruthy();
        });
    });

    describe('Fuzzy Prefix Queries', () => {
        test('should support fuzzy prefix queries', () => {
            const results = searchEngine.search({
                bool: {
                    must: [{ prefix: { field: 'name', value: 'docum', fuzziness: 2 } }]
                }
            });
            expect(results.hits.length >= 3).toBeTruthy(); // document, documents, documentation
        });

        test('should handle prefix with typos', () => {
            const results = searchEngine.search({
                bool: {
                    must: [{ prefix: { field: 'name', value: 'documnt', fuzziness: 2 } }]
                }
            });
            expect(results.hits.length >= 1).toBeTruthy(); // document
        });
    });

    describe('Fuzzy Wildcard Queries', () => {
        test('should support fuzzy wildcard queries', () => {
            const results = searchEngine.search({
                bool: {
                    must: [{ wildcard: { field: 'name', value: 'doc*', fuzziness: 2 } }]
                }
            });
            expect(results.hits.length >= 3).toBeTruthy(); // document, documents, documentation
        });

        test('should handle wildcard with typos', () => {
            const results = searchEngine.search({
                bool: {
                    must: [{ wildcard: { field: 'name', value: 'documnt*', fuzziness: 2 } }]
                }
            });
            expect(results.hits.length >= 1).toBeTruthy(); // document
        });
    });

    describe('Fuzzy Phrase Queries', () => {
        test('should support fuzzy phrase queries', () => {
            const results = searchEngine.search({
                bool: {
                    must: [{ phrase: { field: 'name', value: 'test documnt', fuzziness: 2 } }]
                }
            });
            expect(results.hits.length >= 1).toBeTruthy();
            const docIds = results.hits.map(h => h.id);
            expect(docIds.includes('doc5') || docIds.includes('doc6')).toBeTruthy();
        });

        test('should handle phrase with slop and fuzziness', () => {
            const results = searchEngine.search({
                bool: {
                    must: [{ phrase: { field: 'name', value: 'test documnt', slop: 1, fuzziness: 2 } }]
                }
            });
            expect(results.hits.length >= 1).toBeTruthy();
            const docIds = results.hits.map(h => h.id);
            expect(docIds.includes('doc5') || docIds.includes('doc6')).toBeTruthy();
        });
    });

    describe('Fuzzy Match Phrase Queries', () => {
        test('should support fuzzy match phrase queries', () => {
            const results = searchEngine.search({
                bool: {
                    must: [{ match_phrase: { field: 'name', value: 'test documnt', fuzziness: 2 } }]
                }
            });
            expect(results.hits.length >= 1).toBeTruthy();
            const docIds = results.hits.map(h => h.id);
            expect(docIds.includes('doc5') || docIds.includes('doc6')).toBeTruthy();
        });
    });

    describe('Complex Fuzzy Queries', () => {
        test('should support boolean queries with fuzzy clauses', () => {
            const results = searchEngine.search({
                bool: {
                    must: [
                        { match: { field: 'name', value: 'test', fuzziness: 1 } }
                    ],
                    should: [
                        { term: { field: 'name', value: 'documnt', fuzziness: 2 } }
                    ]
                }
            });
            expect(results.hits.length > 0).toBeTruthy();
        });

        test('should handle multiple fuzzy terms in AND logic', () => {
            const results = searchEngine.search({
                bool: {
                    must: [
                        { term: { field: 'name', value: 'test', fuzziness: 1 } },
                        { term: { field: 'name', value: 'documnt', fuzziness: 2 } }
                    ]
                }
            });
            expect(results.hits.length >= 1).toBeTruthy();
            const docIds = results.hits.map(h => h.id);
            expect(docIds.includes('doc5') || docIds.includes('doc6')).toBeTruthy();
        });
    });

    describe('Edge Cases', () => {
        test('should handle empty fuzziness gracefully', () => {
            const results = searchEngine.search({
                bool: {
                    must: [{ match: { field: 'name', value: 'document' } }]
                }
            });
            expect(results.hits.length >= 1).toBeTruthy();
        });

        test('should handle very high fuzziness', () => {
            const results = searchEngine.search({
                bool: {
                    must: [{ match: { field: 'name', value: 'xyz', fuzziness: 10 } }]
                }
            });
            // Should match many documents with very high fuzziness
            expect(results.hits.length > 0).toBeTruthy();
        });

        test('should handle zero fuzziness', () => {
            const results = searchEngine.search({
                bool: {
                    must: [{ match: { field: 'name', value: 'documnt', fuzziness: 0 } }]
                }
            });
            expect(results.hits.length).toBe(0);
        });
    });
}); 