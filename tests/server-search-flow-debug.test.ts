/**
 * Debug the complete search flow from server to QueryEngine
 */

import { describe, it, expect } from 'vitest';
import SharedMemoryWorkerPool from '../src/infrastructure/SharedMemoryWorkerPool';
import SharedMemoryStore from '../src/infrastructure/SharedMemoryStore';

describe('Server Search Flow Debug Tests', () => {
    it('should debug the complete search flow for wildcard query', async () => {
        const workerPool = new SharedMemoryWorkerPool({
            workerThreads: 1,
            taskTimeout: 5000,
            enablePersistence: false
        });

        const sharedMemoryStore = (workerPool as any).sharedMemoryStore;

        // Add test documents
        const testDocs = [
            { id: '1', name: 'Rick Sanchez', status: 'Alive', species: 'Human', indexName: 'test' },
            { id: '2', name: 'Morty Smith', status: 'Alive', species: 'Human', indexName: 'test' },
            { id: '3', name: 'Summer Smith', status: 'Alive', species: 'Human', indexName: 'test' }
        ];

        for (const doc of testDocs) {
            sharedMemoryStore.addDocument(doc);
        }

        // Add documents to the worker pool (this will create the index automatically)
        await workerPool.addDocuments('test', testDocs);

        console.log('SharedMemoryStore stats:', sharedMemoryStore.getStats());

        // Test 1: Direct SharedMemoryStore search with wildcard
        const directResult = sharedMemoryStore.search('*', { size: 10 });
        console.log('Direct SharedMemoryStore wildcard result:', {
            hits: directResult.hits?.length || 0,
            total: directResult.total || 0
        });

        // Test 2: SharedMemoryWorkerPool search with wildcard
        const workerPoolResult = await workerPool.search('test', '*', { size: 10 });
        console.log('SharedMemoryWorkerPool wildcard result:', {
            success: workerPoolResult.success,
            results: workerPoolResult.results?.length || 0,
            total: workerPoolResult.total || 0,
            error: workerPoolResult.error || 'No error'
        });

        // Test 3: Test the internal SearchEngine directly
        const searchEngine = (sharedMemoryStore as any).searchEngine;
        const searchEngineResult = searchEngine.search('*', { size: 10 }, 'test');
        console.log('SearchEngine wildcard result:', {
            hits: searchEngineResult.hits?.length || 0,
            total: searchEngineResult.total || 0
        });

        // Test 4: Test the QueryEngine directly
        const queryEngine = (searchEngine as any).indices['default'].queryEngine;
        const queryEngineResult = queryEngine.search('*', { size: 10 });
        console.log('QueryEngine wildcard result:', {
            hits: queryEngineResult.hits?.length || 0,
            total: queryEngineResult.total || 0
        });

        // All should work
        expect(directResult.total).toBe(3);
        expect(workerPoolResult.success).toBe(true);
        expect(workerPoolResult.total).toBe(3);
        expect(searchEngineResult.total).toBe(3);
    });

    it('should debug the complete search flow for string query', async () => {
        const workerPool = new SharedMemoryWorkerPool({
            workerThreads: 1,
            taskTimeout: 5000,
            enablePersistence: false
        });

        const sharedMemoryStore = (workerPool as any).sharedMemoryStore;

        // Add test documents
        const testDocs = [
            { id: '1', name: 'Rick Sanchez', status: 'Alive', species: 'Human', indexName: 'test' },
            { id: '2', name: 'Morty Smith', status: 'Alive', species: 'Human', indexName: 'test' },
            { id: '3', name: 'Summer Smith', status: 'Alive', species: 'Human', indexName: 'test' }
        ];

        for (const doc of testDocs) {
            sharedMemoryStore.addDocument(doc);
        }

        // Add documents to the worker pool (this will create the index automatically)
        await workerPool.addDocuments('test', testDocs);

        // Test 1: Direct SharedMemoryStore search with string
        const directResult = sharedMemoryStore.search('Rick', { size: 10 });
        console.log('Direct SharedMemoryStore string result:', {
            hits: directResult.hits?.length || 0,
            total: directResult.total || 0
        });

        // Test 2: SharedMemoryWorkerPool search with string
        const workerPoolResult = await workerPool.search('test', 'Rick', { size: 10 });
        console.log('SharedMemoryWorkerPool string result:', {
            success: workerPoolResult.success,
            results: workerPoolResult.results?.length || 0,
            total: workerPoolResult.total || 0,
            error: workerPoolResult.error || 'No error'
        });

        // Test 3: Test the internal SearchEngine directly
        const searchEngine = (sharedMemoryStore as any).searchEngine;
        const searchEngineResult = searchEngine.search('Rick', { size: 10 }, 'test');
        console.log('SearchEngine string result:', {
            hits: searchEngineResult.hits?.length || 0,
            total: searchEngineResult.total || 0
        });

        // Test 4: Test the QueryEngine directly
        const queryEngine = (searchEngine as any).indices['default'].queryEngine;
        const queryEngineResult = queryEngine.search('Rick', { size: 10 });
        console.log('QueryEngine string result:', {
            hits: queryEngineResult.hits?.length || 0,
            total: queryEngineResult.total || 0
        });

        // All should work
        expect(directResult.total).toBeGreaterThan(0);
        expect(workerPoolResult.success).toBe(true);
        expect(workerPoolResult.total).toBeGreaterThan(0);
        expect(searchEngineResult.total).toBeGreaterThan(0);
    });
});

