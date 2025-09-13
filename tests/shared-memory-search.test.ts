/**
 * Test file for SharedMemoryStore search functionality
 */

import { describe, it, expect, beforeEach } from 'vitest';
import SharedMemoryStore from '../src/infrastructure/SharedMemoryStore';
import SearchEngine from '../src/domain/SearchEngine';
import { MappingsManager } from '../src/domain/MappingsManager';
import { Tokenizer } from '../src/domain/Tokenizer';
import { StopwordsManager } from '../src/infrastructure/StopwordsManager';

describe('SharedMemoryStore Search Tests', () => {
    let sharedMemoryStore: SharedMemoryStore;
    let searchEngine: SearchEngine;

    beforeEach(() => {
        // Create a fresh SharedMemoryStore for each test
        sharedMemoryStore = new SharedMemoryStore({ indexName: 'test' });

        // Create a fresh SearchEngine for comparison
        const mappingsManager = new MappingsManager();
        const stopwordsManager = new StopwordsManager();
        const tokenizer = new Tokenizer(stopwordsManager, {
            stemming: true,
            stemmingOptions: { language: 'en', aggressive: false }
        });

        searchEngine = new SearchEngine({
            mappingsManager,
            tokenizer,
            indexName: 'test'
        });
    });

    it('should add documents to SharedMemoryStore', () => {
        const testDoc = { id: '1', name: 'Rick Sanchez', status: 'Alive', species: 'Human' };
        const result = sharedMemoryStore.addDocument(testDoc);

        expect(result.wasAdded).toBe(true);
        expect(sharedMemoryStore.getStats().totalDocs).toBe(1);
    });

    it('should add documents to SearchEngine', () => {
        const testDoc = { id: '1', name: 'Rick Sanchez', status: 'Alive', species: 'Human' };
        searchEngine.add(testDoc);

        const stats = searchEngine.getStats('test');
        expect(stats.totalDocs).toBe(1);
    });

    it('should search documents in SharedMemoryStore with match_all', () => {
        // Add test documents
        const testDocs = [
            { id: '1', name: 'Rick Sanchez', status: 'Alive', species: 'Human' },
            { id: '2', name: 'Morty Smith', status: 'Alive', species: 'Human' },
            { id: '3', name: 'Summer Smith', status: 'Alive', species: 'Human' }
        ];

        for (const doc of testDocs) {
            sharedMemoryStore.addDocument(doc);
        }

        // Test match_all query
        const result = sharedMemoryStore.search({ match_all: {} }, { size: 10 });

        console.log('SharedMemoryStore match_all result:', {
            hits: result.hits?.length || 0,
            total: result.total || 0,
            from: result.from || 0,
            size: result.size || 0
        });

        expect(result.hits).toBeDefined();
        expect(result.total).toBeGreaterThan(0);
        expect(result.hits.length).toBeGreaterThan(0);
    });

    it('should search documents in SearchEngine with match_all', () => {
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
        expect(result.total).toBeGreaterThan(0);
        expect(result.hits.length).toBeGreaterThan(0);
    });

    it('should search documents in SharedMemoryStore with string query', () => {
        // Add test documents
        const testDocs = [
            { id: '1', name: 'Rick Sanchez', status: 'Alive', species: 'Human' },
            { id: '2', name: 'Morty Smith', status: 'Alive', species: 'Human' },
            { id: '3', name: 'Summer Smith', status: 'Alive', species: 'Human' }
        ];

        for (const doc of testDocs) {
            sharedMemoryStore.addDocument(doc);
        }

        // Test string query
        const result = sharedMemoryStore.search('Rick', { size: 10 });

        console.log('SharedMemoryStore string query result:', {
            hits: result.hits?.length || 0,
            total: result.total || 0,
            from: result.from || 0,
            size: result.size || 0
        });

        expect(result.hits).toBeDefined();
        expect(result.total).toBeGreaterThan(0);
        expect(result.hits.length).toBeGreaterThan(0);
    });

    it('should search documents in SearchEngine with string query', () => {
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

    it('should debug SharedMemoryStore internal state', () => {
        // Add test documents
        const testDocs = [
            { id: '1', name: 'Rick Sanchez', status: 'Alive', species: 'Human' },
            { id: '2', name: 'Morty Smith', status: 'Alive', species: 'Human' }
        ];

        for (const doc of testDocs) {
            sharedMemoryStore.addDocument(doc);
        }

        // Debug internal state
        const stats = sharedMemoryStore.getStats();
        console.log('SharedMemoryStore stats:', stats);

        // Check if SearchEngine has the documents
        const searchEngineStats = (sharedMemoryStore as any).searchEngine.getStats('test');
        console.log('Internal SearchEngine stats:', searchEngineStats);

        // Check if documents are in the internal map
        const documents = (sharedMemoryStore as any).documents;
        console.log('Internal documents map size:', documents.size);
        console.log('Internal documents:', Array.from(documents.keys()));

        expect(stats.totalDocs).toBe(2);
    });
});

