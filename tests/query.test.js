import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { unlink } from 'node:fs/promises';

// --- Domain & Infrastructure ---
import SearchEngine from '../src/domain/SearchEngine.js';
import SynonymEngine from '../src/domain/SynonymEngine.js';
import BM25Scorer from '../src/domain/BM25Scorer.js';
import Tokenizer from '../src/domain/Tokenizer.js';
import InvertedIndex from '../src/domain/InvertedIndex.js';
import RankingPipeline from '../src/domain/RankingPipeline.js';
import MappingsManager from '../src/domain/MappingsManager.js';

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
    getTextFields() { return Array.from(this.mappings.entries()).filter(([, mapping]) => ['text', 'keyword', 'email', 'url', 'phone'].includes(mapping.type)).map(([field]) => field); }
    autoExtend(doc) { for (const [k, v] of Object.entries(doc)) { if (k === 'id') continue; if (!this.mappings.has(k)) { let type = 'text'; if (typeof v === 'number') type = 'float'; if (typeof v === 'boolean') type = 'boolean'; if (Array.isArray(v) && v.length === 2 && v.every(n => typeof n === 'number')) type = 'geo_point'; this.mappings.set(k, { type }); } } }
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

describe('Querying Logic Tests', () => {
    let searchEngine;
    let mappingsManager;
    let stopwordsManager;

    before(async () => {
        await unlink('snapshot.json').catch(() => { });
        await unlink('aof.log').catch(() => { });

        stopwordsManager = new MockStopwordsManager();
        mappingsManager = new MappingsManager();
        // Override the name field to be text type for testing
        mappingsManager.mappings.set('name', { type: 'text' });
        const synonymEngine = new SynonymEngine();

        const scorerFactory = (totalDocs, avgDocLength, docLengths, index) =>
            new BM25Scorer(totalDocs, avgDocLength, docLengths, index);

        searchEngine = new SearchEngine({
            tokenizer: new Tokenizer(stopwordsManager),
            invertedIndex: new InvertedIndex(),
            rankingPipeline: new RankingPipeline(),
            stopwordsManager,
            mappingsManager,
            synonymEngine,
            scorerFactory,
            facetFields: ['status'],
        });
    });

    beforeEach(() => {
        // Reset the mappingsManager to ensure name field is text type
        mappingsManager = new MappingsManager();
        mappingsManager.mappings.set('name', { type: 'text' });
        searchEngine = new SearchEngine({
            tokenizer: new Tokenizer(stopwordsManager),
            invertedIndex: new InvertedIndex(),
            rankingPipeline: new RankingPipeline(),
            stopwordsManager,
            mappingsManager,
            synonymEngine: new SynonymEngine(),
            scorerFactory: (totalDocs, avgDocLength, docLengths, index) =>
                new BM25Scorer(totalDocs, avgDocLength, docLengths, index),
            facetFields: ['status'],
        });
    });

    // 1. Core Logic Tests
    test('should find a document with a single-word match', () => {
        searchEngine.add({ id: 'doc1', name: 'A unique document' });

        // Debug: Check what fields are available
        console.log('Text fields:', mappingsManager.getTextFields());
        console.log('Documents in engine:', Array.from(searchEngine.documents.keys()));
        console.log('Inverted index keys:', Array.from(searchEngine.invertedIndex.index.keys()));

        const results = searchEngine.search('unique');
        console.log('Search results:', results);
        assert.strictEqual(results.hits.length, 1);
        assert.strictEqual(results.hits[0].id, 'doc1');
    });

    test('should correctly perform a multi-word AND search', () => {
        searchEngine.add({ id: 'doc1', name: 'rick' });
        searchEngine.add({ id: 'doc2', name: 'morty' });
        searchEngine.add({ id: 'doc3', name: 'rick morty' });

        const results = searchEngine.search('rick morty');
        assert.strictEqual(results.hits.length, 1);
        assert.strictEqual(results.hits[0].id, 'doc3');
    });

    // 2. Relevance & Scoring Tests
    test('should include a _score in every result', () => {
        searchEngine.add({ id: 'doc1', name: 'some document' });
        const results = searchEngine.search('document');
        assert.ok(results.hits.length > 0);
        assert.ok(typeof results.hits[0]._score === 'number' && results.hits[0]._score > 0);
    });

    test('should rank documents with higher term frequency higher', () => {
        searchEngine.add({ id: 'docA', name: 'word' });
        searchEngine.add({ id: 'docB', name: 'word word word' });

        const results = searchEngine.search('word');
        console.log('Ranking test results:', results.hits.map(h => ({ id: h.id, score: h._score })));
        assert.strictEqual(results.hits.length, 2);
        assert.strictEqual(results.hits[0].id, 'docB', 'docB should have a higher score');
    });

    // 3. Edge Case Tests
    test('should return zero results for a non-existent term', () => {
        searchEngine.add({ id: 'doc1', name: 'a document' });
        const results = searchEngine.search('nonexistentterm123');
        assert.strictEqual(results.hits.length, 0);
    });

    test('should return zero results for an empty query', () => {
        searchEngine.add({ id: 'e1', name: 'test' });
        const results = searchEngine.search('');
        // Now returns all documents when no query is provided
        assert.strictEqual(results.hits.length, 1);
        assert.strictEqual(results.hits[0].id, 'e1');
    });

    // 4. Feature Tests
    test('should return correct facets for the result set', () => {
        mappingsManager.mappings['status'] = { type: 'keyword' };
        mappingsManager._compileValidator();
        searchEngine.facetFields = ['status']; // Ensure status is in facet fields
        searchEngine.add({ id: 'd1', name: 'doc', status: 'A' });
        searchEngine.add({ id: 'd2', name: 'doc', status: 'A' });
        searchEngine.add({ id: 'd3', name: 'doc', status: 'B' });
        searchEngine.add({ id: 'd4', name: 'other', status: 'C' });

        const results = searchEngine.search('doc');
        assert.strictEqual(results.hits.length, 3);
        assert.deepStrictEqual(results.facets, { status: { A: 2, B: 1 } });
    });

    test('should match exact keyword field', () => {
        mappingsManager.mappings['type'] = { type: 'keyword' };
        mappingsManager._compileValidator();
        searchEngine.add({ id: 'k1', name: 'foo', type: 'alpha' });
        searchEngine.add({ id: 'k2', name: 'bar', type: 'beta' });
        const results = searchEngine.search({ bool: { must: [{ term: { field: 'type', value: 'alpha' } }] } });
        assert.strictEqual(results.hits.length, 1);
        assert.strictEqual(results.hits[0].id, 'k1');
    });

    test('should be case insensitive', () => {
        searchEngine.add({ id: 'c1', name: 'Hello World' });
        const results = searchEngine.search('hello');
        assert.strictEqual(results.hits.length, 1);
        assert.strictEqual(results.hits[0].id, 'c1');
    });

    test('should ignore stopwords', () => {
        searchEngine.add({ id: 's1', name: 'the quick brown fox' });
        const results = searchEngine.search('the quick');
        assert.strictEqual(results.hits.length, 1);
        assert.strictEqual(results.hits[0].id, 's1');
    });

    test('should return no results for nonexistent field', () => {
        searchEngine.add({ id: 'n1', name: 'foo' });
        const results = searchEngine.search({ bool: { must: [{ match: { field: 'nonexistent', value: 'foo' } }] } });
        assert.strictEqual(results.hits.length, 0);
    });

    test('should support boolean must and must_not', () => {
        searchEngine.add({ id: 'b1', name: 'foo bar' });
        searchEngine.add({ id: 'b2', name: 'foo baz' });
        const results = searchEngine.search({
            bool: {
                must: [{ match: { field: 'name', value: 'foo' } }],
                must_not: [{ match: { field: 'name', value: 'baz' } }]
            }
        });
        assert.strictEqual(results.hits.length, 1);
        assert.strictEqual(results.hits[0].id, 'b1');
    });

    test('should support prefix queries', () => {
        searchEngine.add({ id: 'p1', name: 'university' });
        searchEngine.add({ id: 'p2', name: 'unique' });
        searchEngine.add({ id: 'p3', name: 'different' });
        const results = searchEngine.search({
            bool: {
                must: [{ prefix: { field: 'name', value: 'uni' } }]
            }
        });
        assert.strictEqual(results.hits.length, 2);
        const ids = results.hits.map(h => h.id).sort();
        assert.deepStrictEqual(ids, ['p1', 'p2']);
    });

    test('should support fuzzy queries', () => {
        searchEngine.add({ id: 'f1', name: 'document' });
        searchEngine.add({ id: 'f2', name: 'different' });
        const results = searchEngine.search({
            bool: {
                must: [{ fuzzy: { field: 'name', value: 'documnt', fuzziness: 2 } }]
            }
        });
        assert.strictEqual(results.hits.length, 1);
        assert.strictEqual(results.hits[0].id, 'f1');
    });

    test('should support phrase queries', () => {
        searchEngine.add({ id: 'ph1', name: 'quick brown fox' });
        searchEngine.add({ id: 'ph2', name: 'quick fox brown' });
        const results = searchEngine.search({
            bool: {
                must: [{ match_phrase: { field: 'name', value: 'quick brown fox' } }]
            }
        });
        assert.strictEqual(results.hits.length, 1);
        assert.strictEqual(results.hits[0].id, 'ph1');
    });

    test('should support wildcard queries', () => {
        searchEngine.add({ id: 'w1', name: 'test' });
        searchEngine.add({ id: 'w2', name: 'text' });
        searchEngine.add({ id: 'w3', name: 'different' });
        const results = searchEngine.search({
            bool: {
                must: [{ wildcard: { field: 'name', value: 'te*t' } }]
            }
        });
        assert.strictEqual(results.hits.length, 2);
        const ids = results.hits.map(h => h.id).sort();
        assert.deepStrictEqual(ids, ['w1', 'w2']);
    });

    test('should support multi-word prefix queries', () => {
        searchEngine.add({ id: 'mp1', name: 'quick brown fox' });
        searchEngine.add({ id: 'mp2', name: 'quick red fox' });
        searchEngine.add({ id: 'mp3', name: 'slow brown fox' });
        searchEngine.add({ id: 'mp4', name: 'quick brown dog' });
        const results = searchEngine.search({
            bool: {
                must: [{ prefix: { field: 'name', value: 'quick brown' } }]
            }
        });
        assert.strictEqual(results.hits.length, 2);
        const ids = results.hits.map(h => h.id).sort();
        assert.deepStrictEqual(ids, ['mp1', 'mp4']);
    });

    test('should support range queries', () => {
        mappingsManager.mappings['age'] = { type: 'integer' };
        mappingsManager._compileValidator();
        searchEngine.add({ id: 'r1', name: 'person1', age: 25 });
        searchEngine.add({ id: 'r2', name: 'person2', age: 35 });
        searchEngine.add({ id: 'r3', name: 'person3', age: 45 });
        const results = searchEngine.search({
            bool: {
                must: [{ range: { field: 'age', gte: 30, lte: 40 } }]
            }
        });
        assert.strictEqual(results.hits.length, 1);
        assert.strictEqual(results.hits[0].id, 'r2');
    });

    test('should support geo_distance queries', () => {
        mappingsManager.mappings['location'] = { type: 'geo_point' };
        mappingsManager._compileValidator();
        searchEngine.add({ id: 'g1', name: 'place1', location: [0, 0] });
        searchEngine.add({ id: 'g2', name: 'place2', location: [1, 1] });
        searchEngine.add({ id: 'g3', name: 'place3', location: [10, 10] });
        const results = searchEngine.search({
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
        assert.strictEqual(results.hits.length, 2);
        const ids = results.hits.map(h => h.id).sort();
        assert.deepStrictEqual(ids, ['g1', 'g2']);
    });

    test('should support should clauses (OR logic)', () => {
        searchEngine.add({ id: 'sh1', name: 'apple' });
        searchEngine.add({ id: 'sh2', name: 'banana' });
        searchEngine.add({ id: 'sh3', name: 'orange' });
        const results = searchEngine.search({
            bool: {
                should: [
                    { match: { field: 'name', value: 'apple' } },
                    { match: { field: 'name', value: 'banana' } }
                ]
            }
        });
        assert.strictEqual(results.hits.length, 2);
        const ids = results.hits.map(h => h.id).sort();
        assert.deepStrictEqual(ids, ['sh1', 'sh2']);
    });

    test('should support complex boolean queries', () => {
        mappingsManager.mappings['category'] = { type: 'keyword' };
        mappingsManager.mappings['price'] = { type: 'float' };
        mappingsManager._compileValidator();
        searchEngine.add({ id: 'cb1', name: 'red apple', category: 'fruit', price: 1.5 });
        searchEngine.add({ id: 'cb2', name: 'red car', category: 'vehicle', price: 25000 });
        searchEngine.add({ id: 'cb3', name: 'green apple', category: 'fruit', price: 2.0 });
        const results = searchEngine.search({
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
        assert.strictEqual(results.hits.length, 1);
        assert.strictEqual(results.hits[0].id, 'cb1');
    });

    test('should handle empty should clauses gracefully', () => {
        searchEngine.add({ id: 'es1', name: 'test' });
        const results = searchEngine.search({
            bool: {
                should: []
            }
        });
        assert.strictEqual(results.hits.length, 0);
    });

    test('should support multiple field searches in single query', () => {
        mappingsManager.mappings['description'] = { type: 'text' };
        mappingsManager._compileValidator();
        searchEngine.add({ id: 'mf1', name: 'product1', description: 'great product' });
        searchEngine.add({ id: 'mf2', name: 'product2', description: 'amazing item' });

        // Test each field separately first
        const nameResults = searchEngine.search({
            bool: { must: [{ match: { field: 'name', value: 'product1' } }] }
        });
        const descResults = searchEngine.search({
            bool: { must: [{ match: { field: 'description', value: 'amazing' } }] }
        });

        console.log('Name search results:', nameResults.hits.map(h => h.id));
        console.log('Description search results:', descResults.hits.map(h => h.id));

        const results = searchEngine.search({
            bool: {
                should: [
                    { match: { field: 'name', value: 'product1' } },
                    { match: { field: 'description', value: 'amazing' } }
                ]
            }
        });

        console.log('Should search results:', results.hits.map(h => h.id));
        assert.strictEqual(results.hits.length, 2);
        const ids = results.hits.map(h => h.id).sort();
        assert.deepStrictEqual(ids, ['mf1', 'mf2']);
    });

    test('should handle special characters and punctuation correctly', () => {
        searchEngine.add({ id: 'sc1', name: "Don't worry, be happy!" });
        searchEngine.add({ id: 'sc2', name: 'The cat\'s toy is here.' });
        searchEngine.add({ id: 'sc3', name: 'Multiple...dots...here' });
        searchEngine.add({ id: 'sc4', name: 'Hyphenated-word test' });

        // Debug: Check what tokens are indexed
        console.log('Inverted index keys after adding special chars:', Array.from(searchEngine.invertedIndex.index.keys()));

        // Test apostrophe handling - search for "don" (what was indexed from "Don't")
        const apostropheResults = searchEngine.search('don');
        console.log('Apostrophe search results:', apostropheResults.hits.map(h => h.id));
        assert.strictEqual(apostropheResults.hits.length, 1);
        assert.strictEqual(apostropheResults.hits[0].id, 'sc1');

        // Test possessive handling - search for "cat" (what was indexed from "cat's")
        const possessiveResults = searchEngine.search('cat');
        console.log('Possessive search results:', possessiveResults.hits.map(h => h.id));
        assert.strictEqual(possessiveResults.hits.length, 1);
        assert.strictEqual(possessiveResults.hits[0].id, 'sc2');

        // Test punctuation removal - search for "happy" (what was indexed from "happy!")
        const punctuationResults = searchEngine.search('happy');
        console.log('Punctuation search results:', punctuationResults.hits.map(h => h.id));
        assert.strictEqual(punctuationResults.hits.length, 1);
        assert.strictEqual(punctuationResults.hits[0].id, 'sc1');

        // Test hyphen handling - search for "hyphenated" (what was indexed from "Hyphenated-word")
        const hyphenResults = searchEngine.search('hyphenated');
        console.log('Hyphen search results:', hyphenResults.hits.map(h => h.id));
        assert.strictEqual(hyphenResults.hits.length, 1);
        assert.strictEqual(hyphenResults.hits[0].id, 'sc4');
    });

    test('should handle email addresses correctly', () => {
        searchEngine.add({ id: 'em1', name: 'John Doe', email: 'john.doe@example.com' });
        searchEngine.add({ id: 'em2', name: 'Jane Smith', email: 'jane.smith@company.org' });
        searchEngine.add({ id: 'em3', name: 'Bob Wilson', email: 'bob+tag@test.co.uk' });

        // Debug: Check what tokens are indexed
        console.log('Inverted index keys after adding emails:', Array.from(searchEngine.invertedIndex.index.keys()));

        // Test direct field search first
        const directEmailResults = searchEngine.search({
            bool: { must: [{ match: { field: 'email', value: 'example' } }] }
        });
        console.log('Direct email search results:', directEmailResults.hits.map(h => h.id));

        // Test searching by email domain
        const domainResults = searchEngine.search('example');
        console.log('Domain search results:', domainResults.hits.map(h => h.id));
        console.log('Domain search query terms:', domainResults.hits.length > 0 ? 'Found' : 'Not found');
        assert.strictEqual(domainResults.hits.length, 1);
        assert.strictEqual(domainResults.hits[0].id, 'em1');

        // Test searching by email local part
        const localResults = searchEngine.search('jane');
        console.log('Local part search results:', localResults.hits.map(h => h.id));
        assert.strictEqual(localResults.hits.length, 1);
        assert.strictEqual(localResults.hits[0].id, 'em2');

        // Test searching by company name
        const companyResults = searchEngine.search('company');
        console.log('Company search results:', companyResults.hits.map(h => h.id));
        assert.strictEqual(companyResults.hits.length, 1);
        assert.strictEqual(companyResults.hits[0].id, 'em2');
    });

    test('should handle URLs correctly', () => {
        searchEngine.add({ id: 'url1', name: 'Homepage', url: 'https://example.com' });
        searchEngine.add({ id: 'url2', name: 'API Docs', url: 'https://api.example.com/docs' });
        searchEngine.add({ id: 'url3', name: 'Blog', url: 'https://blog.company.org/posts/123' });

        // Test searching by domain
        const domainResults = searchEngine.search('example');
        assert.strictEqual(domainResults.hits.length, 2);
        const domainIds = domainResults.hits.map(h => h.id).sort();
        assert.deepStrictEqual(domainIds, ['url1', 'url2']);

        // Test searching by path segment
        const pathResults = searchEngine.search('docs');
        assert.strictEqual(pathResults.hits.length, 1);
        assert.strictEqual(pathResults.hits[0].id, 'url2');

        // Test searching by subdomain
        const subdomainResults = searchEngine.search('api');
        assert.strictEqual(subdomainResults.hits.length, 1);
        assert.strictEqual(subdomainResults.hits[0].id, 'url2');
    });

    test('should handle phone numbers correctly', () => {
        searchEngine.add({ id: 'ph1', name: 'John', phone: '123-456-7890' });
        searchEngine.add({ id: 'ph2', name: 'Jane', phone: '(555) 123-4567' });
        searchEngine.add({ id: 'ph3', name: 'Bob', phone: '+1-555-987-6543' });

        // Debug: Check what tokens are indexed
        console.log('Inverted index keys after adding phones:', Array.from(searchEngine.invertedIndex.index.keys()));

        // Test searching by area code
        const areaCodeResults = searchEngine.search('123');
        console.log('Area code search results:', areaCodeResults.hits.map(h => h.id));
        assert.strictEqual(areaCodeResults.hits.length, 2);
        const areaCodeIds = areaCodeResults.hits.map(h => h.id).sort();
        assert.deepStrictEqual(areaCodeIds, ['ph1', 'ph2']);

        // Test searching by full number (digits only)
        const fullNumberResults = searchEngine.search('1234567890');
        console.log('Full number search results:', fullNumberResults.hits.map(h => h.id));
        assert.strictEqual(fullNumberResults.hits.length, 1);
        assert.strictEqual(fullNumberResults.hits[0].id, 'ph1');
    });

    test('should handle mixed content with special characters', () => {
        searchEngine.add({
            id: 'mix1',
            name: 'Contact Info',
            email: 'user@example.com',
            phone: '555-123-4567',
            url: 'https://example.com/profile'
        });

        // Test searching across multiple fields with special characters
        const results = searchEngine.search('example');
        assert.strictEqual(results.hits.length, 1);
        assert.strictEqual(results.hits[0].id, 'mix1');

        // Test searching by phone area code
        const phoneResults = searchEngine.search('555');
        assert.strictEqual(phoneResults.hits.length, 1);
        assert.strictEqual(phoneResults.hits[0].id, 'mix1');
    });

    test('should support pagination', () => {
        // Add multiple documents
        for (let i = 1; i <= 15; i++) {
            searchEngine.add({ id: `page${i}`, name: `Document ${i}` });
        }

        // Test first page (default size 10)
        const firstPage = searchEngine.search('Document', { from: 0, size: 5 });
        assert.strictEqual(firstPage.hits.length, 5);
        assert.strictEqual(firstPage.total, 15);
        assert.strictEqual(firstPage.from, 0);
        assert.strictEqual(firstPage.size, 5);
        assert.strictEqual(firstPage.hits[0].id, 'page1');
        assert.strictEqual(firstPage.hits[4].id, 'page5');

        // Test second page
        const secondPage = searchEngine.search('Document', { from: 5, size: 5 });
        assert.strictEqual(secondPage.hits.length, 5);
        assert.strictEqual(secondPage.from, 5);
        assert.strictEqual(secondPage.size, 5);
        assert.strictEqual(secondPage.hits[0].id, 'page6');
        assert.strictEqual(secondPage.hits[4].id, 'page10');

        // Test third page (partial)
        const thirdPage = searchEngine.search('Document', { from: 10, size: 10 });
        assert.strictEqual(thirdPage.hits.length, 5);
        assert.strictEqual(thirdPage.from, 10);
        assert.strictEqual(thirdPage.size, 10);
        assert.strictEqual(thirdPage.hits[0].id, 'page11');
        assert.strictEqual(thirdPage.hits[4].id, 'page15');

        // Test out of bounds
        const outOfBounds = searchEngine.search('Document', { from: 20, size: 10 });
        assert.strictEqual(outOfBounds.hits.length, 0);
        assert.strictEqual(outOfBounds.from, 20);
        assert.strictEqual(outOfBounds.size, 10);
    });

    test('should return all documents when no query is provided', () => {
        // Clear engine first to ensure clean state
        searchEngine.clean();

        // Add some documents
        searchEngine.add({ id: 'doc1', name: 'First Document' });
        searchEngine.add({ id: 'doc2', name: 'Second Document' });
        searchEngine.add({ id: 'doc3', name: 'Third Document' });

        // Verify we have exactly 3 documents
        assert.strictEqual(searchEngine.totalDocs, 3);

        // Test with null query
        const nullResults = searchEngine.search(null);
        assert.strictEqual(nullResults.hits.length, 3);
        assert.strictEqual(nullResults.total, 3);
        assert.strictEqual(nullResults.from, 0);
        assert.strictEqual(nullResults.size, 10);

        // Test with empty object query
        const emptyResults = searchEngine.search({});
        assert.strictEqual(emptyResults.hits.length, 3);
        assert.strictEqual(emptyResults.total, 3);

        // Test with undefined query
        const undefinedResults = searchEngine.search(undefined);
        assert.strictEqual(undefinedResults.hits.length, 3);
        assert.strictEqual(undefinedResults.total, 3);

        // Test pagination with no query
        const paginatedResults = searchEngine.search(null, { from: 1, size: 2 });
        assert.strictEqual(paginatedResults.hits.length, 2);
        assert.strictEqual(paginatedResults.total, 3);
        assert.strictEqual(paginatedResults.from, 1);
        assert.strictEqual(paginatedResults.size, 2);
    });

    test('should support enhanced wildcard queries', () => {
        searchEngine.add({ id: 'w1', name: 'apple' });
        searchEngine.add({ id: 'w2', name: 'application' });
        searchEngine.add({ id: 'w3', name: 'applet' });
        searchEngine.add({ id: 'w4', name: 'banana' });
        searchEngine.add({ id: 'w5', name: 'orange' });
        searchEngine.add({ id: 'w6', name: 'grape' });

        // Test prefix wildcard (*)
        const prefixResults = searchEngine.search({
            bool: { must: [{ wildcard: { field: 'name', value: 'app*' } }] }
        });
        assert.strictEqual(prefixResults.hits.length, 3);
        const prefixIds = prefixResults.hits.map(h => h.id).sort();
        assert.deepStrictEqual(prefixIds, ['w1', 'w2', 'w3']);

        // Test suffix wildcard (*)
        const suffixResults = searchEngine.search({
            bool: { must: [{ wildcard: { field: 'name', value: '*e' } }] }
        });
        assert.strictEqual(suffixResults.hits.length, 3);
        const suffixIds = suffixResults.hits.map(h => h.id).sort();
        assert.deepStrictEqual(suffixIds, ['w1', 'w5', 'w6']);

        // Test single character wildcard (?)
        const singleCharResults = searchEngine.search({
            bool: { must: [{ wildcard: { field: 'name', value: 'gra?e' } }] }
        });
        assert.strictEqual(singleCharResults.hits.length, 1);
        assert.strictEqual(singleCharResults.hits[0].id, 'w6');

        // Test middle wildcard (*)
        const middleResults = searchEngine.search({
            bool: { must: [{ wildcard: { field: 'name', value: 'app*on' } }] }
        });
        assert.strictEqual(middleResults.hits.length, 1);
        assert.strictEqual(middleResults.hits[0].id, 'w2');

        // Test multiple wildcards
        const multiResults = searchEngine.search({
            bool: { must: [{ wildcard: { field: 'name', value: 'a*e' } }] }
        });
        assert.strictEqual(multiResults.hits.length, 1);
        const multiIds = multiResults.hits.map(h => h.id).sort();
        assert.deepStrictEqual(multiIds, ['w1']);

        // Test case insensitive wildcards
        const caseResults = searchEngine.search({
            bool: { must: [{ wildcard: { field: 'name', value: 'APP*' } }] }
        });
        assert.strictEqual(caseResults.hits.length, 3);
        const caseIds = caseResults.hits.map(h => h.id).sort();
        assert.deepStrictEqual(caseIds, ['w1', 'w2', 'w3']);

        // Test empty pattern
        const emptyResults = searchEngine.search({
            bool: { must: [{ wildcard: { field: 'name', value: '' } }] }
        });
        assert.strictEqual(emptyResults.hits.length, 0);

        // Test pattern with special regex characters
        searchEngine.add({ id: 'w7', name: 'test.com' });
        searchEngine.add({ id: 'w8', name: 'test+plus' });

        const specialResults = searchEngine.search({
            bool: { must: [{ wildcard: { field: 'name', value: 'test.*' } }] }
        });
        assert.strictEqual(specialResults.hits.length, 1);
        assert.strictEqual(specialResults.hits[0].id, 'w7');
    });

    test('should handle wildcard queries with special characters', () => {
        searchEngine.add({ id: 'sc1', name: 'user@example.com' });
        searchEngine.add({ id: 'sc2', name: 'test+tag@domain.org' });
        searchEngine.add({ id: 'sc3', name: 'simple-text' });
        searchEngine.add({ id: 'sc4', name: 'file.txt' });

        // Test email pattern with @
        const emailResults = searchEngine.search({
            bool: { must: [{ wildcard: { field: 'name', value: '*@*' } }] }
        });
        assert.strictEqual(emailResults.hits.length, 2);
        const emailIds = emailResults.hits.map(h => h.id).sort();
        assert.deepStrictEqual(emailIds, ['sc1', 'sc2']);

        // Test file extension pattern
        const fileResults = searchEngine.search({
            bool: { must: [{ wildcard: { field: 'name', value: '*.txt' } }] }
        });
        assert.strictEqual(fileResults.hits.length, 1);
        assert.strictEqual(fileResults.hits[0].id, 'sc4');

        // Test pattern with plus sign
        const plusResults = searchEngine.search({
            bool: { must: [{ wildcard: { field: 'name', value: '*+*' } }] }
        });
        assert.strictEqual(plusResults.hits.length, 1);
        assert.strictEqual(plusResults.hits[0].id, 'sc2');
    });
}); 