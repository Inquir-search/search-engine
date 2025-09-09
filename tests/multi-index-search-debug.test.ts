/**
 * Unit tests to debug multi-index search routing issues
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import SharedMemoryWorkerPool from '../src/infrastructure/SharedMemoryWorkerPool';
import SharedMemoryStore from '../src/infrastructure/SharedMemoryStore';

describe('Multi-Index Search Debug Tests', () => {
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

    describe('Search Code Path Analysis', () => {
        it('should identify which code path is used for search', async () => {
            console.log('🔍 Testing search code path...');

            // Add test documents
            const animeDocs = [
                { id: 'anime_test_1', name: 'Naruto', type: 'TV', genre: 'Action' },
                { id: 'anime_test_2', name: 'One Piece', type: 'TV', genre: 'Adventure' }
            ];

            const movieDocs = [
                { id: 'movie_test_1', name: 'Inception', type: 'Movie', genre: 'Sci-Fi' },
                { id: 'movie_test_2', name: 'The Matrix', type: 'Movie', genre: 'Action' }
            ];

            // Add documents
            await workerPool.addDocuments('anime', animeDocs);
            await workerPool.addDocuments('movies', movieDocs);

            // Check SharedMemoryStore contents
            const stats = sharedMemoryStore.getStats();
            console.log('📊 SharedMemoryStore stats:', stats);

            const allDocs = Array.from(sharedMemoryStore.documents.values());
            console.log('📄 All documents in SharedMemoryStore:', allDocs.length);
            console.log('📄 Sample documents:', allDocs.slice(0, 3).map(d => ({
                id: d.id,
                name: d.name,
                indexName: d.indexName
            })));

            // Test search routing
            console.log('\n🔍 Testing anime search...');
            const animeSearch = await workerPool.search('anime', { match_all: {} });
            console.log('Anime search result:', {
                success: animeSearch.success,
                total: animeSearch.total,
                hits: animeSearch.hits?.map(h => ({ id: h.id, name: h.name, indexName: h.indexName }))
            });

            console.log('\n🔍 Testing movies search...');
            const movieSearch = await workerPool.search('movies', { match_all: {} });
            console.log('Movies search result:', {
                success: movieSearch.success,
                total: movieSearch.total,
                hits: movieSearch.hits?.map(h => ({ id: h.id, name: h.name, indexName: h.indexName }))
            });

            // Verify index isolation
            const animeIndexIsolation = animeSearch.hits?.every(h => h.indexName === 'anime');
            const movieIndexIsolation = movieSearch.hits?.every(h => h.indexName === 'movies');

            console.log('\n✅ Index Isolation Results:');
            console.log('Anime index isolation:', animeIndexIsolation ? 'PASS' : 'FAIL');
            console.log('Movies index isolation:', movieIndexIsolation ? 'PASS' : 'FAIL');

            expect(animeIndexIsolation).toBe(true);
            expect(movieIndexIsolation).toBe(true);
        });

        it('should test SharedMemoryStore filtering directly', async () => {
            console.log('🔍 Testing SharedMemoryStore filtering directly...');

            // Add test documents directly to SharedMemoryStore
            const animeDocs = [
                { id: 'anime_direct_1', name: 'Naruto Direct', type: 'TV', indexName: 'anime' },
                { id: 'anime_direct_2', name: 'One Piece Direct', type: 'TV', indexName: 'anime' }
            ];

            const movieDocs = [
                { id: 'movie_direct_1', name: 'Inception Direct', type: 'Movie', indexName: 'movies' },
                { id: 'movie_direct_2', name: 'Matrix Direct', type: 'Movie', indexName: 'movies' }
            ];

            // Add documents directly to SharedMemoryStore
            for (const doc of animeDocs) {
                const taggedDoc = { ...doc, _addedAt: Date.now() };
                sharedMemoryStore.addDocument(taggedDoc);
            }

            for (const doc of movieDocs) {
                const taggedDoc = { ...doc, _addedAt: Date.now() };
                sharedMemoryStore.addDocument(taggedDoc);
            }

            // Test direct SharedMemoryStore search
            console.log('\n🔍 Testing direct SharedMemoryStore search...');

            const animeDirectSearch = sharedMemoryStore.search({ match_all: {} }, {
                from: 0,
                size: 10,
                indexName: 'anime'
            });

            const movieDirectSearch = sharedMemoryStore.search({ match_all: {} }, {
                from: 0,
                size: 10,
                indexName: 'movies'
            });

            console.log('Anime direct search:', {
                total: animeDirectSearch.total,
                hits: animeDirectSearch.hits?.map(h => ({ id: h.id, name: h.name, indexName: h.indexName }))
            });

            console.log('Movies direct search:', {
                total: movieDirectSearch.total,
                hits: movieDirectSearch.hits?.map(h => ({ id: h.id, name: h.name, indexName: h.indexName }))
            });

            // Verify direct search results
            const animeDirectIsolation = animeDirectSearch.hits?.every(h => h.indexName === 'anime');
            const movieDirectIsolation = movieDirectSearch.hits?.every(h => h.indexName === 'movies');

            console.log('\n✅ Direct Search Results:');
            console.log('Anime direct isolation:', animeDirectIsolation ? 'PASS' : 'FAIL');
            console.log('Movies direct isolation:', movieDirectIsolation ? 'PASS' : 'FAIL');

            expect(animeDirectIsolation).toBe(true);
            expect(movieDirectIsolation).toBe(true);
        });

        it('should test string query handling', async () => {
            console.log('🔍 Testing string query handling...');

            // Add test documents
            const animeDocs = [
                { id: 'anime_string_1', name: 'Naruto String', type: 'TV' },
                { id: 'anime_string_2', name: 'One Piece String', type: 'TV' }
            ];

            await workerPool.addDocuments('anime', animeDocs);

            // Test string queries
            console.log('\n🔍 Testing string queries...');

            const animeStringSearch = await workerPool.search('anime', 'Naruto');
            console.log('Anime string search for "Naruto":', {
                success: animeStringSearch.success,
                total: animeStringSearch.total,
                hits: animeStringSearch.hits?.map(h => ({ id: h.id, name: h.name }))
            });

            const animeWildcardSearch = await workerPool.search('anime', '*');
            console.log('Anime wildcard search "*":', {
                success: animeWildcardSearch.success,
                total: animeWildcardSearch.total,
                hits: animeWildcardSearch.hits?.map(h => ({ id: h.id, name: h.name }))
            });

            // Verify string query results
            expect(animeStringSearch.success).toBe(true);
            expect(animeStringSearch.total).toBeGreaterThan(0);
            expect(animeWildcardSearch.success).toBe(true);
            expect(animeWildcardSearch.total).toBeGreaterThan(0);
        });

        it('should test in-memory docs vs SharedMemoryStore routing', async () => {
            console.log('🔍 Testing in-memory docs vs SharedMemoryStore routing...');

            // Add test documents
            const animeDocs = [
                { id: 'anime_memory_1', name: 'Naruto Memory', type: 'TV' },
                { id: 'anime_memory_2', name: 'One Piece Memory', type: 'TV' }
            ];

            await workerPool.addDocuments('anime', animeDocs);

            // Check if documents are in in-memory map
            const inMemoryMap = (workerPool as any)['__inMemoryDocs'];
            console.log('📊 In-memory docs map:', inMemoryMap ? 'EXISTS' : 'NOT EXISTS');

            if (inMemoryMap) {
                const animeInMemory = inMemoryMap.get('anime') || [];
                console.log('📄 Anime docs in memory:', animeInMemory.length);
                console.log('📄 Sample anime docs:', animeInMemory.slice(0, 2).map(d => ({
                    id: d.id,
                    name: d.name,
                    indexName: d.indexName
                })));
            }

            // Check SharedMemoryStore
            const stats = sharedMemoryStore.getStats();
            console.log('📊 SharedMemoryStore stats:', stats);

            const allDocs = Array.from(sharedMemoryStore.documents.values());
            const animeDocsInStore = allDocs.filter(d => d.indexName === 'anime');
            console.log('📄 Anime docs in SharedMemoryStore:', animeDocsInStore.length);

            // Test search
            const searchResult = await workerPool.search('anime', { match_all: {} });
            console.log('🔍 Search result:', {
                success: searchResult.success,
                total: searchResult.total,
                hits: searchResult.hits?.map(h => ({ id: h.id, name: h.name, indexName: h.indexName }))
            });

            // Determine which code path was used
            if (inMemoryMap && inMemoryMap.get('anime')?.length > 0) {
                console.log('✅ Search used in-memory docs path');
            } else if (stats.totalDocs > 0) {
                console.log('✅ Search used SharedMemoryStore path');
            } else {
                console.log('❌ Search used unknown path');
            }
        });

        it('should test cross-index isolation', async () => {
            console.log('🔍 Testing cross-index isolation...');

            // Add documents to different indices
            const animeDocs = [
                { id: 'anime_isolate_1', name: 'Naruto Isolate', type: 'TV' },
                { id: 'anime_isolate_2', name: 'One Piece Isolate', type: 'TV' }
            ];

            const movieDocs = [
                { id: 'movie_isolate_1', name: 'Inception Isolate', type: 'Movie' },
                { id: 'movie_isolate_2', name: 'Matrix Isolate', type: 'Movie' }
            ];

            await workerPool.addDocuments('anime', animeDocs);
            await workerPool.addDocuments('movies', movieDocs);

            // Test cross-index searches
            console.log('\n🔍 Testing cross-index searches...');

            const animeSearchForMovie = await workerPool.search('anime', 'Inception');
            const movieSearchForAnime = await workerPool.search('movies', 'Naruto');

            console.log('Anime search for "Inception" (should return 0):', {
                success: animeSearchForMovie.success,
                total: animeSearchForMovie.total,
                hits: animeSearchForMovie.hits?.map(h => ({ id: h.id, name: h.name }))
            });

            console.log('Movies search for "Naruto" (should return 0):', {
                success: movieSearchForAnime.success,
                total: movieSearchForAnime.total,
                hits: movieSearchForAnime.hits?.map(h => ({ id: h.id, name: h.name }))
            });

            // Verify cross-index isolation
            expect(animeSearchForMovie.total).toBe(0);
            expect(movieSearchForAnime.total).toBe(0);
        });
    });
});
