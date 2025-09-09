/**
 * Test SharedMemoryWorkerPool search functionality
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import SharedMemoryWorkerPool from '../src/infrastructure/SharedMemoryWorkerPool';
import SharedMemoryStore from '../src/infrastructure/SharedMemoryStore';

describe('SharedMemoryWorkerPool Search Tests', () => {
    let workerPool: SharedMemoryWorkerPool;
    let sharedMemoryStore: SharedMemoryStore;

    beforeEach(async () => {
        // Create a minimal worker pool for testing
        workerPool = new SharedMemoryWorkerPool({
            workerThreads: 1,
            taskTimeout: 5000,
            enablePersistence: false
        });

        // Initialize the worker pool
        await workerPool.initialize();

        // Get the shared memory store
        sharedMemoryStore = (workerPool as any).sharedMemoryStore;
    });

    afterEach(async () => {
        if (workerPool) {
            await workerPool.shutdown();
        }
    });

    it('should test SharedMemoryStore search directly', async () => {
        // Add test documents to SharedMemoryStore
        const testDocs = [
            { id: '1', name: 'Rick Sanchez', status: 'Alive', species: 'Human' },
            { id: '2', name: 'Morty Smith', status: 'Alive', species: 'Human' },
            { id: '3', name: 'Summer Smith', status: 'Alive', species: 'Human' }
        ];

        for (const doc of testDocs) {
            sharedMemoryStore.addDocument(doc);
        }

        console.log('SharedMemoryStore stats after adding documents:', sharedMemoryStore.getStats());

        // Test match_all query
        const matchAllResult = sharedMemoryStore.search({ match_all: {} }, { size: 10 });
        console.log('SharedMemoryStore match_all result:', {
            hits: matchAllResult.hits?.length || 0,
            total: matchAllResult.total || 0,
            from: matchAllResult.from || 0,
            size: matchAllResult.size || 0
        });

        expect(matchAllResult.hits).toBeDefined();
        expect(matchAllResult.total).toBe(3);
        expect(matchAllResult.hits.length).toBe(3);
    });

    it('should test SharedMemoryStore search with string query', async () => {
        // Add test documents to SharedMemoryStore
        const testDocs = [
            { id: '1', name: 'Rick Sanchez', status: 'Alive', species: 'Human' },
            { id: '2', name: 'Morty Smith', status: 'Alive', species: 'Human' },
            { id: '3', name: 'Summer Smith', status: 'Alive', species: 'Human' }
        ];

        for (const doc of testDocs) {
            sharedMemoryStore.addDocument(doc);
        }

        // Test string query
        const stringResult = sharedMemoryStore.search('Rick', { size: 10 });
        console.log('SharedMemoryStore string result:', {
            hits: stringResult.hits?.length || 0,
            total: stringResult.total || 0,
            from: stringResult.from || 0,
            size: stringResult.size || 0
        });

        expect(stringResult.hits).toBeDefined();
        expect(stringResult.total).toBeGreaterThan(0);
        expect(stringResult.hits.length).toBeGreaterThan(0);
    });

    it('should test SharedMemoryStore search with wildcard query', async () => {
        // Add test documents to SharedMemoryStore
        const testDocs = [
            { id: '1', name: 'Rick Sanchez', status: 'Alive', species: 'Human' },
            { id: '2', name: 'Morty Smith', status: 'Alive', species: 'Human' },
            { id: '3', name: 'Summer Smith', status: 'Alive', species: 'Human' }
        ];

        for (const doc of testDocs) {
            sharedMemoryStore.addDocument(doc);
        }

        // Test wildcard query
        const wildcardResult = sharedMemoryStore.search('*', { size: 10 });
        console.log('SharedMemoryStore wildcard result:', {
            hits: wildcardResult.hits?.length || 0,
            total: wildcardResult.total || 0,
            from: wildcardResult.from || 0,
            size: wildcardResult.size || 0
        });

        expect(wildcardResult.hits).toBeDefined();
        expect(wildcardResult.total).toBe(3);
        expect(wildcardResult.hits.length).toBe(3);
    });

    it('should test SharedMemoryWorkerPool search method', async () => {
        // Add test documents to SharedMemoryStore
        const testDocs = [
            { id: '1', name: 'Rick Sanchez', status: 'Alive', species: 'Human' },
            { id: '2', name: 'Morty Smith', status: 'Alive', species: 'Human' },
            { id: '3', name: 'Summer Smith', status: 'Alive', species: 'Human' }
        ];

        for (const doc of testDocs) {
            sharedMemoryStore.addDocument({ ...doc, indexName: 'test' });
        }

        // Test worker pool search
        const result = await workerPool.search('test', '*', { size: 10 });
        console.log('WorkerPool search result:', {
            success: result.success,
            hits: result.hits?.length || 0,
            total: result.total || 0,
            from: result.from || 0,
            size: result.size || 0
        });

        expect(result.success).toBe(true);
        expect(result.hits).toBeDefined();
        expect(result.total).toBe(3);
        expect(result.hits.length).toBe(3);
    });

    it('should test SharedMemoryWorkerPool search with match_all object', async () => {
        // Add test documents to SharedMemoryStore
        const testDocs = [
            { id: '1', name: 'Rick Sanchez', status: 'Alive', species: 'Human' },
            { id: '2', name: 'Morty Smith', status: 'Alive', species: 'Human' },
            { id: '3', name: 'Summer Smith', status: 'Alive', species: 'Human' }
        ];

        for (const doc of testDocs) {
            sharedMemoryStore.addDocument({ ...doc, indexName: 'test' });
        }

        // Test worker pool search with match_all object
        const result = await workerPool.search('test', { match_all: {} }, { size: 10 });
        console.log('WorkerPool match_all result:', {
            success: result.success,
            hits: result.hits?.length || 0,
            total: result.total || 0,
            from: result.from || 0,
            size: result.size || 0
        });

        expect(result.success).toBe(true);
        expect(result.hits).toBeDefined();
        expect(result.total).toBe(3);
        expect(result.hits.length).toBe(3);
    });

    it('should debug SharedMemoryStore internal state', async () => {
        // Add test documents to SharedMemoryStore
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
        const searchEngine = (sharedMemoryStore as any).searchEngine;
        if (searchEngine) {
            const searchEngineStats = searchEngine.getStats('test');
            console.log('Internal SearchEngine stats:', searchEngineStats);
        }

        // Check if documents are in the internal map
        const documents = (sharedMemoryStore as any).documents;
        console.log('Internal documents map size:', documents.size);
        console.log('Internal documents keys:', Array.from(documents.keys()));

        expect(stats.totalDocs).toBe(2);
    });
});

