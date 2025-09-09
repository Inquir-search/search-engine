import { test, describe, beforeEach, afterEach, before, after } from 'vitest';
import { expect } from 'vitest';
import QueryEngine from '../src/domain/QueryEngine.ts';
import ShardedInvertedIndex from '../src/domain/ShardedInvertedIndex.ts';
import SynonymEngine from '../src/domain/SynonymEngine.ts';
import Tokenizer from '../src/domain/Tokenizer.ts';
import BM25Scorer from '../src/domain/BM25Scorer.ts';
import RankingPipeline from '../src/domain/RankingPipeline.ts';
import MappingsManager from '../src/domain/MappingsManager.ts';

// Mock classes to avoid file system dependencies
class MockMappingsManager {
    constructor() {
        this.mappings = new Map([
            ['name', { type: 'text' }],
            ['title', { type: 'text' }],
            ['content', { type: 'text' }],
            ['email', { type: 'email' }],
            ['url', { type: 'url' }],
            ['phone', { type: 'phone' }],
            ['age', { type: 'float' }],
            ['location', { type: 'geo_point' }]
        ]);
    }

    getFieldType(field) {
        const mapping = this.mappings.get(field);
        return mapping ? mapping.type : 'text';
    }

    getTextFields() {
        return Array.from(this.mappings.entries())
            .filter(([, mapping]) => ['text', 'keyword', 'email', 'url', 'phone'].includes(mapping.type))
            .map(([field]) => field);
    }

    autoExtend(doc) {
        // Mock implementation - just add fields as text if they don't exist
        for (const [k, v] of Object.entries(doc)) {
            if (k === 'id') continue;
            if (!this.mappings.has(k)) {
                let type = 'text';
                if (typeof v === 'number') type = 'float';
                if (typeof v === 'boolean') type = 'boolean';
                if (Array.isArray(v) && v.length === 2 && v.every(n => typeof n === 'number'))
                    type = 'geo_point';
                this.mappings.set(k, { type });
            }
        }
    }

    validate(doc) {
        // Mock validation - always pass
        return true;
    }

    getMapping(fieldName) {
        if (fieldName == null) return { type: 'text' };
        if (this.mappings.has(fieldName)) return this.mappings.get(fieldName);
        return { type: 'text' };
    }
}

class MockStopwordsManager {
    constructor() {
        this.stopwords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);
    }

    getAll() {
        return Array.from(this.stopwords);
    }

    isStopword(word) {
        return this.stopwords.has(word.toLowerCase());
    }
}

// Patch SynonymEngine for tests to provide isEnabled and getSynonyms
class TestSynonymEngine {
    isEnabled() { return false; }
    getSynonyms() { return []; }
}

let queryEngine;
let invertedIndex;
let synonymEngine;
let tokenizer;
let mappingsManager;
let stopwordsManager;
let documents;
let scorer;
let rankingPipeline;

