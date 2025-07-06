import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import QueryEngine from '../src/domain/QueryEngine.js';
import InvertedIndex from '../src/domain/InvertedIndex.js';
import SynonymEngine from '../src/domain/SynonymEngine.js';
import Tokenizer from '../src/domain/Tokenizer.js';

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

let queryEngine;
let invertedIndex;
let synonymEngine;
let tokenizer;
let mappingsManager;
let stopwordsManager;
let documents;

describe('QueryEngine Module Tests', () => {
    beforeEach(() => {
        invertedIndex = new InvertedIndex();
        synonymEngine = new SynonymEngine();
        mappingsManager = new MockMappingsManager();
        stopwordsManager = new MockStopwordsManager();
        tokenizer = new Tokenizer(stopwordsManager);
        documents = new Map();
        queryEngine = new QueryEngine(invertedIndex, synonymEngine, tokenizer, documents);
    });

    test('should initialize query engine', () => {
        assert.ok(queryEngine);
    });

    describe('Term Queries', () => {
        test('should find documents with exact term match', () => {
            // Setup index
            invertedIndex.addToken('name:hello', 'doc1', 0);
            invertedIndex.addToken('name:world', 'doc1', 1);
            invertedIndex.addToken('name:hello', 'doc2', 0);

            const results = queryEngine._termToDocs('name', 'hello');
            assert.strictEqual(results.size, 2);
            assert.ok(results.has('doc1'));
            assert.ok(results.has('doc2'));
        });

        test('should return empty set for non-existent term', () => {
            const results = queryEngine._termToDocs('name', 'nonexistent');
            assert.strictEqual(results.size, 0);
        });

        test('should handle case-insensitive matching', () => {
            invertedIndex.addToken('name:hello', 'doc1', 0);

            const results = queryEngine._termToDocs('name', 'HELLO');
            assert.strictEqual(results.size, 1);
            assert.ok(results.has('doc1'));
        });
    });

    describe('Prefix Queries', () => {
        test('should find documents with prefix match', () => {
            invertedIndex.addToken('name:apple', 'doc1', 0);
            invertedIndex.addToken('name:application', 'doc2', 0);
            invertedIndex.addToken('name:banana', 'doc3', 0);

            const results = queryEngine._prefixToDocs('name', 'app');
            assert.strictEqual(results.size, 2);
            assert.ok(results.has('doc1'));
            assert.ok(results.has('doc2'));
        });

        test('should handle multi-word prefix queries', () => {
            invertedIndex.addToken('name:hello', 'doc1', 0);
            invertedIndex.addToken('name:world', 'doc1', 1);
            invertedIndex.addToken('name:hello', 'doc2', 0);
            invertedIndex.addToken('name:there', 'doc2', 1);

            const results = queryEngine._prefixToDocs('name', 'hello world');
            assert.strictEqual(results.size, 1);
            assert.ok(results.has('doc1'));
        });

        test('should return empty set for non-matching prefix', () => {
            invertedIndex.addToken('name:apple', 'doc1', 0);

            const results = queryEngine._prefixToDocs('name', 'xyz');
            assert.strictEqual(results.size, 0);
        });
    });

    describe('Wildcard Queries', () => {
        test('should find documents with wildcard pattern', () => {
            invertedIndex.addToken('name:apple', 'doc1', 0);
            invertedIndex.addToken('name:application', 'doc2', 0);
            invertedIndex.addToken('name:banana', 'doc3', 0);

            const results = queryEngine._wildcardToDocs('name', 'app*');
            assert.strictEqual(results.size, 2);
            assert.ok(results.has('doc1'));
            assert.ok(results.has('doc2'));
        });

        test('should handle suffix wildcard', () => {
            invertedIndex.addToken('name:apple', 'doc1', 0);
            invertedIndex.addToken('name:orange', 'doc2', 0);
            invertedIndex.addToken('name:grape', 'doc3', 0);

            const results = queryEngine._wildcardToDocs('name', '*e');
            assert.strictEqual(results.size, 3);
            assert.ok(results.has('doc1'));
            assert.ok(results.has('doc2'));
            assert.ok(results.has('doc3'));
        });

        test('should handle single character wildcard', () => {
            invertedIndex.addToken('name:cat', 'doc1', 0);
            invertedIndex.addToken('name:hat', 'doc2', 0);
            invertedIndex.addToken('name:bat', 'doc3', 0);

            const results = queryEngine._wildcardToDocs('name', '?at');
            assert.strictEqual(results.size, 3);
            assert.ok(results.has('doc1'));
            assert.ok(results.has('doc2'));
            assert.ok(results.has('doc3'));
        });

        test('should handle special characters in wildcard patterns', () => {
            // Setup documents with special characters
            documents.set('doc1', { name: 'user@example.com' });
            documents.set('doc2', { name: 'test+tag@domain.org' });
            documents.set('doc3', { name: 'simple-text' });

            const results = queryEngine._wildcardToDocs('name', '*@*');
            assert.strictEqual(results.size, 2);
            assert.ok(results.has('doc1'));
            assert.ok(results.has('doc2'));
        });
    });

    describe('Range Queries', () => {
        test('should find documents within numeric range', () => {
            documents.set('doc1', { age: 25 });
            documents.set('doc2', { age: 30 });
            documents.set('doc3', { age: 35 });
            documents.set('doc4', { age: 40 });

            const results = queryEngine._rangeToDocs('age', { gte: 30, lte: 35 });
            assert.strictEqual(results.size, 2);
            assert.ok(results.has('doc2'));
            assert.ok(results.has('doc3'));
        });

        test('should handle string range queries', () => {
            documents.set('doc1', { name: 'alice' });
            documents.set('doc2', { name: 'bob' });
            documents.set('doc3', { name: 'charlie' });
            documents.set('doc4', { name: 'david' });

            const results = queryEngine._rangeToDocs('name', { gte: 'bob', lte: 'charlie' });
            assert.strictEqual(results.size, 2);
            assert.ok(results.has('doc2'));
            assert.ok(results.has('doc3'));
        });

        test('should handle open ranges', () => {
            documents.set('doc1', { age: 25 });
            documents.set('doc2', { age: 30 });
            documents.set('doc3', { age: 35 });

            const results = queryEngine._rangeToDocs('age', { gte: 30 });
            assert.strictEqual(results.size, 2);
            assert.ok(results.has('doc2'));
            assert.ok(results.has('doc3'));
        });
    });

    describe('Geo Distance Queries', () => {
        test('should find documents within geographic distance', () => {
            documents.set('doc1', { location: { lat: 40.7128, lon: -74.0060 } }); // NYC
            documents.set('doc2', { location: { lat: 34.0522, lon: -118.2437 } }); // LA
            documents.set('doc3', { location: { lat: 40.7128, lon: -74.0061 } }); // Near NYC

            const results = queryEngine._geoDistanceToDocs('location', { lat: 40.7128, lon: -74.0060 }, 1);
            assert.strictEqual(results.size, 2);
            assert.ok(results.has('doc1'));
            assert.ok(results.has('doc3'));
        });

        test('should handle invalid coordinates', () => {
            documents.set('doc1', { location: { lat: 200, lon: 300 } }); // Invalid

            const results = queryEngine._geoDistanceToDocs('location', { lat: 40.7128, lon: -74.0060 }, 1);
            assert.strictEqual(results.size, 0);
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
            assert.strictEqual(results.size, 1);
            assert.ok(results.has('doc1'));
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
            assert.strictEqual(results.size, 2);
            assert.ok(results.has('doc1'));
            assert.ok(results.has('doc2'));
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
            assert.strictEqual(results.size, 1);
            assert.ok(results.has('doc1'));
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
            assert.strictEqual(results.size, 1);
            assert.ok(results.has('doc1'));
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
            assert.strictEqual(results.size, 1);
            assert.ok(results.has('doc1'));
        });
    });

    describe('Phrase Queries', () => {
        test('should find documents with exact phrase', () => {
            invertedIndex.addToken('name:hello', 'doc1', 0);
            invertedIndex.addToken('name:world', 'doc1', 1);
            invertedIndex.addToken('name:hello', 'doc2', 0);
            invertedIndex.addToken('name:there', 'doc2', 1);

            const query = {
                phrase: {
                    field: 'name',
                    value: 'hello world'
                }
            };

            const results = queryEngine.execute(query);
            assert.strictEqual(results.size, 1);
            assert.ok(results.has('doc1'));
        });

        test('should handle phrase with slop', () => {
            invertedIndex.addToken('name:hello', 'doc1', 0);
            invertedIndex.addToken('name:there', 'doc1', 1);
            invertedIndex.addToken('name:world', 'doc1', 2);

            const query = {
                phrase: {
                    field: 'name',
                    value: 'hello world',
                    slop: 1
                }
            };

            const results = queryEngine.execute(query);
            assert.strictEqual(results.size, 1);
            assert.ok(results.has('doc1'));
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
            assert.strictEqual(results.size, 2);
            assert.ok(results.has('doc1'));
            assert.ok(results.has('doc2'));
        });
    });

    describe('Edge Cases', () => {
        test('should handle empty query', () => {
            const results = queryEngine.execute({});
            assert.strictEqual(results.size, 0);
        });

        test('should handle null query', () => {
            const results = queryEngine.execute(null);
            assert.strictEqual(results.size, 0);
        });

        test('should handle undefined query', () => {
            const results = queryEngine.execute(undefined);
            assert.strictEqual(results.size, 0);
        });

        test('should handle unknown query type', () => {
            const query = { unknown: { field: 'name', value: 'test' } };
            const results = queryEngine.execute(query);
            assert.strictEqual(results.size, 0);
        });

        test('should handle empty boolean clauses', () => {
            const query = { bool: {} };
            const results = queryEngine.execute(query);
            assert.strictEqual(results.size, 0);
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

            assert.ok(end - start < 100); // should complete in under 100ms
            assert.strictEqual(results.size, 3);
        });
    });
}); 