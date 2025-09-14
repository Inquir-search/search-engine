import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import SearchEngine from '../src/domain/SearchEngine.js';
import BM25Scorer from '../src/domain/BM25Scorer.js';
import MappingsManager from '../src/domain/MappingsManager.js';
import Tokenizer from '../src/domain/Tokenizer.js';
import InvertedIndex from '../src/domain/InvertedIndex.js';
import RankingPipeline from '../src/domain/RankingPipeline.js';
import StopwordsManager from '../src/infrastructure/StopwordsManager.js';
import SynonymEngine from '../src/domain/SynonymEngine.js';
import FacetEngine from '../src/domain/FacetEngine.js';

describe('SearchEngine Integration Tests', () => {
    let searchEngine;
    beforeEach(() => {
        const scorerFactoryBuilder = (totalDocs, avgDocLength, docLengths, invertedIndex) => {
            return new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex);
        };

        // Mock tokenizer that actually tokenizes text
        const mockTokenizer = {
            tokenize: (text, analyzer = 'standard') => {
                if (!text || typeof text !== 'string') return [];
                return text.toLowerCase()
                    .replace(/[^\w\s]/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .split(' ')
                    .filter(Boolean);
            }
        };

        // Create a proper mock mappings manager with test mappings
        const mockMappingsManager = new MappingsManager(null);
        // Set up field mappings for the test
        mockMappingsManager.setMapping('name', { type: 'text' });
        mockMappingsManager.setMapping('status', { type: 'keyword' });
        mockMappingsManager.setMapping('description', { type: 'text' });
        mockMappingsManager.setMapping('category', { type: 'text' });
        mockMappingsManager.setMapping('price', { type: 'float' });
        mockMappingsManager.setMapping('location', { type: 'geo_point' });

        searchEngine = new SearchEngine({
            tokenizer: mockTokenizer,
            scorerFactory: scorerFactoryBuilder,
            invertedIndex: new InvertedIndex(),
            rankingPipeline: new RankingPipeline(),
            stopwordsManager: new StopwordsManager({ get: () => [], autoSave: false }),
            synonymEngine: new SynonymEngine(),
            facetFields: [],
            mappingsManager: mockMappingsManager
        });

        // Clean the search engine state before each test
        searchEngine.clean();
    });

    test('should initialize search engine', () => {
        assert.ok(searchEngine);
        assert.strictEqual(searchEngine.totalDocs, 0);
    });

    describe('Document Indexing', () => {
        test('should index single document', () => {
            const doc = { id: 'doc1', name: 'Hello World' };
            searchEngine.add(doc);

            assert.strictEqual(searchEngine.totalDocs, 1);
            assert.ok(searchEngine.documents.has('doc1'));
            assert.deepStrictEqual(searchEngine.documents.get('doc1'), doc);
        });

        test('should index multiple documents', () => {
            const docs = [
                { id: 'doc1', name: 'Hello World' },
                { id: 'doc2', name: 'Test Document' },
                { id: 'doc3', name: 'Another Test' }
            ];

            docs.forEach(doc => searchEngine.add(doc));

            assert.strictEqual(searchEngine.totalDocs, 3);
            docs.forEach(doc => {
                assert.ok(searchEngine.documents.has(doc.id));
            });
        });

        test('should update existing document', () => {
            searchEngine.add({ id: 'doc1', name: 'Original' });
            searchEngine.add({ id: 'doc1', name: 'Updated' });

            assert.strictEqual(searchEngine.totalDocs, 1);
            assert.strictEqual(searchEngine.documents.get('doc1').name, 'Updated');
        });

        test('should handle documents with missing ID', () => {
            const doc = { name: 'No ID' };
            assert.throws(() => searchEngine.add(doc), Error);
        });

        test('should handle empty document', () => {
            const doc = { id: 'doc1' };
            searchEngine.add(doc);

            assert.strictEqual(searchEngine.totalDocs, 1);
            assert.ok(searchEngine.documents.has('doc1'));
        });
    });

    describe('Basic Search', () => {
        test('should find documents by exact term', () => {
            searchEngine.add({ id: 'doc1', name: 'Hello World' });
            searchEngine.add({ id: 'doc2', name: 'Test Document' });
            searchEngine.add({ id: 'doc3', name: 'Another Hello' });

            const results = searchEngine.search('hello');

            assert.strictEqual(results.hits.length, 2);
            const docIds = results.hits.map(h => h.id).sort();
            assert.deepStrictEqual(docIds, ['doc1', 'doc3']);
        });

        test('should handle case-insensitive search', () => {
            searchEngine.add({ id: 'doc1', name: 'Hello World' });

            const results = searchEngine.search('HELLO');

            assert.strictEqual(results.hits.length, 1);
            assert.strictEqual(results.hits[0].id, 'doc1');
        });

        test('should return empty results for non-existent term', () => {
            searchEngine.add({ id: 'doc1', name: 'Hello World' });

            const results = searchEngine.search('nonexistent');

            assert.strictEqual(results.hits.length, 0);
        });

        test('should handle empty search query', () => {
            searchEngine.add({ id: 'doc1', name: 'Hello World' });
            searchEngine.add({ id: 'doc2', name: 'Test Document' });

            const results = searchEngine.search('');

            assert.strictEqual(results.hits.length, 2);
            assert.strictEqual(results.total, 2);
        });

        test('should handle null search query', () => {
            searchEngine.add({ id: 'doc1', name: 'Hello World' });
            searchEngine.add({ id: 'doc2', name: 'Test Document' });

            const results = searchEngine.search(null);

            assert.strictEqual(results.hits.length, 2);
            assert.strictEqual(results.total, 2);
        });
    });

    describe('Multi-Word Search', () => {
        test('should find documents with all search terms', () => {
            searchEngine.add({ id: 'doc1', name: 'Hello World' });
            searchEngine.add({ id: 'doc2', name: 'Hello There' });
            searchEngine.add({ id: 'doc3', name: 'World Test' });

            const results = searchEngine.search('hello world');

            assert.strictEqual(results.hits.length, 1);
            assert.strictEqual(results.hits[0].id, 'doc1');
        });

        test('should handle partial matches', () => {
            searchEngine.add({ id: 'doc1', name: 'Hello World' });
            searchEngine.add({ id: 'doc2', name: 'Hello There' });
            searchEngine.add({ id: 'doc3', name: 'World Test' });

            const results = searchEngine.search('hello test');

            assert.strictEqual(results.hits.length, 0);
        });
    });

    describe('Field-Specific Search', () => {
        test('should search in specific field', () => {
            searchEngine.add({
                id: 'doc1',
                name: 'Hello World',
                description: 'Test description'
            });
            searchEngine.add({
                id: 'doc2',
                name: 'Test Document',
                description: 'Hello description'
            });

            const results = searchEngine.search({
                bool: {
                    must: [{ term: { field: 'name', value: 'hello' } }]
                }
            });

            assert.strictEqual(results.hits.length, 1);
            assert.strictEqual(results.hits[0].id, 'doc1');
        });

        test('should search across multiple fields', () => {
            searchEngine.add({
                id: 'doc1',
                name: 'Hello World',
                description: 'Test description'
            });
            searchEngine.add({
                id: 'doc2',
                name: 'Test Document',
                description: 'Hello description'
            });

            const results = searchEngine.search({
                bool: {
                    should: [
                        { term: { field: 'name', value: 'hello' } },
                        { term: { field: 'description', value: 'hello' } }
                    ]
                }
            });

            assert.strictEqual(results.hits.length, 2);
        });
    });

    describe('Advanced Query Types', () => {
        test('should handle prefix queries', () => {
            searchEngine.add({ id: 'doc1', name: 'apple' });
            searchEngine.add({ id: 'doc2', name: 'application' });
            searchEngine.add({ id: 'doc3', name: 'banana' });

            const results = searchEngine.search({
                bool: {
                    must: [{ prefix: { field: 'name', value: 'app' } }]
                }
            });

            assert.strictEqual(results.hits.length, 2);
            const docIds = results.hits.map(h => h.id).sort();
            assert.deepStrictEqual(docIds, ['doc1', 'doc2']);
        });

        test('should handle wildcard queries', () => {
            searchEngine.add({ id: 'doc1', name: 'apple' });
            searchEngine.add({ id: 'doc2', name: 'orange' });
            searchEngine.add({ id: 'doc3', name: 'grape' });

            const results = searchEngine.search({
                bool: {
                    must: [{ wildcard: { field: 'name', value: '*e' } }]
                }
            });

            assert.strictEqual(results.hits.length, 3);
        });

        test('should handle range queries', () => {
            searchEngine.add({ id: 'doc1', age: 25 });
            searchEngine.add({ id: 'doc2', age: 30 });
            searchEngine.add({ id: 'doc3', age: 35 });

            const results = searchEngine.search({
                bool: {
                    must: [{ range: { field: 'age', gte: 30, lte: 35 } }]
                }
            });

            assert.strictEqual(results.hits.length, 2);
            const docIds = results.hits.map(h => h.id).sort();
            assert.deepStrictEqual(docIds, ['doc2', 'doc3']);
        });

        test('should handle boolean queries', () => {
            searchEngine.add({ id: 'doc1', name: 'hello', status: 'active' });
            searchEngine.add({ id: 'doc2', name: 'world', status: 'inactive' });
            searchEngine.add({ id: 'doc3', name: 'test', status: 'active' });

            const results = searchEngine.search({
                bool: {
                    must: [
                        { term: { field: 'name', value: 'hello' } }
                    ],
                    should: [
                        { term: { field: 'status', value: 'active' } }
                    ]
                }
            });

            assert.strictEqual(results.hits.length, 1);
            assert.strictEqual(results.hits[0].id, 'doc1');
        });
    });

    describe('Pagination', () => {
        test('should apply pagination to results', () => {
            for (let i = 1; i <= 10; i++) {
                searchEngine.add({ id: `doc${i}`, name: `Document ${i}` });
            }

            const results = searchEngine.search('document', { from: 0, size: 3 });

            assert.strictEqual(results.hits.length, 3);
            assert.strictEqual(results.total, 10);
            assert.strictEqual(results.from, 0);
            assert.strictEqual(results.size, 3);
        });

        test('should handle pagination beyond results', () => {
            searchEngine.add({ id: 'doc1', name: 'Hello World' });

            const results = searchEngine.search('hello', { from: 10, size: 5 });

            assert.strictEqual(results.hits.length, 0);
            assert.strictEqual(results.total, 1);
            assert.strictEqual(results.from, 10);
            assert.strictEqual(results.size, 5);
        });

        test('should handle zero size pagination', () => {
            searchEngine.add({ id: 'doc1', name: 'Hello World' });

            const results = searchEngine.search('hello', { from: 0, size: 0 });

            assert.strictEqual(results.hits.length, 0);
            assert.strictEqual(results.total, 1);
        });
    });

    describe('Scoring and Ranking', () => {
        test('should rank results by relevance score', () => {
            searchEngine.add({ id: 'doc1', name: 'hello world' });
            searchEngine.add({ id: 'doc2', name: 'hello' });
            searchEngine.add({ id: 'doc3', name: 'world' });

            const results = searchEngine.search('hello world', { size: 10, operator: 'or' });

            assert.strictEqual(results.hits.length, 3);
            // doc1 should have highest score (contains both terms)
            assert.strictEqual(results.hits[0].id, 'doc1');
            assert.ok(results.hits[0]._score > results.hits[1]._score);
        });

        test('should handle documents with same score', () => {
            searchEngine.add({ id: 'doc1', name: 'hello' });
            searchEngine.add({ id: 'doc2', name: 'hello' });

            const results = searchEngine.search('hello');

            assert.strictEqual(results.hits.length, 2);
            assert.ok(results.hits[0]._score > 0);
            assert.ok(results.hits[1]._score > 0);
        });
    });

    describe('Faceted Search', () => {
        test('should calculate facets for results', () => {
            searchEngine.add({ id: 'doc1', name: 'Hello World', category: 'tech' });
            searchEngine.add({ id: 'doc2', name: 'Test Document', category: 'tech' });
            searchEngine.add({ id: 'doc3', name: 'Another Test', category: 'news' });

            // Set up facet fields
            searchEngine.facetFields = ['category'];

            const results = searchEngine.search('test', { size: 10, operator: 'or' });

            assert.ok(results.facets);
            assert.ok(results.facets.category);
            assert.strictEqual(results.facets.category.tech, 1);
            assert.strictEqual(results.facets.category.news, 1);
        });

        test('should handle empty facets', () => {
            searchEngine.add({ id: 'doc1', name: 'Hello World' });

            const results = searchEngine.search('hello');

            assert.ok(results.facets);
            assert.strictEqual(Object.keys(results.facets).length, 0);
        });
    });

    describe('Document Removal', () => {
        test('should remove document from index', () => {
            searchEngine.add({ id: 'doc1', name: 'Hello World' });
            searchEngine.add({ id: 'doc2', name: 'Test Document' });

            searchEngine.remove('doc1');

            assert.strictEqual(searchEngine.totalDocs, 1);
            assert.ok(!searchEngine.documents.has('doc1'));
            assert.ok(searchEngine.documents.has('doc2'));
        });

        test('should handle removing non-existent document', () => {
            searchEngine.add({ id: 'doc1', name: 'Hello World' });

            searchEngine.remove('nonexistent');

            assert.strictEqual(searchEngine.totalDocs, 1);
            assert.ok(searchEngine.documents.has('doc1'));
        });

        test('should update search results after removal', () => {
            searchEngine.add({ id: 'doc1', name: 'Hello World' });
            searchEngine.add({ id: 'doc2', name: 'Test Document' });

            let results = searchEngine.search('hello');
            assert.strictEqual(results.hits.length, 1);

            searchEngine.remove('doc1');

            results = searchEngine.search('hello');
            assert.strictEqual(results.hits.length, 0);
        });
    });

    describe('Engine Cleanup', () => {
        test('should clean all engine state', () => {
            searchEngine.add({ id: 'doc1', name: 'Hello World' });
            searchEngine.add({ id: 'doc2', name: 'Test Document' });

            searchEngine.clean();

            assert.strictEqual(searchEngine.totalDocs, 0);
            assert.strictEqual(searchEngine.documents.size, 0);
            assert.strictEqual(searchEngine.invertedIndex.index.size, 0);
        });

        test('should handle search after cleanup', () => {
            searchEngine.add({ id: 'doc1', name: 'Hello World' });
            searchEngine.clean();

            const results = searchEngine.search('hello');

            assert.strictEqual(results.hits.length, 0);
            assert.strictEqual(results.total, 0);
        });
    });

    describe('Performance Tests', () => {
        test('should handle large document sets efficiently', () => {
            const start = Date.now();

            for (let i = 0; i < 1000; i++) {
                searchEngine.add({
                    id: `doc${i}`,
                    name: `Document ${i}`,
                    description: `Description for document ${i}`
                });
            }

            const indexTime = Date.now() - start;
            // Allow slightly more time in constrained environments
            assert.ok(indexTime < 2000); // should index in under 2 seconds

            const searchStart = Date.now();
            const results = searchEngine.search('document', { size: 1000 });
            const searchTime = Date.now() - searchStart;

            assert.ok(searchTime < 100); // should search in under 100ms
            assert.strictEqual(results.hits.length, 1000);
        });

        test('should handle complex queries efficiently', () => {
            // Setup test data
            for (let i = 0; i < 100; i++) {
                searchEngine.add({
                    id: `doc${i}`,
                    name: `Document ${i}`,
                    category: i % 2 === 0 ? 'tech' : 'news',
                    status: i % 3 === 0 ? 'active' : 'inactive'
                });
            }

            const start = Date.now();

            const results = searchEngine.search({
                bool: {
                    must: [
                        { term: { field: 'category', value: 'tech' } }
                    ],
                    should: [
                        { term: { field: 'status', value: 'active' } }
                    ]
                }
            });

            const end = Date.now();

            assert.ok(end - start < 100); // should complete in under 100ms
            assert.ok(results.hits.length > 0);
        });
    });

    describe('Error Handling', () => {
        test('should handle invalid query format', () => {
            searchEngine.add({ id: 'doc1', name: 'Hello World' });

            const results = searchEngine.search({ invalid: 'query' });

            assert.strictEqual(results.hits.length, 0);
        });

        test('should handle malformed boolean query', () => {
            searchEngine.add({ id: 'doc1', name: 'Hello World' });

            const results = searchEngine.search({
                bool: {
                    must: 'not an array'
                }
            });

            assert.strictEqual(results.hits.length, 0);
        });

        test('should handle missing field in term query', () => {
            searchEngine.add({ id: 'doc1', name: 'Hello World' });

            const results = searchEngine.search({
                bool: {
                    must: [{ term: { value: 'hello' } }]
                }
            });

            assert.strictEqual(results.hits.length, 0);
        });
    });
}); 