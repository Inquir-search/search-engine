/**
 * Unit test to debug movies index issue
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import SharedMemoryWorkerPool from '../src/infrastructure/SharedMemoryWorkerPool';
import SharedMemoryStore from '../src/infrastructure/SharedMemoryStore';

describe('Movies Index Debug Test', () => {
    let workerPool: SharedMemoryWorkerPool;
    let sharedMemoryStore: SharedMemoryStore;

    beforeEach(async () => {
        // Initialize worker pool with minimal config for testing
        workerPool = new SharedMemoryWorkerPool({
            workerThreads: 0, // Disable workers for testing
            enablePersistence: false,
            taskTimeout: 5000
        });
        await workerPool.initialize();
        sharedMemoryStore = (workerPool as any).sharedMemoryStore;
    });

    afterEach(async () => {
        if (workerPool) {
            await workerPool.shutdown();
        }
    });

    it('should debug movies index document storage and retrieval', async () => {
        console.log('🔍 Debugging movies index...');

        // Add movies documents
        const movieDocs = [
            { id: 'movie_debug_1', name: 'Inception Debug', type: 'Movie', genre: 'Sci-Fi' },
            { id: 'movie_debug_2', name: 'Matrix Debug', type: 'Movie', genre: 'Action' }
        ];

        console.log('1. Adding movies documents...');
        const addResult = await workerPool.addDocuments('movies', movieDocs);
        console.log('Add result:', addResult);

        // Check in-memory docs
        console.log('\n2. Checking in-memory docs...');
        const inMemoryMap = (workerPool as any)['__inMemoryDocs'];
        console.log('In-memory map exists:', !!inMemoryMap);

        if (inMemoryMap) {
            const moviesInMemory = inMemoryMap.get('movies') || [];
            console.log('Movies docs in memory:', moviesInMemory.length);
            console.log('Sample movies docs:', moviesInMemory.map(d => ({
                id: d.id,
                name: d.name,
                indexName: d.indexName
            })));
        }

        // Check SharedMemoryStore
        console.log('\n3. Checking SharedMemoryStore...');
        const stats = sharedMemoryStore.getStats();
        console.log('SharedMemoryStore stats:', stats);

        const allDocs = Array.from(sharedMemoryStore.documents.values());
        const moviesInStore = allDocs.filter(d => d.indexName === 'movies');
        console.log('Movies docs in store:', moviesInStore.length);
        console.log('Sample movies docs in store:', moviesInStore.map(d => ({
            id: d.id,
            name: d.name,
            indexName: d.indexName
        })));

        // Test search
        console.log('\n4. Testing movies search...');
        const searchResult = await workerPool.search('movies', { match_all: {} });
        console.log('Movies search result:', {
            success: searchResult.success,
            total: searchResult.total,
            hits: searchResult.hits?.map(h => ({ id: h.id, name: h.name, indexName: h.indexName }))
        });

        // Test string search
        console.log('\n5. Testing movies string search...');
        const stringSearchResult = await workerPool.search('movies', 'Inception');
        console.log('Movies string search result:', {
            success: stringSearchResult.success,
            total: stringSearchResult.total,
            hits: stringSearchResult.hits?.map(h => ({ id: h.id, name: h.name }))
        });

        // Verify results
        expect(addResult.success).toBe(true);
        expect(addResult.addedCount).toBe(2);
        expect(searchResult.success).toBe(true);
        expect(searchResult.total).toBe(2);
        expect(stringSearchResult.success).toBe(true);
        expect(stringSearchResult.total).toBeGreaterThan(0);
    });

    it('should compare anime vs movies index behavior', async () => {
        console.log('🔍 Comparing anime vs movies index behavior...');

        // Add documents to both indices
        const animeDocs = [
            { id: 'anime_compare_1', name: 'Naruto Compare', type: 'TV' },
            { id: 'anime_compare_2', name: 'One Piece Compare', type: 'TV' }
        ];

        const movieDocs = [
            { id: 'movie_compare_1', name: 'Inception Compare', type: 'Movie' },
            { id: 'movie_compare_2', name: 'Matrix Compare', type: 'Movie' }
        ];

        console.log('1. Adding anime documents...');
        const animeAddResult = await workerPool.addDocuments('anime', animeDocs);
        console.log('Anime add result:', animeAddResult);

        console.log('2. Adding movies documents...');
        const movieAddResult = await workerPool.addDocuments('movies', movieDocs);
        console.log('Movies add result:', movieAddResult);

        // Check in-memory docs for both indices
        console.log('\n3. Checking in-memory docs for both indices...');
        const inMemoryMap = (workerPool as any)['__inMemoryDocs'];

        if (inMemoryMap) {
            const animeInMemory = inMemoryMap.get('anime') || [];
            const moviesInMemory = inMemoryMap.get('movies') || [];

            console.log('Anime docs in memory:', animeInMemory.length);
            console.log('Movies docs in memory:', moviesInMemory.length);

            console.log('Anime docs:', animeInMemory.map(d => ({ id: d.id, name: d.name, indexName: d.indexName })));
            console.log('Movies docs:', moviesInMemory.map(d => ({ id: d.id, name: d.name, indexName: d.indexName })));
        }

        // Test searches for both indices
        console.log('\n4. Testing searches for both indices...');

        const animeSearch = await workerPool.search('anime', { match_all: {} });
        const movieSearch = await workerPool.search('movies', { match_all: {} });

        console.log('Anime search:', {
            success: animeSearch.success,
            total: animeSearch.total,
            hits: animeSearch.hits?.map(h => ({ id: h.id, name: h.name, indexName: h.indexName }))
        });

        console.log('Movies search:', {
            success: movieSearch.success,
            total: movieSearch.total,
            hits: movieSearch.hits?.map(h => ({ id: h.id, name: h.name, indexName: h.indexName }))
        });

        // Verify both indices work
        expect(animeSearch.success).toBe(true);
        expect(animeSearch.total).toBe(2);
        expect(movieSearch.success).toBe(true);
        expect(movieSearch.total).toBe(2);
    });
});
