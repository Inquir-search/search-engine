/**
 * Test QueryEngine integration in server context
 */

import { describe, it, expect } from 'vitest';
import { QueryEngine } from '../src/domain/QueryEngine';
import { ShardedInvertedIndex } from '../src/domain/ShardedInvertedIndex';
import { MappingsManager } from '../src/domain/MappingsManager';
import { Tokenizer } from '../src/domain/Tokenizer';
import { StopwordsManager } from '../src/infrastructure/StopwordsManager';
import { SynonymEngine } from '../src/domain/SynonymEngine';

describe('Server QueryEngine Integration Tests', () => {
    it('should test QueryEngine wildcard query in server context', async () => {
        const invertedIndex = new ShardedInvertedIndex();
        const mappingsManager = new MappingsManager();
        const stopwordsManager = new StopwordsManager();
        const tokenizer = new Tokenizer(stopwordsManager);
        const synonymEngine = new SynonymEngine();
        const documents = new Map();

        const queryEngine = new QueryEngine(invertedIndex, synonymEngine, tokenizer, documents, mappingsManager);

        // Add test documents
        const testDocs = [
            { id: '1', name: 'Rick Sanchez', status: 'Alive', species: 'Human' },
            { id: '2', name: 'Morty Smith', status: 'Alive', species: 'Human' },
            { id: '3', name: 'Summer Smith', status: 'Alive', species: 'Human' }
        ];

        for (const doc of testDocs) {
            queryEngine.add(doc);
        }

        // Test wildcard query
        const wildcardResult = queryEngine.search('*', { size: 10 });
        console.log('QueryEngine wildcard result:', {
            hits: wildcardResult.hits?.length || 0,
            total: wildcardResult.total || 0,
            from: wildcardResult.from || 0,
            size: wildcardResult.size || 0
        });

        expect(wildcardResult.hits).toBeDefined();
        expect(wildcardResult.total).toBe(3);
        expect(wildcardResult.hits.length).toBe(3);
    });

    it('should test QueryEngine string query in server context', async () => {
        const invertedIndex = new ShardedInvertedIndex();
        const mappingsManager = new MappingsManager();
        const stopwordsManager = new StopwordsManager();
        const tokenizer = new Tokenizer(stopwordsManager);
        const synonymEngine = new SynonymEngine();
        const documents = new Map();

        const queryEngine = new QueryEngine(invertedIndex, synonymEngine, tokenizer, documents, mappingsManager);

        // Add test documents
        const testDocs = [
            { id: '1', name: 'Rick Sanchez', status: 'Alive', species: 'Human' },
            { id: '2', name: 'Morty Smith', status: 'Alive', species: 'Human' },
            { id: '3', name: 'Summer Smith', status: 'Alive', species: 'Human' }
        ];

        for (const doc of testDocs) {
            queryEngine.add(doc);
        }

        // Test string query
        const stringResult = queryEngine.search('Rick', { size: 10 });
        console.log('QueryEngine string result:', {
            hits: stringResult.hits?.length || 0,
            total: stringResult.total || 0,
            from: stringResult.from || 0,
            size: stringResult.size || 0
        });

        expect(stringResult.hits).toBeDefined();
        expect(stringResult.total).toBeGreaterThan(0);
        expect(stringResult.hits.length).toBeGreaterThan(0);
    });

    it('should test QueryEngine match_all query in server context', async () => {
        const invertedIndex = new ShardedInvertedIndex();
        const mappingsManager = new MappingsManager();
        const stopwordsManager = new StopwordsManager();
        const tokenizer = new Tokenizer(stopwordsManager);
        const synonymEngine = new SynonymEngine();
        const documents = new Map();

        const queryEngine = new QueryEngine(invertedIndex, synonymEngine, tokenizer, documents, mappingsManager);

        // Add test documents
        const testDocs = [
            { id: '1', name: 'Rick Sanchez', status: 'Alive', species: 'Human' },
            { id: '2', name: 'Morty Smith', status: 'Alive', species: 'Human' },
            { id: '3', name: 'Summer Smith', status: 'Alive', species: 'Human' }
        ];

        for (const doc of testDocs) {
            queryEngine.add(doc);
        }

        // Test match_all query
        const matchAllResult = queryEngine.search({ match_all: {} }, { size: 10 });
        console.log('QueryEngine match_all result:', {
            hits: matchAllResult.hits?.length || 0,
            total: matchAllResult.total || 0,
            from: matchAllResult.from || 0,
            size: matchAllResult.size || 0
        });

        expect(matchAllResult.hits).toBeDefined();
        expect(matchAllResult.total).toBe(3);
        expect(matchAllResult.hits.length).toBe(3);
    });

    it('should test QueryEngine with __rawSet flag in server context', async () => {
        const invertedIndex = new ShardedInvertedIndex();
        const mappingsManager = new MappingsManager();
        const stopwordsManager = new StopwordsManager();
        const tokenizer = new Tokenizer(stopwordsManager);
        const synonymEngine = new SynonymEngine();
        const documents = new Map();

        const queryEngine = new QueryEngine(invertedIndex, synonymEngine, tokenizer, documents, mappingsManager);

        // Add test documents
        const testDocs = [
            { id: '1', name: 'Rick Sanchez', status: 'Alive', species: 'Human' },
            { id: '2', name: 'Morty Smith', status: 'Alive', species: 'Human' },
            { id: '3', name: 'Summer Smith', status: 'Alive', species: 'Human' }
        ];

        for (const doc of testDocs) {
            queryEngine.add(doc);
        }

        // Test with __rawSet flag
        const rawSetResult = queryEngine.search('*', { __rawSet: true });
        console.log('QueryEngine rawSet result:', {
            isSet: rawSetResult instanceof Set,
            size: rawSetResult instanceof Set ? rawSetResult.size : 0
        });

        expect(rawSetResult instanceof Set).toBe(true);
        expect(rawSetResult.size).toBe(3);
    });
});

