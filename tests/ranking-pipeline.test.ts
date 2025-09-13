import { test, describe, beforeEach, afterEach, before, after } from 'vitest';
import { expect } from 'vitest';
import { RankingPipeline } from '../src/domain/RankingPipeline';
import { BM25Scorer } from '../src/domain/BM25Scorer';
import { ShardedInvertedIndex } from '../src/domain/ShardedInvertedIndex';
import { Tokenizer } from '../src/domain/Tokenizer';
import { MappingsManager } from '../src/domain/MappingsManager';
import { StopwordsManager } from '../src/infrastructure/StopwordsManager';

describe('RankingPipeline Module Tests', () => {
    let rankingPipeline;
    let scorer;
    let invertedIndex;
    let documents;
    let tokenizer;
    let mappingsManager;
    let stopwordsManager;

    beforeEach(() => {
        stopwordsManager = new StopwordsManager({ autoSave: false });
        tokenizer = new Tokenizer(stopwordsManager);
        scorer = new BM25Scorer(0, 0, new Map(), new ShardedInvertedIndex({ numShards: 1 }));
        rankingPipeline = new RankingPipeline(scorer, tokenizer);
        documents = new Map();
        invertedIndex = new ShardedInvertedIndex({ numShards: 1 });
        mappingsManager = new MappingsManager(null);
    });

    test('should initialize ranking pipeline', () => {
        invertedIndex = new ShardedInvertedIndex({ numShards: 1 });
        documents = new Map();
        scorer = new BM25Scorer(0, 0, new Map(), invertedIndex);

        rankingPipeline = new RankingPipeline(scorer, tokenizer);
        expect(rankingPipeline).toBeTruthy();
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

            rankingPipeline = new RankingPipeline(mockScorer, tokenizer);
            const results = rankingPipeline.rank(Array.from(docSet), queryTokens);

            expect(results.length).toBe(3);
            expect(results[0].id).toBe('doc2'); // highest score
            expect(results[1].id).toBe('doc1');
            expect(results[2].id).toBe('doc3'); // lowest score
        });

        test('should handle empty document set', () => {
            const docSet = new Set();
            const queryTokens = ['hello'];

            const results = rankingPipeline.rank(Array.from(docSet), queryTokens);
            expect(results.length).toBe(0);
        });

        test('should handle empty query tokens', () => {
            const docSet = new Set(['doc1', 'doc2']);
            const queryTokens = [];

            const results = rankingPipeline.rank(Array.from(docSet), queryTokens);
            expect(results.length).toBe(2);
            // All documents should have same score (0) when no query tokens
            expect(results[0].score).toBe(0);
            expect(results[1].score).toBe(0);
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

            rankingPipeline = new RankingPipeline(mockScorer, tokenizer);
            const results = rankingPipeline.rank(Array.from(docSet), queryTokens);

            expect(results.length).toBe(2);
            expect(results[0].score).toBe(0.8);
            expect(results[1].score).toBe(0.5);
        });

        test('should handle zero scores', () => {
            const docSet = new Set(['doc1', 'doc2']);
            const queryTokens = ['nonexistent'];

            const mockScorer = {
                score: (docId) => 0
            };

            rankingPipeline = new RankingPipeline(mockScorer, tokenizer);
            const results = rankingPipeline.rank(Array.from(docSet), queryTokens);

            expect(results.length).toBe(2);
            expect(results[0].score).toBe(0);
            expect(results[1].score).toBe(0);
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

            rankingPipeline = new RankingPipeline(mockScorer, tokenizer);
            const results = rankingPipeline.rank(Array.from(docSet), queryTokens);

            expect(results.length).toBe(2);
            expect(results[0].score).toBe(0.3);
            expect(results[1].score).toBe(-0.5);
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

            rankingPipeline = new RankingPipeline(mockScorer, tokenizer);
            const results = rankingPipeline.rank(Array.from(docSet), queryTokens);
            const processedResults = rankingPipeline.processResults(results, documents);

            expect(processedResults.length).toBe(2);
            expect(processedResults[0].id).toBe('doc1');
            expect(processedResults[0].name).toBe('Test Document 1');
            expect(processedResults[0].score).toBe(0.8);
            expect(processedResults[1].id).toBe('doc2');
            expect(processedResults[1].name).toBe('Test Document 2');
            expect(processedResults[1].score).toBe(0.5);
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

            rankingPipeline = new RankingPipeline(mockScorer, tokenizer);
            const results = rankingPipeline.rank(Array.from(docSet), queryTokens);

            expect(results.length).toBe(2);
            expect(results[0].id).toBe('doc1');
            expect(results[1].id).toBe('doc2');
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

            rankingPipeline = new RankingPipeline(mockScorer, tokenizer);
            const results = rankingPipeline.rank(Array.from(docSet), queryTokens);
            const processedResults = rankingPipeline.processResults(results, new Map());

            expect(processedResults.length).toBe(0);
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
            expect(tokens.length).toBe(2);
            expect(tokens).toContain('hello');
            expect(tokens).toContain('world');
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
            expect(tokens.length).toBe(2);
            expect(tokens).toContain('hello');
            expect(tokens).toContain('world');
        });

        test('should extract tokens from term query', () => {
            const query = {
                term: { field: 'name', value: 'hello' }
            };

            const tokens = rankingPipeline.extractQueryTokens(query);
            expect(tokens.length).toBe(1);
            expect(tokens[0]).toBe('hello');
        });

        test('should extract tokens from prefix query', () => {
            const query = {
                prefix: { field: 'name', value: 'hello' }
            };

            const tokens = rankingPipeline.extractQueryTokens(query);
            expect(tokens.length).toBe(1);
            expect(tokens[0]).toBe('hello');
        });

        test('should extract tokens from wildcard query', () => {
            const query = {
                wildcard: { field: 'name', value: 'hello*' }
            };

            const tokens = rankingPipeline.extractQueryTokens(query);
            expect(tokens.length).toBe(1);
            expect(tokens[0]).toBe('hello*');
        });

        test('should extract tokens from phrase query', () => {
            const query = {
                phrase: { field: 'name', value: 'hello world' }
            };

            const tokens = rankingPipeline.extractQueryTokens(query);
            expect(tokens.length).toBe(1);
            expect(tokens[0]).toBe('hello world');
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
            expect(tokens.length).toBe(3);
            expect(tokens).toContain('hello');
            expect(tokens).toContain('world');
            expect(tokens).toContain('test');
        });

        test('should handle empty query', () => {
            const tokens = rankingPipeline.extractQueryTokens({});
            expect(tokens.length).toBe(0);
        });

        test('should handle null query', () => {
            const tokens = rankingPipeline.extractQueryTokens(null);
            expect(tokens.length).toBe(0);
        });

        test('should handle unknown query type', () => {
            const query = { unknown: { field: 'name', value: 'test' } };
            const tokens = rankingPipeline.extractQueryTokens(query);
            expect(tokens.length).toBe(0);
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

            rankingPipeline = new RankingPipeline(mockScorer, tokenizer);
            const results = rankingPipeline.rank(Array.from(docSet), queryTokens);

            // Test first page (size 2)
            const page1 = rankingPipeline.paginate(results, 0, 2);
            expect(page1.length).toBe(2);
            expect(page1[0].id).toBe('doc1');
            expect(page1[1].id).toBe('doc2');

            // Test second page (size 2)
            const page2 = rankingPipeline.paginate(results, 2, 2);
            expect(page2.length).toBe(2);
            expect(page2[0].id).toBe('doc3');
            expect(page2[1].id).toBe('doc4');

            // Test third page (size 2)
            const page3 = rankingPipeline.paginate(results, 4, 2);
            expect(page3.length).toBe(1);
            expect(page3[0].id).toBe('doc5');
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

            rankingPipeline = new RankingPipeline(mockScorer, tokenizer);
            const results = rankingPipeline.rank(Array.from(docSet), queryTokens);

            const page = rankingPipeline.paginate(results, 10, 5);
            expect(page.length).toBe(0);
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

            rankingPipeline = new RankingPipeline(mockScorer, tokenizer);
            const results = rankingPipeline.rank(Array.from(docSet), queryTokens);

            const page = rankingPipeline.paginate(results, 0, 0);
            expect(page.length).toBe(0);
        });
    });

    describe('Edge Cases', () => {
        test('should handle null scorer', () => {
            rankingPipeline = new RankingPipeline(null, tokenizer);
            const docSet = new Set(['doc1']);
            const queryTokens = ['test'];

            const results = rankingPipeline.rank(Array.from(docSet), queryTokens);
            expect(results.length).toBe(1);
            expect(results[0].score).toBe(0);
        });

        test('should handle scorer that throws error', () => {
            const mockScorer = {
                score: () => {
                    throw new Error('Scorer error');
                }
            };

            rankingPipeline = new RankingPipeline(mockScorer, tokenizer);
            const docSet = new Set(['doc1']);
            const queryTokens = ['test'];

            const results = rankingPipeline.rank(Array.from(docSet), queryTokens);
            expect(results.length).toBe(1);
            expect(results[0].score).toBe(0);
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

            rankingPipeline = new RankingPipeline(mockScorer, tokenizer);
            const start = Date.now();

            const results = rankingPipeline.rank(Array.from(docSet), queryTokens);
            const end = Date.now();

            expect(end - start < 100).toBeTruthy(); // should complete in under 100ms
            expect(results.length).toBe(1000);
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

            rankingPipeline = new RankingPipeline(mockScorer, tokenizer);
            const start = Date.now();

            const results = rankingPipeline.rank(Array.from(docSet), queryTokens);
            const end = Date.now();

            expect(end - start < 500).toBeTruthy(); // should complete in under 500ms
            expect(results.length).toBe(10000);
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

            rankingPipeline = new RankingPipeline(mockScorer, tokenizer);
            const start = Date.now();

            const results = rankingPipeline.rank(Array.from(docSet), queryTokens);
            const end = Date.now();

            expect(end - start < 100).toBeTruthy(); // should complete in under 100ms
            expect(results.length).toBe(3);
        });
    });
}); 