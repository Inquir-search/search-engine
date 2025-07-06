import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import RankingPipeline from '../src/domain/RankingPipeline.js';
import BM25Scorer from '../src/domain/BM25Scorer.js';
import InvertedIndex from '../src/domain/InvertedIndex.js';
import Tokenizer from '../src/domain/Tokenizer.js';
import MappingsManager from '../src/domain/MappingsManager.js';
import StopwordsManager from '../src/infrastructure/StopwordsManager.js';

describe('RankingPipeline Module Tests', () => {
    let rankingPipeline;
    let scorer;
    let invertedIndex;
    let documents;
    let tokenizer;
    let mappingsManager;
    let stopwordsManager;

    beforeEach(() => {
        rankingPipeline = new RankingPipeline();
        documents = new Map();
        invertedIndex = new InvertedIndex();
        stopwordsManager = new StopwordsManager();
        tokenizer = new Tokenizer(stopwordsManager);
        mappingsManager = new MappingsManager(null);
    });

    test('should initialize ranking pipeline', () => {
        invertedIndex = new InvertedIndex();
        documents = new Map();
        scorer = new BM25Scorer(0, 0, new Map(), invertedIndex);

        rankingPipeline = new RankingPipeline(scorer);
        assert.ok(rankingPipeline);
    });

    describe('Basic Ranking', () => {
        test('should rank documents by score', () => {
            const docSet = new Set(['doc1', 'doc2', 'doc3']);
            const queryTokens = ['hello', 'world'];

            // Mock scorer to return different scores
            const mockScorer = {
                score: (docId) => {
                    const scores = { doc1: 0.8, doc2: 0.9, doc3: 0.7 };
                    return scores[docId] || 0;
                }
            };

            rankingPipeline = new RankingPipeline(mockScorer);
            const results = rankingPipeline.rank(Array.from(docSet), queryTokens);

            assert.strictEqual(results.length, 3);
            assert.strictEqual(results[0].id, 'doc2'); // highest score
            assert.strictEqual(results[1].id, 'doc1');
            assert.strictEqual(results[2].id, 'doc3'); // lowest score
        });

        test('should handle empty document set', () => {
            const docSet = new Set();
            const queryTokens = ['hello'];

            const results = rankingPipeline.rank(Array.from(docSet), queryTokens);
            assert.strictEqual(results.length, 0);
        });

        test('should handle empty query tokens', () => {
            const docSet = new Set(['doc1', 'doc2']);
            const queryTokens = [];

            const results = rankingPipeline.rank(Array.from(docSet), queryTokens);
            assert.strictEqual(results.length, 2);
            // All documents should have same score (0) when no query tokens
            assert.strictEqual(results[0].score, 0);
            assert.strictEqual(results[1].score, 0);
        });
    });

    describe('Score Calculation', () => {
        test('should calculate scores for all documents', () => {
            const docSet = new Set(['doc1', 'doc2']);
            const queryTokens = ['test'];

            const mockScorer = {
                score: (docId) => {
                    const scores = { doc1: 0.5, doc2: 0.8 };
                    return scores[docId] || 0;
                }
            };

            rankingPipeline = new RankingPipeline(mockScorer);
            const results = rankingPipeline.rank(Array.from(docSet), queryTokens);

            assert.strictEqual(results.length, 2);
            assert.strictEqual(results[0].score, 0.8);
            assert.strictEqual(results[1].score, 0.5);
        });

        test('should handle zero scores', () => {
            const docSet = new Set(['doc1', 'doc2']);
            const queryTokens = ['nonexistent'];

            const mockScorer = {
                score: (docId) => 0
            };

            rankingPipeline = new RankingPipeline(mockScorer);
            const results = rankingPipeline.rank(Array.from(docSet), queryTokens);

            assert.strictEqual(results.length, 2);
            assert.strictEqual(results[0].score, 0);
            assert.strictEqual(results[1].score, 0);
        });

        test('should handle negative scores', () => {
            const docSet = new Set(['doc1', 'doc2']);
            const queryTokens = ['test'];

            const mockScorer = {
                score: (docId) => {
                    const scores = { doc1: -0.5, doc2: 0.3 };
                    return scores[docId] || 0;
                }
            };

            rankingPipeline = new RankingPipeline(mockScorer);
            const results = rankingPipeline.rank(Array.from(docSet), queryTokens);

            assert.strictEqual(results.length, 2);
            assert.strictEqual(results[0].score, 0.3);
            assert.strictEqual(results[1].score, -0.5);
        });
    });

    describe('Result Processing', () => {
        test('should process and enrich ranked results', () => {
            const docSet = new Set(['doc1', 'doc2']);
            const queryTokens = ['test'];

            // Setup documents
            documents.set('doc1', { id: 'doc1', name: 'Test Document 1' });
            documents.set('doc2', { id: 'doc2', name: 'Test Document 2' });

            const mockScorer = {
                score: (docId) => {
                    const scores = { doc1: 0.8, doc2: 0.5 };
                    return scores[docId] || 0;
                }
            };

            rankingPipeline = new RankingPipeline(mockScorer);
            const results = rankingPipeline.rank(Array.from(docSet), queryTokens);
            const processedResults = rankingPipeline.processResults(results, documents);

            assert.strictEqual(processedResults.length, 2);
            assert.strictEqual(processedResults[0].id, 'doc1');
            assert.strictEqual(processedResults[0].name, 'Test Document 1');
            assert.strictEqual(processedResults[0].score, 0.8);
            assert.strictEqual(processedResults[1].id, 'doc2');
            assert.strictEqual(processedResults[1].name, 'Test Document 2');
            assert.strictEqual(processedResults[1].score, 0.5);
        });

        test('should handle missing documents', () => {
            const docSet = new Set(['doc1', 'doc2']);
            const queryTokens = ['test'];

            const mockScorer = {
                score: (docId) => {
                    const scores = { doc1: 0.8, doc2: 0.5 };
                    return scores[docId] || 0;
                }
            };

            rankingPipeline = new RankingPipeline(mockScorer);
            const results = rankingPipeline.rank(Array.from(docSet), queryTokens);

            assert.strictEqual(results.length, 2);
            assert.strictEqual(results[0].id, 'doc1');
            assert.strictEqual(results[1].id, 'doc2');
        });

        test('should handle empty documents map', () => {
            const docSet = new Set(['doc1', 'doc2']);
            const queryTokens = ['test'];

            const mockScorer = {
                score: (docId) => {
                    const scores = { doc1: 0.8, doc2: 0.5 };
                    return scores[docId] || 0;
                }
            };

            rankingPipeline = new RankingPipeline(mockScorer);
            const results = rankingPipeline.rank(Array.from(docSet), queryTokens);
            const processedResults = rankingPipeline.processResults(results, new Map());

            assert.strictEqual(processedResults.length, 0);
        });
    });

    describe('Query Token Processing', () => {
        test('should extract tokens from bool query with must clauses', () => {
            const query = {
                bool: {
                    must: [
                        { term: { field: 'name', value: 'hello' } },
                        { term: { field: 'description', value: 'world' } }
                    ]
                }
            };

            const tokens = rankingPipeline.extractQueryTokens(query);
            assert.strictEqual(tokens.length, 2);
            assert.ok(tokens.includes('hello'));
            assert.ok(tokens.includes('world'));
        });

        test('should extract tokens from bool query with should clauses', () => {
            const query = {
                bool: {
                    should: [
                        { term: { field: 'name', value: 'hello' } },
                        { term: { field: 'description', value: 'world' } }
                    ]
                }
            };

            const tokens = rankingPipeline.extractQueryTokens(query);
            assert.strictEqual(tokens.length, 2);
            assert.ok(tokens.includes('hello'));
            assert.ok(tokens.includes('world'));
        });

        test('should extract tokens from term query', () => {
            const query = {
                term: { field: 'name', value: 'hello' }
            };

            const tokens = rankingPipeline.extractQueryTokens(query);
            assert.strictEqual(tokens.length, 1);
            assert.strictEqual(tokens[0], 'hello');
        });

        test('should extract tokens from prefix query', () => {
            const query = {
                prefix: { field: 'name', value: 'hello' }
            };

            const tokens = rankingPipeline.extractQueryTokens(query);
            assert.strictEqual(tokens.length, 1);
            assert.strictEqual(tokens[0], 'hello');
        });

        test('should extract tokens from wildcard query', () => {
            const query = {
                wildcard: { field: 'name', value: 'hello*' }
            };

            const tokens = rankingPipeline.extractQueryTokens(query);
            assert.strictEqual(tokens.length, 1);
            assert.strictEqual(tokens[0], 'hello*');
        });

        test('should extract tokens from phrase query', () => {
            const query = {
                phrase: { field: 'name', value: 'hello world' }
            };

            const tokens = rankingPipeline.extractQueryTokens(query);
            assert.strictEqual(tokens.length, 1);
            assert.strictEqual(tokens[0], 'hello world');
        });

        test('should handle nested bool queries', () => {
            const query = {
                bool: {
                    must: [
                        { term: { field: 'name', value: 'hello' } },
                        {
                            bool: {
                                should: [
                                    { term: { field: 'description', value: 'world' } },
                                    { term: { field: 'tags', value: 'test' } }
                                ]
                            }
                        }
                    ]
                }
            };

            const tokens = rankingPipeline.extractQueryTokens(query);
            assert.strictEqual(tokens.length, 3);
            assert.ok(tokens.includes('hello'));
            assert.ok(tokens.includes('world'));
            assert.ok(tokens.includes('test'));
        });

        test('should handle empty query', () => {
            const tokens = rankingPipeline.extractQueryTokens({});
            assert.strictEqual(tokens.length, 0);
        });

        test('should handle null query', () => {
            const tokens = rankingPipeline.extractQueryTokens(null);
            assert.strictEqual(tokens.length, 0);
        });

        test('should handle unknown query type', () => {
            const query = { unknown: { field: 'name', value: 'test' } };
            const tokens = rankingPipeline.extractQueryTokens(query);
            assert.strictEqual(tokens.length, 0);
        });
    });

    describe('Pagination', () => {
        test('should apply pagination to results', () => {
            const docSet = new Set(['doc1', 'doc2', 'doc3', 'doc4', 'doc5']);
            const queryTokens = ['test'];

            const mockScorer = {
                score: (docId) => {
                    const scores = { doc1: 0.9, doc2: 0.8, doc3: 0.7, doc4: 0.6, doc5: 0.5 };
                    return scores[docId] || 0;
                }
            };

            rankingPipeline = new RankingPipeline(mockScorer);
            const results = rankingPipeline.rank(Array.from(docSet), queryTokens);

            // Test first page (size 2)
            const page1 = rankingPipeline.paginate(results, 0, 2);
            assert.strictEqual(page1.length, 2);
            assert.strictEqual(page1[0].id, 'doc1');
            assert.strictEqual(page1[1].id, 'doc2');

            // Test second page (size 2)
            const page2 = rankingPipeline.paginate(results, 2, 2);
            assert.strictEqual(page2.length, 2);
            assert.strictEqual(page2[0].id, 'doc3');
            assert.strictEqual(page2[1].id, 'doc4');

            // Test third page (size 2)
            const page3 = rankingPipeline.paginate(results, 4, 2);
            assert.strictEqual(page3.length, 1);
            assert.strictEqual(page3[0].id, 'doc5');
        });

        test('should handle pagination beyond results', () => {
            const docSet = new Set(['doc1', 'doc2']);
            const queryTokens = ['test'];

            const mockScorer = {
                score: (docId) => {
                    const scores = { doc1: 0.8, doc2: 0.5 };
                    return scores[docId] || 0;
                }
            };

            rankingPipeline = new RankingPipeline(mockScorer);
            const results = rankingPipeline.rank(Array.from(docSet), queryTokens);

            const page = rankingPipeline.paginate(results, 10, 5);
            assert.strictEqual(page.length, 0);
        });

        test('should handle zero size pagination', () => {
            const docSet = new Set(['doc1', 'doc2']);
            const queryTokens = ['test'];

            const mockScorer = {
                score: (docId) => {
                    const scores = { doc1: 0.8, doc2: 0.5 };
                    return scores[docId] || 0;
                }
            };

            rankingPipeline = new RankingPipeline(mockScorer);
            const results = rankingPipeline.rank(Array.from(docSet), queryTokens);

            const page = rankingPipeline.paginate(results, 0, 0);
            assert.strictEqual(page.length, 0);
        });
    });

    describe('Edge Cases', () => {
        test('should handle null scorer', () => {
            rankingPipeline = new RankingPipeline(null);
            const docSet = new Set(['doc1']);
            const queryTokens = ['test'];

            const results = rankingPipeline.rank(Array.from(docSet), queryTokens);
            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].score, 0);
        });

        test('should handle scorer that throws error', () => {
            const mockScorer = {
                score: () => {
                    throw new Error('Scorer error');
                }
            };

            rankingPipeline = new RankingPipeline(mockScorer);
            const docSet = new Set(['doc1']);
            const queryTokens = ['test'];

            const results = rankingPipeline.rank(Array.from(docSet), queryTokens);
            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].score, 0);
        });

        test('should handle large document sets', () => {
            const docSet = new Set();
            for (let i = 0; i < 1000; i++) {
                docSet.add(`doc${i}`);
            }

            const queryTokens = ['test'];

            const mockScorer = {
                score: (docId) => Math.random()
            };

            rankingPipeline = new RankingPipeline(mockScorer);
            const start = Date.now();

            const results = rankingPipeline.rank(Array.from(docSet), queryTokens);
            const end = Date.now();

            assert.ok(end - start < 100); // should complete in under 100ms
            assert.strictEqual(results.length, 1000);
        });
    });

    describe('Performance Tests', () => {
        test('should handle many documents efficiently', () => {
            const docSet = new Set();
            for (let i = 0; i < 10000; i++) {
                docSet.add(`doc${i}`);
            }

            const queryTokens = ['test'];

            const mockScorer = {
                score: (docId) => Math.random()
            };

            rankingPipeline = new RankingPipeline(mockScorer);
            const start = Date.now();

            const results = rankingPipeline.rank(Array.from(docSet), queryTokens);
            const end = Date.now();

            assert.ok(end - start < 500); // should complete in under 500ms
            assert.strictEqual(results.length, 10000);
        });

        test('should handle many query tokens efficiently', () => {
            const docSet = new Set(['doc1', 'doc2', 'doc3']);
            const queryTokens = [];
            for (let i = 0; i < 100; i++) {
                queryTokens.push(`token${i}`);
            }

            const mockScorer = {
                score: (docId) => Math.random()
            };

            rankingPipeline = new RankingPipeline(mockScorer);
            const start = Date.now();

            const results = rankingPipeline.rank(Array.from(docSet), queryTokens);
            const end = Date.now();

            assert.ok(end - start < 100); // should complete in under 100ms
            assert.strictEqual(results.length, 3);
        });
    });
}); 