describe('QueryEngine Module Tests', () => {
    beforeEach(() => {
        invertedIndex = new ShardedInvertedIndex({ numShards: 1 });
        synonymEngine = new TestSynonymEngine();
        stopwordsManager = new MockStopwordsManager();
        tokenizer = new Tokenizer(stopwordsManager);
        scorer = new BM25Scorer(0, 0, new Map(), invertedIndex);
        mappingsManager = new MappingsManager(null);
        rankingPipeline = new RankingPipeline(scorer, tokenizer);
        documents = new Map();
        queryEngine = new QueryEngine(invertedIndex, synonymEngine, tokenizer, documents, mappingsManager, rankingPipeline);
    });

    afterEach(() => {
        invertedIndex.clear();
        documents.clear();
    });

    test('should initialize query engine', () => {
        expect(queryEngine).toBeTruthy();
    });

    describe('Term Queries', () => {
        test('should find documents with exact term match', () => {
            // Setup index
            invertedIndex.addToken('name:hello', 'doc1', 0);
            invertedIndex.addToken('name:world', 'doc1', 1);
            invertedIndex.addToken('name:hello', 'doc2', 0);

            const results = queryEngine._termToDocs('name', 'hello');
            expect(results.size).toBe(2);
            expect(results.has('doc1')).toBeTruthy();
            expect(results.has('doc2')).toBeTruthy();
        });

        test('should return empty set for non-existent term', () => {
            const results = queryEngine._termToDocs('name', 'nonexistent');
            expect(results.size).toBe(0);
        });

        test('should handle case-insensitive matching', () => {
            invertedIndex.addToken('name:hello', 'doc1', 0);

            const results = queryEngine._termToDocs('name', 'HELLO');
            expect(results.size).toBe(1);
            expect(results.has('doc1')).toBeTruthy();
        });
    });

    describe('Prefix Queries', () => {
        test('should find documents with prefix match', () => {
            invertedIndex.addToken('name:apple', 'doc1', 0);
            invertedIndex.addToken('name:application', 'doc2', 0);
            invertedIndex.addToken('name:banana', 'doc3', 0);

            const results = queryEngine._prefixToDocs('name', 'app');
            expect(results.size).toBe(2);
            expect(results.has('doc1')).toBeTruthy();
            expect(results.has('doc2')).toBeTruthy();
        });

        test('should handle multi-word prefix queries', () => {
            invertedIndex.addToken('name:hello', 'doc1', 0);
            invertedIndex.addToken('name:world', 'doc1', 1);
            invertedIndex.addToken('name:hello', 'doc2', 0);
            invertedIndex.addToken('name:there', 'doc2', 1);

            // Add documents to the documents map for multi-word prefix matching
            documents.set('doc1', { name: 'hello world' });
            documents.set('doc2', { name: 'hello there' });

            // Prefix queries work on individual terms, so 'hel' should match both documents
            const results = queryEngine._prefixToDocs('name', 'hel');
            expect(results.size).toBe(2);
            expect(results.has('doc1')).toBeTruthy();
            expect(results.has('doc2')).toBeTruthy();
        });

        test('should return empty set for non-matching prefix', () => {
            invertedIndex.addToken('name:apple', 'doc1', 0);

            const results = queryEngine._prefixToDocs('name', 'xyz');
            expect(results.size).toBe(0);
        });
    });

    describe('Wildcard Queries', () => {
        test('should find documents with wildcard pattern', () => {
            // Add documents to the documents map for wildcard matching
            documents.set('doc1', { name: 'apple' });
            documents.set('doc2', { name: 'application' });
            documents.set('doc3', { name: 'banana' });

            const results = queryEngine._wildcardToDocs('name', 'app*');
            expect(results.size).toBe(2);
            expect(results.has('doc1')).toBeTruthy();
            expect(results.has('doc2')).toBeTruthy();
        });

        test('should handle suffix wildcard', () => {
            // Add documents to the documents map for wildcard matching
            documents.set('doc1', { name: 'apple' });
            documents.set('doc2', { name: 'orange' });
            documents.set('doc3', { name: 'grape' });

            const results = queryEngine._wildcardToDocs('name', '*e');
            expect(results.size).toBe(3);
            expect(results.has('doc1')).toBeTruthy();
            expect(results.has('doc2')).toBeTruthy();
            expect(results.has('doc3')).toBeTruthy();
        });

        test('should handle single character wildcard', () => {
            // Add documents to the documents map for wildcard matching
            documents.set('doc1', { name: 'cat' });
            documents.set('doc2', { name: 'hat' });
            documents.set('doc3', { name: 'bat' });

            const results = queryEngine._wildcardToDocs('name', '?at');
            expect(results.size).toBe(3);
            expect(results.has('doc1')).toBeTruthy();
            expect(results.has('doc2')).toBeTruthy();
            expect(results.has('doc3')).toBeTruthy();
        });

        test('should handle special characters in wildcard patterns', () => {
            // Setup documents with special characters
            documents.set('doc1', { name: 'user@example.com' });
            documents.set('doc2', { name: 'test+tag@domain.org' });
            documents.set('doc3', { name: 'simple-text' });

            // Add tokens to inverted index (tokenizer will split on special characters)
            invertedIndex.addToken('name:user@example.com', 'doc1', 0);
            invertedIndex.addToken('name:test+tag@domain.org', 'doc2', 0);
            invertedIndex.addToken('name:simple-text', 'doc3', 0);

            const results = queryEngine._wildcardToDocs('name', '*@*');
            expect(results.size).toBe(2);
            expect(results.has('doc1')).toBeTruthy();
            expect(results.has('doc2')).toBeTruthy();
        });
    });

    describe('Range Queries', () => {
        test('should find documents within numeric range', () => {
            documents.set('doc1', { age: 25 });
            documents.set('doc2', { age: 30 });
            documents.set('doc3', { age: 35 });
            documents.set('doc4', { age: 40 });

            const results = queryEngine._rangeToDocs('age', { gte: 30, lte: 35 });
            expect(results.size).toBe(2);
            expect(results.has('doc2')).toBeTruthy();
            expect(results.has('doc3')).toBeTruthy();
        });

        test('should handle string range queries', () => {
            documents.set('doc1', { name: 'alice' });
            documents.set('doc2', { name: 'bob' });
            documents.set('doc3', { name: 'charlie' });
            documents.set('doc4', { name: 'david' });

            const results = queryEngine._rangeToDocs('name', { gte: 'bob', lte: 'charlie' });
            expect(results.size).toBe(2);
            expect(results.has('doc2')).toBeTruthy();
            expect(results.has('doc3')).toBeTruthy();
        });

        test('should handle open ranges', () => {
            documents.set('doc1', { age: 25 });
            documents.set('doc2', { age: 30 });
            documents.set('doc3', { age: 35 });

            const results = queryEngine._rangeToDocs('age', { gte: 30 });
            expect(results.size).toBe(2);
            expect(results.has('doc2')).toBeTruthy();
            expect(results.has('doc3')).toBeTruthy();
        });
    });

    describe('Geo Distance Queries', () => {
        test('should find documents within geographic distance', () => {
            documents.set('doc1', { location: { lat: 40.7128, lon: -74.0060 } }); // NYC
            documents.set('doc2', { location: { lat: 34.0522, lon: -118.2437 } }); // LA
            documents.set('doc3', { location: { lat: 40.7128, lon: -74.0061 } }); // Near NYC

            const results = queryEngine._geoDistanceToDocs('location', { lat: 40.7128, lon: -74.0060 }, '10m');
            expect(results.size).toBe(2);
            expect(results.has('doc1')).toBeTruthy();
            expect(results.has('doc3')).toBeTruthy();
        });

        test('should handle invalid coordinates', () => {
            documents.set('doc1', { location: { lat: 200, lon: 300 } }); // Invalid

            const results = queryEngine._geoDistanceToDocs('location', { lat: 40.7128, lon: -74.0060 }, '10m');
            expect(results.size).toBe(0);
        });
    });

    describe('Boolean Queries', () => {
        test('should handle must clauses', () => {
            invertedIndex.addToken('name:hello', 'doc1', 0);
            invertedIndex.addToken('name:world', 'doc1', 1);
            invertedIndex.addToken('name:hello', 'doc2', 0);
            invertedIndex.addToken('name:there', 'doc2', 1);

            const query = {
                bool: {
                    must: [
                        { term: { field: 'name', value: 'hello' } },
                        { term: { field: 'name', value: 'world' } }
                    ]
                }
            };

            const results = queryEngine.execute(query);
            expect(results.size).toBe(1);
            expect(results.has('doc1')).toBeTruthy();
        });

        test('should handle should clauses', () => {
            invertedIndex.addToken('name:hello', 'doc1', 0);
            invertedIndex.addToken('name:world', 'doc2', 0);
            invertedIndex.addToken('name:test', 'doc3', 0);

            const query = {
                bool: {
                    should: [
                        { term: { field: 'name', value: 'hello' } },
                        { term: { field: 'name', value: 'world' } }
                    ]
                }
            };

            const results = queryEngine.execute(query);
            expect(results.size).toBe(2);
            expect(results.has('doc1')).toBeTruthy();
            expect(results.has('doc2')).toBeTruthy();
        });

        test('should handle must_not clauses', () => {
            invertedIndex.addToken('name:hello', 'doc1', 0);
            invertedIndex.addToken('name:world', 'doc2', 0);
            invertedIndex.addToken('name:test', 'doc3', 0);

            const query = {
                bool: {
                    must: [
                        { term: { field: 'name', value: 'hello' } }
                    ],
                    must_not: [
                        { term: { field: 'name', value: 'world' } }
                    ]
                }
            };

            const results = queryEngine.execute(query);
            expect(results.size).toBe(1);
            expect(results.has('doc1')).toBeTruthy();
        });

        test('should handle complex boolean queries', () => {
            invertedIndex.addToken('name:hello', 'doc1', 0);
            invertedIndex.addToken('name:world', 'doc1', 1);
            invertedIndex.addToken('name:hello', 'doc2', 0);
            invertedIndex.addToken('name:test', 'doc2', 1);
            invertedIndex.addToken('name:world', 'doc3', 0);

            const query = {
                bool: {
                    must: [
                        { term: { field: 'name', value: 'hello' } }
                    ],
                    should: [
                        { term: { field: 'name', value: 'world' } }
                    ],
                    must_not: [
                        { term: { field: 'name', value: 'test' } }
                    ]
                }
            };

            const results = queryEngine.execute(query);
            expect(results.size).toBe(1);
            expect(results.has('doc1')).toBeTruthy();
        });
    });

    describe('Multi-Field Queries', () => {
        test('should search across multiple fields', () => {
            invertedIndex.addToken('name:hello', 'doc1', 0);
            invertedIndex.addToken('description:world', 'doc1', 0);
            invertedIndex.addToken('name:test', 'doc2', 0);

            const query = {
                bool: {
                    should: [
                        { term: { field: 'name', value: 'hello' } },
                        { term: { field: 'description', value: 'world' } }
                    ]
                }
            };

            const results = queryEngine.execute(query);
            expect(results.size).toBe(1);
            expect(results.has('doc1')).toBeTruthy();
        });
    });

    describe('Phrase Queries', () => {
        test('should find documents with exact phrase', () => {
            invertedIndex.addToken('name:hello', 'doc1', 0);
            invertedIndex.addToken('name:world', 'doc1', 1);
            invertedIndex.addToken('name:hello', 'doc2', 0);
            invertedIndex.addToken('name:there', 'doc2', 1);

            // Add documents to the documents map for phrase matching
            documents.set('doc1', { name: 'hello world' });
            documents.set('doc2', { name: 'hello there' });

            const query = {
                phrase: {
                    field: 'name',
                    value: 'hello world'
                }
            };

            const results = queryEngine.execute(query);
            expect(results.size).toBe(1);
            expect(results.has('doc1')).toBeTruthy();
        });

        test('should handle phrase with slop', () => {
            invertedIndex.addToken('name:hello', 'doc1', 0);
            invertedIndex.addToken('name:there', 'doc1', 1);
            invertedIndex.addToken('name:world', 'doc1', 2);

            // Add documents to the documents map for phrase matching
            documents.set('doc1', { name: 'hello there world' });

            const query = {
                phrase: {
                    field: 'name',
                    value: 'hello world',
                    slop: 1
                }
            };

            const results = queryEngine.execute(query);
            expect(results.size).toBe(1);
            expect(results.has('doc1')).toBeTruthy();
        });
    });

    describe('Fuzzy Queries', () => {
        test('should find documents with fuzzy matching', () => {
            invertedIndex.addToken('name:hello', 'doc1', 0);
            invertedIndex.addToken('name:helo', 'doc2', 0);
            invertedIndex.addToken('name:world', 'doc3', 0);

            const query = {
                fuzzy: {
                    field: 'name',
                    value: 'hello',
                    fuzziness: 1
                }
            };

            const results = queryEngine.execute(query);
            expect(results.size).toBe(2);
            expect(results.has('doc1')).toBeTruthy();
            expect(results.has('doc2')).toBeTruthy();
        });
    });

    describe('Edge Cases', () => {
        test('should handle empty query', () => {
            const results = queryEngine.execute({});
            expect(results.size).toBe(0);
        });

        test('should handle null query', () => {
            const results = queryEngine.execute(null);
            expect(results.size).toBe(0);
        });

        test('should handle undefined query', () => {
            const results = queryEngine.execute(undefined);
            expect(results.size).toBe(0);
        });

        test('should handle unknown query type', () => {
            const query = { unknown: { field: 'name', value: 'test' } };
            const results = queryEngine.execute(query);
            expect(results.size).toBe(0);
        });

        test('should handle empty boolean clauses', () => {
            const query = { bool: {} };
            const results = queryEngine.execute(query);
            expect(results.size).toBe(0);
        });
    });

    describe('Performance Tests', () => {
        test('should handle large queries efficiently', () => {
            // Setup large index
            for (let i = 0; i < 1000; i++) {
                invertedIndex.addToken(`name:token${i}`, `doc${i}`, 0);
            }

            const start = Date.now();

            const query = {
                bool: {
                    should: [
                        { term: { field: 'name', value: 'token1' } },
                        { term: { field: 'name', value: 'token2' } },
                        { term: { field: 'name', value: 'token3' } }
                    ]
                }
            };

            const results = queryEngine.execute(query);
            const end = Date.now();

            expect(end - start < 100).toBeTruthy(); // should complete in under 100ms
            expect(results.size).toBe(3);
        });
    });
}); 