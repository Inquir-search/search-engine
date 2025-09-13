/**
 * Test file for SearchEngine initialization and QueryEngine setup
 */

import { describe, it, expect, beforeEach } from 'vitest';
import SearchEngine from '../src/domain/SearchEngine';
import { MappingsManager } from '../src/domain/MappingsManager';
import { Tokenizer } from '../src/domain/Tokenizer';
import { StopwordsManager } from '../src/infrastructure/StopwordsManager';
import { QueryEngine } from '../src/domain/QueryEngine';
import { ShardedInvertedIndex } from '../src/domain/ShardedInvertedIndex';
import { SynonymEngine } from '../src/domain/SynonymEngine';

describe('SearchEngine Initialization Tests', () => {
    let searchEngine: SearchEngine;
    let mappingsManager: MappingsManager;
    let tokenizer: Tokenizer;
    let stopwordsManager: StopwordsManager;

    beforeEach(() => {
        mappingsManager = new MappingsManager();
        stopwordsManager = new StopwordsManager();
        tokenizer = new Tokenizer(stopwordsManager, {
            stemming: true,
            stemmingOptions: { language: 'en', aggressive: false }
        });

        searchEngine = new SearchEngine({
            mappingsManager,
            tokenizer,
            indexName: 'test'
        });
    });

    it('should create SearchEngine with proper index', () => {
        expect(searchEngine).toBeDefined();
        expect(searchEngine.getStats('test')).toBeDefined();

        const stats = searchEngine.getStats('test');
        console.log('SearchEngine stats:', stats);

        expect(stats.indexName).toBe('test');
    });

    it('should have QueryEngine properly initialized', () => {
        const index = (searchEngine as any).indices['test'];
        expect(index).toBeDefined();
        expect(index.queryEngine).toBeDefined();

        const queryEngine = index.queryEngine;
        expect(queryEngine).toBeInstanceOf(QueryEngine);

        // Check if QueryEngine has required dependencies
        expect((queryEngine as any).documents).toBeDefined();
        expect((queryEngine as any).invertedIndex).toBeDefined();
        expect((queryEngine as any).tokenizer).toBeDefined();
        expect((queryEngine as any).mappingsManager).toBeDefined();
    });

    it('should add documents to SearchEngine', () => {
        const testDoc = { id: '1', name: 'Rick Sanchez', status: 'Alive', species: 'Human' };
        searchEngine.add(testDoc);

        const stats = searchEngine.getStats('test');
        expect(stats.totalDocs).toBe(1);
    });

    it('should search documents with match_all query', () => {
        // Add test documents
        const testDocs = [
            { id: '1', name: 'Rick Sanchez', status: 'Alive', species: 'Human' },
            { id: '2', name: 'Morty Smith', status: 'Alive', species: 'Human' },
            { id: '3', name: 'Summer Smith', status: 'Alive', species: 'Human' }
        ];

        for (const doc of testDocs) {
            searchEngine.add(doc);
        }

        // Test match_all query
        const result = searchEngine.search({ match_all: {} }, { size: 10 }, 'test');

        console.log('SearchEngine match_all result:', {
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
            searchEngine.add(doc);
        }

        // Test string query
        const result = searchEngine.search('Rick', { size: 10 }, 'test');

        console.log('SearchEngine string query result:', {
            hits: result.hits?.length || 0,
            total: result.total || 0,
            from: result.from || 0,
            size: result.size || 0
        });

        expect(result.hits).toBeDefined();
        expect(result.total).toBeGreaterThan(0);
        expect(result.hits.length).toBeGreaterThan(0);
    });

    it('should debug QueryEngine internal state', () => {
        // Add test documents
        const testDocs = [
            { id: '1', name: 'Rick Sanchez', status: 'Alive', species: 'Human' },
            { id: '2', name: 'Morty Smith', status: 'Alive', species: 'Human' }
        ];

        for (const doc of testDocs) {
            searchEngine.add(doc);
        }

        // Debug QueryEngine state
        const index = (searchEngine as any).indices['test'];
        const queryEngine = index.queryEngine;

        console.log('QueryEngine documents count:', (queryEngine as any).documents.size);
        console.log('QueryEngine documents keys:', Array.from((queryEngine as any).documents.keys()));

        // Test direct QueryEngine search
        const directResult = queryEngine.search({ match_all: {} }, { size: 10 });
        console.log('Direct QueryEngine match_all result:', {
            hits: directResult.hits?.length || 0,
            total: directResult.total || 0
        });

        expect((queryEngine as any).documents.size).toBe(2);
    });

    it('should test QueryEngine with raw set flag', () => {
        // Add test documents
        const testDocs = [
            { id: '1', name: 'Rick Sanchez', status: 'Alive', species: 'Human' },
            { id: '2', name: 'Morty Smith', status: 'Alive', species: 'Human' }
        ];

        for (const doc of testDocs) {
            searchEngine.add(doc);
        }

        // Test QueryEngine with __rawSet flag
        const index = (searchEngine as any).indices['test'];
        const queryEngine = index.queryEngine;

        const rawSetResult = queryEngine.search({ match_all: {} }, { __rawSet: true });
        console.log('QueryEngine rawSet result:', rawSetResult instanceof Set ? rawSetResult.size : 'Not a Set');

        expect(rawSetResult instanceof Set).toBe(true);
        expect(rawSetResult.size).toBe(2);
    });
});

