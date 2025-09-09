import { test, describe, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { expect } from 'vitest';
import { unlink } from 'node:fs/promises';

// --- Domain & Infrastructure ---
import { SearchEngine, SynonymEngine, BM25Scorer, Tokenizer, ShardedInvertedIndex, RankingPipeline, MappingsManager } from '../src/index.ts';
import { QueryEngine } from '../src/domain/QueryEngine';

// In-memory mocks
class MockMappingsManager {
    constructor() {
        this.mappings = new Map([
            ['name', { type: 'text' }],
            ['status', { type: 'keyword' }],
            ['type', { type: 'keyword' }],
        ]);
    }
    getFieldType(field) { return (this.mappings.get(field) || { type: 'text' }).type; }
    getTextFields() { return Array.from(this.mappings.entries()).filter(([, mapping]) => ['text', 'keyword', 'email', 'url'].includes(mapping.type)).map(([field]) => field); }
    autoExtend(doc) {
        console.log('autoExtend called with doc:', doc);
        for (const [k, v] of Object.entries(doc)) {
            if (k === 'id') continue;
            if (!this.mappings.has(k)) {
                let type = 'text';
                if (typeof v === 'number') type = 'float';
                else if (typeof v === 'boolean') type = 'boolean';
                else if (Array.isArray(v) && v.length === 2 && v.every(n => typeof n === 'number')) type = 'geo_point';
                else if (typeof v === 'string') {
                    // Detect special string types
                    if (/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$/.test(v)) type = 'email';
                    else if (/^https?:\/\/.+/.test(v)) type = 'url';
                    else type = 'text';
                }
                console.log(`Field ${k} with value "${v}" detected as type: ${type}`);
                this.mappings.set(k, { type });
            }
        }
        console.log('Final mappings:', this.mappings);
    }
    validate(doc) { return true; }
    getMapping(fieldName) { if (fieldName == null) return { type: 'text' }; if (this.mappings.has(fieldName)) return this.mappings.get(fieldName); return { type: 'text' }; }
    _compileValidator() { }
}
class MockStopwordsManager {
    constructor() { this.stopwords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']); }
    getAll() { return Array.from(this.stopwords); }
    isStopword(word) { return this.stopwords.has(word.toLowerCase()); }
    autoDetect() { return null; }
}

// Patch SynonymEngine for tests to provide isEnabled and getSynonyms
class TestSynonymEngine {
    isEnabled() { return false; }
    getSynonyms() { return []; }
}

describe('Querying Logic Tests', () => {
    let queryEngine;
    let mappingsManager;
    let stopwordsManager;

    beforeAll(async () => {
        await unlink('snapshot.json').catch(() => { });
        await unlink('aof.log').catch(() => { });

        stopwordsManager = new MockStopwordsManager();
        mappingsManager = new MappingsManager();
        // Override the name field to be text type for testing
        mappingsManager.mappings.set('name', { type: 'text' });
        const synonymEngine = new TestSynonymEngine();

        const scorerFactory = (totalDocs, avgDocLength, docLengths, index) =>
            new BM25Scorer(totalDocs, avgDocLength, docLengths, index);

        queryEngine = new QueryEngine(
            new ShardedInvertedIndex({ numShards: 1 }),
            synonymEngine,
            new Tokenizer(stopwordsManager),
            new Map(),
            mappingsManager,
            new RankingPipeline(
                new BM25Scorer(0, 0, new Map(), new ShardedInvertedIndex({ numShards: 1 })),
                new Tokenizer(stopwordsManager)
            )
        );
    });

    beforeEach(async () => {
        const stopwordsManager = new MockStopwordsManager();
        const tokenizer = new Tokenizer(stopwordsManager);
        const invertedIndex = new ShardedInvertedIndex({ numShards: 1 });
        mappingsManager = new MockMappingsManager();
        const documents = new Map();
        const scorer = new BM25Scorer(0, 0, new Map(), invertedIndex);
        const rankingPipeline = new RankingPipeline(scorer, tokenizer);
        queryEngine = new QueryEngine(invertedIndex, new SynonymEngine(), tokenizer, documents, mappingsManager, rankingPipeline);

        // Clean the engine to ensure fresh state
        queryEngine.clean();

        // Add some sample documents
        const docs = [
            { id: 'doc1', name: 'A unique document' },
            { id: 'doc2', name: 'rick' },
            { id: 'doc3', name: 'rick morty' },
            { id: 'doc4', name: 'some document' },
            { id: 'doc5', name: 'word' },
            { id: 'doc6', name: 'word word word' },
            { id: 'doc7', name: 'nonexistentterm123' },
            { id: 'doc8', name: 'test' },
            { id: 'doc9', name: 'red apple', category: 'fruit', price: 1.5 },
            { id: 'doc10', name: 'red car', category: 'vehicle', price: 25000 },
            { id: 'doc11', name: 'green apple', category: 'fruit', price: 2.0 },
            { id: 'doc12', name: 'university' },
            { id: 'doc13', name: 'unique' },
            { id: 'doc14', name: 'different' },
            { id: 'doc15', name: 'documnt', status: 'A' },
            { id: 'doc16', name: 'alpha', type: 'keyword' },
            { id: 'doc17', name: 'beta', type: 'keyword' },
            { id: 'doc18', name: 'Hello World' },
            { id: 'doc19', name: 'john.doe@example.com' },
            { id: 'doc20', name: 'jane.smith@company.org' },
            { id: 'doc21', name: 'bob+tag@test.co.uk' },
            { id: 'doc22', name: 'Homepage', url: 'https://example.com' },
            { id: 'doc23', name: 'API Docs', url: 'https://api.example.com/docs' },
            { id: 'doc24', name: 'Blog', url: 'https://blog.company.org/posts/123' },
            { id: 'doc25', name: '123-456-7890' },
            { id: 'doc26', name: '(555) 123-4567' },
            { id: 'doc27', name: '+1-555-987-6543' },
            { id: 'doc28', name: 'Contact Info', email: 'user@example.com', phone: '555-123-4567', url: 'https://example.com/profile' },
            { id: 'doc29', name: 'page1', name: 'Document 1' },
            { id: 'doc30', name: 'Document 2' },
            { id: 'doc31', name: 'Document 3' },
            { id: 'doc32', name: "Don't worry, be happy!" },
            { id: 'doc33', name: 'The cat\'s toy is here.' },
            { id: 'doc34', name: 'Multiple...dots...here' },
            { id: 'doc35', name: 'Hyphenated-word test' },
            { id: 'doc36', name: 'test.com' },
            { id: 'doc37', name: 'test+plus' },
            { id: 'doc38', name: 'user@example.com' },
            { id: 'doc39', name: 'test+tag@domain.org' },
            { id: 'doc40', name: 'simple-text' },
            { id: 'doc41', name: 'file.txt' },
        ];
        docs.forEach(doc => queryEngine.add(doc));
    });

    afterEach(async () => {
        if (queryEngine && typeof queryEngine.shutdown === 'function') {
            await queryEngine.shutdown();
            queryEngine = null;
        }
    });

    // 1. Core Logic Tests
    test('should find a document with a single-word match', () => {
        queryEngine.add({ id: 'test-doc1', name: 'A unique document' });

        const results = queryEngine.search('unique');

        expect(results.hits.length).toBe(3); // Should find test-doc1, doc1, and doc13
        expect(results.hits.some(h => h.id === 'test-doc1')).toBe(true);
        expect(results.hits.some(h => h.id === 'doc1')).toBe(true);
        expect(results.hits.some(h => h.id === 'doc13')).toBe(true);
    });

    test('should correctly perform a multi-word AND search', () => {
        queryEngine.add({ id: 'doc1', name: 'rick' });
        queryEngine.add({ id: 'doc2', name: 'morty' });
        queryEngine.add({ id: 'doc3', name: 'rick morty' });

        const results = queryEngine.search('rick morty');
        expect(results.hits.length).toBe(1);
        expect(results.hits[0].id).toBe('doc3');
    });

    // 2. Relevance & Scoring Tests
    test('should include a _score in every result', () => {
        queryEngine.add({ id: 'doc1', name: 'some document' });
        const results = queryEngine.search('document');
        expect(results.hits.length > 0).toBeTruthy();
        expect(typeof results.hits[0]._score === 'number' && results.hits[0]._score > 0).toBeTruthy();
    });

    test('should rank documents with higher term frequency higher', () => {
        // Clean engine to ensure only our test documents
        queryEngine.clean();

        queryEngine.add({ id: 'docA', name: 'word' });
        queryEngine.add({ id: 'docB', name: 'word word word' });

        const results = queryEngine.search('word');

        expect(results.hits.length).toBe(2);
        expect(results.hits[0].id).toBe('docB').toBeTruthy();
    });

    // 3. Edge Case Tests
    test('should return zero results for a non-existent term', () => {
        queryEngine.clean();
        queryEngine.add({ id: 'doc1', name: 'a document' });
        const results = queryEngine.search('nonexistentterm123');
        expect(results.hits.length).toBe(0);
    });

    test('should return zero results for an empty query', () => {
        queryEngine.clean();
        queryEngine.add({ id: 'e1', name: 'test' });
        const results = queryEngine.search('');
        // Now returns all documents when no query is provided
        expect(results.hits.length).toBe(1);
        expect(results.hits[0].id).toBe('e1');
    });

    // 4. Feature Tests
    test('should return correct facets for the result set', () => {
        mappingsManager.mappings['status'] = { type: 'keyword' };
        mappingsManager._compileValidator();
        queryEngine.facetFields = ['status']; // Ensure status is in facet fields
        queryEngine.add({ id: 'd1', name: 'doc', status: 'A' });
        queryEngine.add({ id: 'd2', name: 'doc', status: 'A' });
        queryEngine.add({ id: 'd3', name: 'doc', status: 'B' });
        queryEngine.add({ id: 'd4', name: 'other', status: 'C' });

        const results = queryEngine.search('doc');
        expect(results.hits.length).toBe(3);
        expect(results.facets).toEqual({ status: { A: 2, B: 1 } });
    });

    test('should match exact keyword field', () => {
        mappingsManager.mappings['type'] = { type: 'keyword' };
        mappingsManager._compileValidator();
        queryEngine.add({ id: 'k1', name: 'foo', type: 'alpha' });
        queryEngine.add({ id: 'k2', name: 'bar', type: 'beta' });
        const results = queryEngine.search({ bool: { must: [{ term: { field: 'type', value: 'alpha' } }] } });
        expect(results.hits.length).toBe(1);
        expect(results.hits[0].id).toBe('k1');
    });

    test('should be case insensitive', () => {
        queryEngine.clean();
        queryEngine.add({ id: 'c1', name: 'Hello World' });
        const results = queryEngine.search('hello');
        expect(results.hits.length).toBe(1);
        expect(results.hits[0].id).toBe('c1');
    });

    test('should ignore stopwords', () => {
        queryEngine.add({ id: 's1', name: 'the quick brown fox' });
        const results = queryEngine.search('the quick');
        expect(results.hits.length).toBe(1);
        expect(results.hits[0].id).toBe('s1');
    });

    test('should return no results for nonexistent field', () => {
        queryEngine.add({ id: 'n1', name: 'foo' });
        const results = queryEngine.search({ bool: { must: [{ match: { field: 'nonexistent', value: 'foo' } }] } });
        expect(results.hits.length).toBe(0);
    });

    test('should support boolean must and must_not', () => {
        queryEngine.add({ id: 'b1', name: 'foo bar' });
        queryEngine.add({ id: 'b2', name: 'foo baz' });
        const results = queryEngine.search({
            bool: {
                must: [{ match: { field: 'name', value: 'foo' } }],
                must_not: [{ match: { field: 'name', value: 'baz' } }]
            }
        });
        expect(results.hits.length).toBe(1);
        expect(results.hits[0].id).toBe('b1');
    });

    test('should support prefix queries', () => {
        queryEngine.clean();
        queryEngine.add({ id: 'p1', name: 'university' });
        queryEngine.add({ id: 'p2', name: 'unique' });
        queryEngine.add({ id: 'p3', name: 'different' });
        const results = queryEngine.search({
            bool: {
                must: [{ prefix: { field: 'name', value: 'uni' } }]
            }
        });
        expect(results.hits.length).toBe(2);
        const ids = results.hits.map(h => h.id).sort();
        expect(ids).toEqual(['p1', 'p2']);
    });

    test('should support fuzzy queries', () => {
        queryEngine.clean();
        queryEngine.add({ id: 'f1', name: 'document' });
        queryEngine.add({ id: 'f2', name: 'different' });
        const results = queryEngine.search({
            bool: {
                must: [{ fuzzy: { field: 'name', value: 'documnt', fuzziness: 2 } }]
            }
        });
        expect(results.hits.length).toBe(1);
        expect(results.hits[0].id).toBe('f1');
    });

    test('should support phrase queries', () => {
        queryEngine.add({ id: 'ph1', name: 'quick brown fox' });
        queryEngine.add({ id: 'ph2', name: 'quick fox brown' });
        const results = queryEngine.search({
            bool: {
                must: [{ match_phrase: { field: 'name', value: 'quick brown fox' } }]
            }
        });
        expect(results.hits.length).toBe(1);
        expect(results.hits[0].id).toBe('ph1');
    });

    test('should support wildcard queries', () => {
        queryEngine.clean();
        queryEngine.add({ id: 'w1', name: 'test' });
        queryEngine.add({ id: 'w2', name: 'text' });
        queryEngine.add({ id: 'w3', name: 'different' });
        const results = queryEngine.search({
            bool: {
                must: [{ wildcard: { field: 'name', value: 'te*t' } }]
            }
        });
        expect(results.hits.length).toBe(2);
        const ids = results.hits.map(h => h.id).sort();
        expect(ids).toEqual(['w1', 'w2']);
    });

    test('should support multi-word prefix queries', () => {
        queryEngine.add({ id: 'mp1', name: 'quick brown fox' });
        queryEngine.add({ id: 'mp2', name: 'quick red fox' });
        queryEngine.add({ id: 'mp3', name: 'slow brown fox' });
        queryEngine.add({ id: 'mp4', name: 'quick brown dog' });
        const results = queryEngine.search({
            bool: {
                must: [{ prefix: { field: 'name', value: 'quick brown' } }]
            }
        });
        expect(results.hits.length).toBe(2);
        const ids = results.hits.map(h => h.id).sort();
        expect(ids).toEqual(['mp1', 'mp4']);
    });

    test('should support range queries', () => {
        mappingsManager.mappings['age'] = { type: 'integer' };
        mappingsManager._compileValidator();
        queryEngine.add({ id: 'r1', name: 'person1', age: 25 });
        queryEngine.add({ id: 'r2', name: 'person2', age: 35 });
        queryEngine.add({ id: 'r3', name: 'person3', age: 45 });
        const results = queryEngine.search({
            bool: {
                must: [{ range: { field: 'age', gte: 30, lte: 40 } }]
            }
        });
        expect(results.hits.length).toBe(1);
        expect(results.hits[0].id).toBe('r2');
    });

    test('should support geo_distance queries', () => {
        mappingsManager.mappings['location'] = { type: 'geo_point' };
        mappingsManager._compileValidator();
        queryEngine.add({ id: 'g1', name: 'place1', location: [0, 0] });
        queryEngine.add({ id: 'g2', name: 'place2', location: [1, 1] });
        queryEngine.add({ id: 'g3', name: 'place3', location: [10, 10] });
        const results = queryEngine.search({
            bool: {
                must: [{
                    geo_distance: {
                        field: 'location',
                        center: [0.5, 0.5],
                        distance: 100 // 100km - should include g1 and g2 but not g3
                    }
                }]
            }
        });
        expect(results.hits.length).toBe(2);
        const ids = results.hits.map(h => h.id).sort();
        expect(ids).toEqual(['g1', 'g2']);
    });

    test('should support should clauses (OR logic)', () => {
        queryEngine.clean();
        queryEngine.add({ id: 'sh1', name: 'apple' });
        queryEngine.add({ id: 'sh2', name: 'banana' });
        queryEngine.add({ id: 'sh3', name: 'orange' });
        const results = queryEngine.search({
            bool: {
                should: [
                    { match: { field: 'name', value: 'apple' } },
                    { match: { field: 'name', value: 'banana' } }
                ]
            }
        });
        expect(results.hits.length).toBe(2);
        const ids = results.hits.map(h => h.id).sort();
        expect(ids).toEqual(['sh1', 'sh2']);
    });

    test('should support complex boolean queries', async () => {
        queryEngine.clean();
        mappingsManager.mappings['category'] = { type: 'keyword' };
        mappingsManager.mappings['price'] = { type: 'float' };
        mappingsManager._compileValidator();
        queryEngine.add({ id: 'cb1', name: 'red apple', category: 'fruit', price: 1.5 });
        queryEngine.add({ id: 'cb2', name: 'red car', category: 'vehicle', price: 25000 });
        queryEngine.add({ id: 'cb3', name: 'green apple', category: 'fruit', price: 2.0 });
        const results = queryEngine.search({
            bool: {
                must: [
                    { match: { field: 'name', value: 'red' } },
                    { term: { field: 'category', value: 'fruit' } }
                ],
                must_not: [
                    { range: { field: 'price', gte: 2.0 } }
                ]
            }
        });
        expect(results.hits.length).toBe(1);
        expect(results.hits[0].id).toBe('cb1');

        await queryEngine.clean();
    });

    test('should handle empty should clauses gracefully', () => {
        queryEngine.add({ id: 'es1', name: 'test' });
        const results = queryEngine.search({
            bool: {
                should: []
            }
        });
        expect(results.hits.length).toBe(0);
    });

    test('should support multiple field searches in single query', () => {
        mappingsManager.mappings['description'] = { type: 'text' };
        mappingsManager._compileValidator();
        queryEngine.add({ id: 'mf1', name: 'product1', description: 'great product' });
        queryEngine.add({ id: 'mf2', name: 'product2', description: 'amazing item' });

        // Test each field separately first
        const nameResults = queryEngine.search({
            bool: { must: [{ match: { field: 'name', value: 'product1' } }] }
        });
        const descResults = queryEngine.search({
            bool: { must: [{ match: { field: 'description', value: 'amazing' } }] }
        });

        const results = queryEngine.search({
            bool: {
                should: [
                    { match: { field: 'name', value: 'product1' } },
                    { match: { field: 'description', value: 'amazing' } }
                ]
            }
        });

        expect(results.hits.length).toBe(2);
        const ids = results.hits.map(h => h.id).sort();
        expect(ids).toEqual(['mf1', 'mf2']);
    });

    test('should handle special characters and punctuation correctly', () => {
        queryEngine.clean();
        queryEngine.add({ id: 'sc1', name: "Don't worry, be happy!" });
        queryEngine.add({ id: 'sc2', name: 'The cat\'s toy is here.' });
        queryEngine.add({ id: 'sc3', name: 'Multiple...dots...here' });
        queryEngine.add({ id: 'sc4', name: 'Hyphenated-word test' });

        // Debug: Check what tokens are indexed

        // Test apostrophe handling - search for "don" (what was indexed from "Don't")
        const apostropheResults = queryEngine.search('don');

        expect(apostropheResults.hits.length).toBe(1);
        expect(apostropheResults.hits[0].id).toBe('sc1');

        // Test possessive handling - search for "cat" (what was indexed from "cat's")
        const possessiveResults = queryEngine.search('cat');

        expect(possessiveResults.hits.length).toBe(1);
        expect(possessiveResults.hits[0].id).toBe('sc2');

        // Test punctuation removal - search for "happy" (what was indexed from "happy!")
        const punctuationResults = queryEngine.search('happy');

        expect(punctuationResults.hits.length).toBe(1);
        expect(punctuationResults.hits[0].id).toBe('sc1');

        // Test hyphen handling - search for "hyphenated" (what was indexed from "Hyphenated-word")
        const hyphenResults = queryEngine.search('hyphenated');

        expect(hyphenResults.hits.length).toBe(1);
        expect(hyphenResults.hits[0].id).toBe('sc4');
    });

    test('should handle email addresses correctly', () => {
        queryEngine.clean();
        queryEngine.add({ id: 'em1', name: 'John Doe', email: 'john.doe@example.com' });
        queryEngine.add({ id: 'em2', name: 'Jane Smith', email: 'jane.smith@company.org' });
        queryEngine.add({ id: 'em3', name: 'Bob Wilson', email: 'bob+tag@test.co.uk' });

        // Debug: Check what tokens are indexed

        // Test direct field search first
        const directEmailResults = queryEngine.search({
            bool: { must: [{ match: { field: 'email', value: 'example' } }] }
        });

        // Test searching by email domain
        const domainResults = queryEngine.search('example');

        expect(domainResults.hits.length).toBe(1);
        expect(domainResults.hits[0].id).toBe('em1');

        // Test searching by email local part
        const localResults = queryEngine.search('jane');

        expect(localResults.hits.length).toBe(1);
        expect(localResults.hits[0].id).toBe('em2');

        // Test searching by company name
        const companyResults = queryEngine.search('company');

        expect(companyResults.hits.length).toBe(1);
        expect(companyResults.hits[0].id).toBe('em2');
    });

    test('should handle URLs correctly', () => {
        queryEngine.clean();
        queryEngine.add({ id: 'url1', name: 'Homepage', url: 'https://example.com' });
        queryEngine.add({ id: 'url2', name: 'API Docs', url: 'https://api.example.com/docs' });
        queryEngine.add({ id: 'url3', name: 'Blog', url: 'https://blog.company.org/posts/123' });

        // Test searching by domain
        const domainResults = queryEngine.search('example');
        expect(domainResults.hits.length).toBe(2);
        const domainIds = domainResults.hits.map(h => h.id).sort();
        expect(domainIds).toEqual(['url1', 'url2']);

        // Test searching by path segment
        const pathResults = queryEngine.search('docs');
        expect(pathResults.hits.length).toBe(1);
        expect(pathResults.hits[0].id).toBe('url2');

        // Test searching by subdomain
        const subdomainResults = queryEngine.search('api');
        expect(subdomainResults.hits.length).toBe(1);
        expect(subdomainResults.hits[0].id).toBe('url2');
    });

    test('should handle phone numbers correctly', () => {
        queryEngine.clean();
        queryEngine.add({ id: 'ph1', name: 'John', phone: '123-456-7890' });
        queryEngine.add({ id: 'ph2', name: 'Jane', phone: '(555) 123-4567' });
        queryEngine.add({ id: 'ph3', name: 'Bob', phone: '+1-555-987-6543' });


        // Test searching by area code
        const areaCodeResults = queryEngine.search('123');


        expect(areaCodeResults.hits.length).toBe(2);
        const areaCodeIds = areaCodeResults.hits.map(h => h.id).sort();
        expect(areaCodeIds).toEqual(['ph1', 'ph2']);

        // Test searching by full number (digits only)
        console.log('Search query tokens for 1234567890:', tokenizer.tokenize('1234567890', 'standard'));
        const fullNumberResults = queryEngine.search('1234567890');

        expect(fullNumberResults.hits.length).toBe(1);
        expect(fullNumberResults.hits[0].id).toBe('ph1');
    });

    test('should handle mixed content with special characters', () => {
        queryEngine.clean();
        queryEngine.add({
            id: 'mix1',
            name: 'Contact Info',
            email: 'user@example.com',
            phone: '555-123-4567',
            url: 'https://example.com/profile'
        });

        // Test searching across multiple fields with special characters
        const results = queryEngine.search('example');
        expect(results.hits.length).toBe(1);
        expect(results.hits[0].id).toBe('mix1');

        // Test searching by phone area code
        const phoneResults = queryEngine.search('555');
        expect(phoneResults.hits.length).toBe(1);
        expect(phoneResults.hits[0].id).toBe('mix1');
    });

    test('should support pagination', () => {
        queryEngine.clean();
        // Add multiple documents
        for (let i = 1; i <= 15; i++) {
            queryEngine.add({ id: `page${i}`, name: `Document ${i}` });
        }

        // Test first page (default size 10)
        const firstPage = queryEngine.search('Document', { from: 0, size: 5 });
        expect(firstPage.hits.length).toBe(5);
        expect(firstPage.total).toBe(15);
        expect(firstPage.from).toBe(0);
        expect(firstPage.size).toBe(5);
        expect(firstPage.hits[0].id).toBe('page1');
        expect(firstPage.hits[4].id).toBe('page5');

        // Test second page
        const secondPage = queryEngine.search('Document', { from: 5, size: 5 });
        expect(secondPage.hits.length).toBe(5);
        expect(secondPage.from).toBe(5);
        expect(secondPage.size).toBe(5);
        expect(secondPage.hits[0].id).toBe('page6');
        expect(secondPage.hits[4].id).toBe('page10');

        // Test third page (partial)
        const thirdPage = queryEngine.search('Document', { from: 10, size: 10 });
        expect(thirdPage.hits.length).toBe(5);
        expect(thirdPage.from).toBe(10);
        expect(thirdPage.size).toBe(10);
        expect(thirdPage.hits[0].id).toBe('page11');
        expect(thirdPage.hits[4].id).toBe('page15');

        // Test out of bounds
        const outOfBounds = queryEngine.search('Document', { from: 20, size: 10 });
        expect(outOfBounds.hits.length).toBe(0);
        expect(outOfBounds.from).toBe(20);
        expect(outOfBounds.size).toBe(10);
    });

    test('should return all documents when no query is provided', () => {
        // Clear engine first to ensure clean state
        queryEngine.clean();

        // Add some documents
        queryEngine.add({ id: 'doc1', name: 'First Document' });
        queryEngine.add({ id: 'doc2', name: 'Second Document' });
        queryEngine.add({ id: 'doc3', name: 'Third Document' });

        // Verify we have exactly 3 documents
        expect(queryEngine.totalDocs).toBe(3);

        // Test with null query
        const nullResults = queryEngine.search(null);
        expect(nullResults.hits.length).toBe(3);
        expect(nullResults.total).toBe(3);
        expect(nullResults.from).toBe(0);
        expect(nullResults.size).toBe(10);

        // Test with empty object query
        const emptyResults = queryEngine.search({});
        expect(emptyResults.hits.length).toBe(3);
        expect(emptyResults.total).toBe(3);

        // Test with undefined query
        const undefinedResults = queryEngine.search(undefined);
        expect(undefinedResults.hits.length).toBe(3);
        expect(undefinedResults.total).toBe(3);

        // Test pagination with no query
        const paginatedResults = queryEngine.search(null, { from: 1, size: 2 });
        expect(paginatedResults.hits.length).toBe(2);
        expect(paginatedResults.total).toBe(3);
        expect(paginatedResults.from).toBe(1);
        expect(paginatedResults.size).toBe(2);
    });

    test('should support enhanced wildcard queries', () => {
        queryEngine.clean();
        queryEngine.add({ id: 'w1', name: 'apple' });
        queryEngine.add({ id: 'w2', name: 'application' });
        queryEngine.add({ id: 'w3', name: 'applet' });
        queryEngine.add({ id: 'w4', name: 'banana' });
        queryEngine.add({ id: 'w5', name: 'orange' });
        queryEngine.add({ id: 'w6', name: 'grape' });

        // Test prefix wildcard (*)
        const prefixResults = queryEngine.search({
            bool: { must: [{ wildcard: { field: 'name', value: 'app*' } }] }
        });
        expect(prefixResults.hits.length).toBe(3);
        const prefixIds = prefixResults.hits.map(h => h.id).sort();
        expect(prefixIds).toEqual(['w1', 'w2', 'w3']);

        // Test suffix wildcard (*)
        const suffixResults = queryEngine.search({
            bool: { must: [{ wildcard: { field: 'name', value: '*e' } }] }
        });
        expect(suffixResults.hits.length).toBe(3);
        const suffixIds = suffixResults.hits.map(h => h.id).sort();
        expect(suffixIds).toEqual(['w1', 'w5', 'w6']);

        // Test single character wildcard (?)
        const singleCharResults = queryEngine.search({
            bool: { must: [{ wildcard: { field: 'name', value: 'gra?e' } }] }
        });
        expect(singleCharResults.hits.length).toBe(1);
        expect(singleCharResults.hits[0].id).toBe('w6');

        // Test middle wildcard (*)
        const middleResults = queryEngine.search({
            bool: { must: [{ wildcard: { field: 'name', value: 'app*on' } }] }
        });
        expect(middleResults.hits.length).toBe(1);
        expect(middleResults.hits[0].id).toBe('w2');

        // Test multiple wildcards
        const multiResults = queryEngine.search({
            bool: { must: [{ wildcard: { field: 'name', value: 'a*e' } }] }
        });
        expect(multiResults.hits.length).toBe(1);
        const multiIds = multiResults.hits.map(h => h.id).sort();
        expect(multiIds).toEqual(['w1']);

        // Test case insensitive wildcards
        const caseResults = queryEngine.search({
            bool: { must: [{ wildcard: { field: 'name', value: 'APP*' } }] }
        });
        expect(caseResults.hits.length).toBe(3);
        const caseIds = caseResults.hits.map(h => h.id).sort();
        expect(caseIds).toEqual(['w1', 'w2', 'w3']);

        // Test empty pattern
        const emptyResults = queryEngine.search({
            bool: { must: [{ wildcard: { field: 'name', value: '' } }] }
        });
        expect(emptyResults.hits.length).toBe(0);

        // Test pattern with special regex characters
        queryEngine.add({ id: 'w7', name: 'test.com' });
        queryEngine.add({ id: 'w8', name: 'test+plus' });

        const specialResults = queryEngine.search({
            bool: { must: [{ wildcard: { field: 'name', value: 'test.*' } }] }
        });
        expect(specialResults.hits.length).toBe(1);
        expect(specialResults.hits[0].id).toBe('w7');
    });

    test('should handle wildcard queries with special characters', () => {
        queryEngine.clean();
        queryEngine.add({ id: 'sc1', name: 'user@example.com' });
        queryEngine.add({ id: 'sc2', name: 'test+tag@domain.org' });
        queryEngine.add({ id: 'sc3', name: 'simple-text' });
        queryEngine.add({ id: 'sc4', name: 'file.txt' });

        // Test email pattern with @
        const emailResults = queryEngine.search({
            bool: { must: [{ wildcard: { field: 'name', value: '*@*' } }] }
        });
        expect(emailResults.hits.length).toBe(2);
        const emailIds = emailResults.hits.map(h => h.id).sort();
        expect(emailIds).toEqual(['sc1', 'sc2']);

        // Test file extension pattern
        const fileResults = queryEngine.search({
            bool: { must: [{ wildcard: { field: 'name', value: '*.txt' } }] }
        });
        expect(fileResults.hits.length).toBe(1);
        expect(fileResults.hits[0].id).toBe('sc4');

        // Test pattern with plus sign
        const plusResults = queryEngine.search({
            bool: { must: [{ wildcard: { field: 'name', value: '*+*' } }] }
        });
        expect(plusResults.hits.length).toBe(1);
        expect(plusResults.hits[0].id).toBe('sc2');
    });
}); 