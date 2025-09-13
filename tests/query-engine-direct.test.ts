/**
 * Test file for direct QueryEngine testing
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { QueryEngine } from '../src/domain/QueryEngine';
import { ShardedInvertedIndex } from '../src/domain/ShardedInvertedIndex';
import { MappingsManager } from '../src/domain/MappingsManager';
import { Tokenizer } from '../src/domain/Tokenizer';
import { StopwordsManager } from '../src/infrastructure/StopwordsManager';
import { SynonymEngine } from '../src/domain/SynonymEngine';

describe('QueryEngine Direct Tests', () => {
    let queryEngine: QueryEngine;
    let invertedIndex: ShardedInvertedIndex;
    let mappingsManager: MappingsManager;
    let tokenizer: Tokenizer;
    let stopwordsManager: StopwordsManager;
    let synonymEngine: SynonymEngine;
    let documents: Map<string, any>;

    beforeEach(() => {
        invertedIndex = new ShardedInvertedIndex();
        mappingsManager = new MappingsManager();
        stopwordsManager = new StopwordsManager();
        tokenizer = new Tokenizer(stopwordsManager, {
            stemming: true,
            stemmingOptions: { language: 'en', aggressive: false }
        });
        synonymEngine = new SynonymEngine();
        documents = new Map();

        queryEngine = new QueryEngine(invertedIndex, synonymEngine, tokenizer, documents, mappingsManager);
    });

    it('should create QueryEngine with all required dependencies', () => {
        expect(queryEngine).toBeDefined();
        expect((queryEngine as any).documents).toBe(documents);
        expect((queryEngine as any).invertedIndex).toBe(invertedIndex);
        expect((queryEngine as any).tokenizer).toBe(tokenizer);
        expect((queryEngine as any).mappingsManager).toBe(mappingsManager);
        expect((queryEngine as any).synonymEngine).toBe(synonymEngine);
    });

    it('should add documents to documents store', () => {
        const testDoc = { id: '1', name: 'Rick Sanchez', status: 'Alive', species: 'Human' };
        documents.set('1', testDoc);

        expect(documents.size).toBe(1);
        expect(documents.has('1')).toBe(true);
        expect(documents.get('1')).toEqual(testDoc);
    });

    it('should search documents with match_all query', () => {
        // Add test documents
        const testDocs = [
            { id: '1', name: 'Rick Sanchez', status: 'Alive', species: 'Human' },
            { id: '2', name: 'Morty Smith', status: 'Alive', species: 'Human' },
            { id: '3', name: 'Summer Smith', status: 'Alive', species: 'Human' }
        ];

        for (const doc of testDocs) {
            documents.set(doc.id, doc);
        }

        // Test match_all query
        const result = queryEngine.search({ match_all: {} }, { size: 10 });

        console.log('QueryEngine match_all result:', {
            hits: result.hits?.length || 0,
            total: result.total || 0,
            from: result.from || 0,
            size: result.size || 0
        });

        expect(result.hits).toBeDefined();
        expect(result.total).toBe(3);
        expect(result.hits.length).toBe(3);
    });

    it('should search documents with string query', () => {
        // Add test documents
        const testDocs = [
            { id: '1', name: 'Rick Sanchez', status: 'Alive', species: 'Human' },
            { id: '2', name: 'Morty Smith', status: 'Alive', species: 'Human' },
            { id: '3', name: 'Summer Smith', status: 'Alive', species: 'Human' }
        ];

        for (const doc of testDocs) {
            documents.set(doc.id, doc);
        }

        // Test string query
        const result = queryEngine.search('Rick', { size: 10 });

        console.log('QueryEngine string query result:', {
            hits: result.hits?.length || 0,
            total: result.total || 0,
            from: result.from || 0,
            size: result.size || 0
        });

        expect(result.hits).toBeDefined();
        expect(result.total).toBeGreaterThan(0);
        expect(result.hits.length).toBeGreaterThan(0);
    });

    it('should return raw Set when __rawSet flag is used', () => {
        // Add test documents
        const testDocs = [
            { id: '1', name: 'Rick Sanchez', status: 'Alive', species: 'Human' },
            { id: '2', name: 'Morty Smith', status: 'Alive', species: 'Human' }
        ];

        for (const doc of testDocs) {
            documents.set(doc.id, doc);
        }

        // Test with __rawSet flag
        const rawSetResult = queryEngine.search({ match_all: {} }, { __rawSet: true });

        console.log('QueryEngine rawSet result:', rawSetResult instanceof Set ? rawSetResult.size : 'Not a Set');

        expect(rawSetResult instanceof Set).toBe(true);
        expect(rawSetResult.size).toBe(2);
        expect(Array.from(rawSetResult)).toEqual(['1', '2']);
    });

    it('should debug QueryEngine internal state', () => {
        // Add test documents
        const testDocs = [
            { id: '1', name: 'Rick Sanchez', status: 'Alive', species: 'Human' },
            { id: '2', name: 'Morty Smith', status: 'Alive', species: 'Human' }
        ];

        for (const doc of testDocs) {
            documents.set(doc.id, doc);
        }

        // Debug internal state
        console.log('QueryEngine documents count:', documents.size);
        console.log('QueryEngine documents keys:', Array.from(documents.keys()));
        console.log('QueryEngine invertedIndex:', (queryEngine as any).invertedIndex);
        console.log('QueryEngine tokenizer:', (queryEngine as any).tokenizer);
        console.log('QueryEngine mappingsManager:', (queryEngine as any).mappingsManager);

        expect(documents.size).toBe(2);
    });

    it('should test naive scan fallback', () => {
        // Add test documents
        const testDocs = [
            { id: '1', name: 'Rick Sanchez', status: 'Alive', species: 'Human' },
            { id: '2', name: 'Morty Smith', status: 'Alive', species: 'Human' }
        ];

        for (const doc of testDocs) {
            documents.set(doc.id, doc);
        }

        // Test naive scan directly
        const naiveScanResult = (queryEngine as any)._naiveScan({ match_all: {} }, {});
        console.log('QueryEngine naive scan result:', naiveScanResult instanceof Set ? naiveScanResult.size : 'Not a Set');

        expect(naiveScanResult instanceof Set).toBe(true);
        expect(naiveScanResult.size).toBe(2);
    });
});

