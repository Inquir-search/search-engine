/**
 * Comprehensive multi-index functionality test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import SharedMemoryWorkerPool from '../src/infrastructure/SharedMemoryWorkerPool';
import SharedMemoryStore from '../src/infrastructure/SharedMemoryStore';

describe('Multi-Index Comprehensive Test', () => {
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

    describe('Multi-Index Functionality', () => {
        it('should support multiple indices simultaneously', async () => {
            console.log('🧪 Testing multi-index functionality...');

            // Add documents to different indices
            const animeDocs = [
                { id: 'anime_1', name: 'Naruto', type: 'TV', genre: 'Action' },
                { id: 'anime_2', name: 'One Piece', type: 'TV', genre: 'Adventure' }
            ];

            const movieDocs = [
                { id: 'movie_1', name: 'Inception', type: 'Movie', genre: 'Sci-Fi' },
                { id: 'movie_2', name: 'The Matrix', type: 'Movie', genre: 'Action' }
            ];

            const bookDocs = [
                { id: 'book_1', name: '1984', type: 'Book', genre: 'Dystopian' },
                { id: 'book_2', name: 'Brave New World', type: 'Book', genre: 'Dystopian' }
            ];

            // Add documents to all indices
            const animeResult = await workerPool.addDocuments('anime', animeDocs);
            const movieResult = await workerPool.addDocuments('movies', movieDocs);
            const bookResult = await workerPool.addDocuments('books', bookDocs);

            console.log('Add results:', {
                anime: animeResult.success,
                movies: movieResult.success,
                books: bookResult.success
            });

            // Verify all additions succeeded
            expect(animeResult.success).toBe(true);
            expect(movieResult.success).toBe(true);
            expect(bookResult.success).toBe(true);

            // Test searches for each index
            const animeSearch = await workerPool.search('anime', { match_all: {} });
            const movieSearch = await workerPool.search('movies', { match_all: {} });
            const bookSearch = await workerPool.search('books', { match_all: {} });

            console.log('Search results:', {
                anime: { total: animeSearch.total, hits: animeSearch.hits?.length },
                movies: { total: movieSearch.total, hits: movieSearch.hits?.length },
                books: { total: bookSearch.total, hits: bookSearch.hits?.length }
            });

            // Verify each index returns only its documents
            expect(animeSearch.success).toBe(true);
            expect(animeSearch.total).toBe(2);
            expect(animeSearch.hits?.every(h => h.indexName === 'anime')).toBe(true);

            expect(movieSearch.success).toBe(true);
            expect(movieSearch.total).toBe(2);
            expect(movieSearch.hits?.every(h => h.indexName === 'movies')).toBe(true);

            expect(bookSearch.success).toBe(true);
            expect(bookSearch.total).toBe(2);
            expect(bookSearch.hits?.every(h => h.indexName === 'books')).toBe(true);
        });

        it('should handle string queries correctly for all indices', async () => {
            console.log('🧪 Testing string queries for all indices...');

            // Add documents to different indices
            const animeDocs = [
                { id: 'anime_str_1', name: 'Naruto String', type: 'TV' },
                { id: 'anime_str_2', name: 'One Piece String', type: 'TV' }
            ];

            const movieDocs = [
                { id: 'movie_str_1', name: 'Inception String', type: 'Movie' },
                { id: 'movie_str_2', name: 'Matrix String', type: 'Movie' }
            ];

            await workerPool.addDocuments('anime', animeDocs);
            await workerPool.addDocuments('movies', movieDocs);

            // Test string queries
            const animeStringSearch = await workerPool.search('anime', 'Naruto');
            const movieStringSearch = await workerPool.search('movies', 'Inception');

            console.log('String search results:', {
                anime: { total: animeStringSearch.total, hits: animeStringSearch.hits?.length },
                movies: { total: movieStringSearch.total, hits: movieStringSearch.hits?.length }
            });

            // Verify string queries work
            expect(animeStringSearch.success).toBe(true);
            expect(animeStringSearch.total).toBeGreaterThan(0);
            expect(animeStringSearch.hits?.every(h => h.indexName === 'anime')).toBe(true);

            expect(movieStringSearch.success).toBe(true);
            expect(movieStringSearch.total).toBeGreaterThan(0);
            expect(movieStringSearch.hits?.every(h => h.indexName === 'movies')).toBe(true);
        });

        it('should handle wildcard queries correctly for all indices', async () => {
            console.log('🧪 Testing wildcard queries for all indices...');

            // Add documents to different indices
            const animeDocs = [
                { id: 'anime_wild_1', name: 'Naruto Wildcard', type: 'TV' },
                { id: 'anime_wild_2', name: 'One Piece Wildcard', type: 'TV' }
            ];

            const movieDocs = [
                { id: 'movie_wild_1', name: 'Inception Wildcard', type: 'Movie' },
                { id: 'movie_wild_2', name: 'Matrix Wildcard', type: 'Movie' }
            ];

            await workerPool.addDocuments('anime', animeDocs);
            await workerPool.addDocuments('movies', movieDocs);

            // Test wildcard queries
            const animeWildcardSearch = await workerPool.search('anime', '*');
            const movieWildcardSearch = await workerPool.search('movies', '*');

            console.log('Wildcard search results:', {
                anime: { total: animeWildcardSearch.total, hits: animeWildcardSearch.hits?.length },
                movies: { total: movieWildcardSearch.total, hits: movieWildcardSearch.hits?.length }
            });

            // Verify wildcard queries work
            expect(animeWildcardSearch.success).toBe(true);
            expect(animeWildcardSearch.total).toBe(2);
            expect(animeWildcardSearch.hits?.every(h => h.indexName === 'anime')).toBe(true);

            expect(movieWildcardSearch.success).toBe(true);
            expect(movieWildcardSearch.total).toBe(2);
            expect(movieWildcardSearch.hits?.every(h => h.indexName === 'movies')).toBe(true);
        });

        it('should maintain proper cross-index isolation', async () => {
            console.log('🧪 Testing cross-index isolation...');

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

            // Test cross-index searches (should return 0 results)
            const animeSearchForMovie = await workerPool.search('anime', 'Inception');
            const movieSearchForAnime = await workerPool.search('movies', 'Naruto');

            console.log('Cross-index search results:', {
                animeSearchForMovie: { total: animeSearchForMovie.total, hits: animeSearchForMovie.hits?.length },
                movieSearchForAnime: { total: movieSearchForAnime.total, hits: movieSearchForAnime.hits?.length }
            });

            // Verify cross-index isolation
            expect(animeSearchForMovie.success).toBe(true);
            expect(animeSearchForMovie.total).toBe(0);

            expect(movieSearchForAnime.success).toBe(true);
            expect(movieSearchForAnime.total).toBe(0);
        });

        it('should handle concurrent operations on different indices', async () => {
            console.log('🧪 Testing concurrent operations...');

            // Add documents to different indices concurrently
            const animeDocs = [
                { id: 'anime_concurrent_1', name: 'Naruto Concurrent', type: 'TV' },
                { id: 'anime_concurrent_2', name: 'One Piece Concurrent', type: 'TV' }
            ];

            const movieDocs = [
                { id: 'movie_concurrent_1', name: 'Inception Concurrent', type: 'Movie' },
                { id: 'movie_concurrent_2', name: 'Matrix Concurrent', type: 'Movie' }
            ];

            // Add documents concurrently
            const [animeResult, movieResult] = await Promise.all([
                workerPool.addDocuments('anime', animeDocs),
                workerPool.addDocuments('movies', movieDocs)
            ]);

            console.log('Concurrent add results:', {
                anime: animeResult.success,
                movies: movieResult.success
            });

            // Verify both additions succeeded
            expect(animeResult.success).toBe(true);
            expect(movieResult.success).toBe(true);

            // Search both indices concurrently
            const [animeSearch, movieSearch] = await Promise.all([
                workerPool.search('anime', { match_all: {} }),
                workerPool.search('movies', { match_all: {} })
            ]);

            console.log('Concurrent search results:', {
                anime: { total: animeSearch.total, hits: animeSearch.hits?.length },
                movies: { total: movieSearch.total, hits: movieSearch.hits?.length }
            });

            // Verify both searches succeeded
            expect(animeSearch.success).toBe(true);
            expect(animeSearch.total).toBe(2);
            expect(animeSearch.hits?.every(h => h.indexName === 'anime')).toBe(true);

            expect(movieSearch.success).toBe(true);
            expect(movieSearch.total).toBe(2);
            expect(movieSearch.hits?.every(h => h.indexName === 'movies')).toBe(true);
        });
    });
});
