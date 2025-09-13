import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import SharedMemoryWorkerPool from '../src/infrastructure/SharedMemoryWorkerPool';

describe('Facet Isolation Tests', () => {
    let workerPool: SharedMemoryWorkerPool;

    beforeEach(async () => {
        workerPool = new SharedMemoryWorkerPool({
            numWorkers: 2,
            enableShardedStorage: false
        });
    });

    afterEach(async () => {
        // WorkerPool doesn't have a terminate method, just let it be garbage collected
    });

    it('should isolate facets between different indices', async () => {
        // Add documents to 'anime' index with specific genres
        const animeResult = await workerPool.addDocuments('anime', [
            { id: '1', name: 'Naruto', genres: ['Action', 'Adventure'], type: 'TV' },
            { id: '2', name: 'One Piece', genres: ['Action', 'Adventure'], type: 'TV' },
            { id: '3', name: 'Attack on Titan', genres: ['Action', 'Drama'], type: 'TV' }
        ]);
        expect(animeResult.success).toBe(true);

        // Add documents to 'movies' index with different genres
        const moviesResult = await workerPool.addDocuments('movies', [
            { id: '1', name: 'Inception', genres: ['Sci-Fi', 'Thriller'], type: 'Movie' },
            { id: '2', name: 'The Matrix', genres: ['Sci-Fi', 'Action'], type: 'Movie' },
            { id: '3', name: 'Titanic', genres: ['Romance', 'Drama'], type: 'Movie' }
        ]);
        expect(moviesResult.success).toBe(true);

        // Search anime index with aggregations
        const animeSearch = await workerPool.search('anime', { match_all: {} }, {
            aggregations: {
                genres: {
                    terms: {
                        field: 'genres',
                        size: 10
                    }
                },
                types: {
                    terms: {
                        field: 'type',
                        size: 10
                    }
                }
            }
        });

        expect(animeSearch.success).toBe(true);
        expect(animeSearch.total).toBe(3);
        expect(animeSearch.aggregations.genres.buckets).toHaveLength(3); // Action, Adventure, Drama
        expect(animeSearch.aggregations.types.buckets).toHaveLength(1); // TV only

        // Search movies index with aggregations
        const moviesSearch = await workerPool.search('movies', { match_all: {} }, {
            aggregations: {
                genres: {
                    terms: {
                        field: 'genres',
                        size: 10
                    }
                },
                types: {
                    terms: {
                        field: 'type',
                        size: 10
                    }
                }
            }
        });

        expect(moviesSearch.success).toBe(true);
        expect(moviesSearch.total).toBe(3);
        expect(moviesSearch.aggregations.genres.buckets).toHaveLength(5); // Sci-Fi, Thriller, Action, Romance, Drama
        expect(moviesSearch.aggregations.types.buckets).toHaveLength(1); // Movie only

        // Verify isolation - anime should not have Movie type
        const animeTypes = animeSearch.aggregations.types.buckets.map((b: any) => b.key);
        const moviesTypes = moviesSearch.aggregations.types.buckets.map((b: any) => b.key);

        expect(animeTypes).not.toContain('Movie');
        expect(moviesTypes).not.toContain('TV');

        // Verify genre isolation - check that each index only has its own genres
        const animeGenres = animeSearch.aggregations.genres.buckets.map((b: any) => b.key);
        const moviesGenres = moviesSearch.aggregations.genres.buckets.map((b: any) => b.key);

        // Anime should have Action, Adventure, Drama
        expect(animeGenres).toContain('Action');
        expect(animeGenres).toContain('Adventure');
        expect(animeGenres).toContain('Drama');

        // Movies should have Sci-Fi, Thriller, Romance
        expect(moviesGenres).toContain('Sci-Fi');
        expect(moviesGenres).toContain('Thriller');
        expect(moviesGenres).toContain('Romance');

        // Action appears in both, but Drama should be isolated
        expect(animeGenres).toContain('Drama');
        expect(moviesGenres).toContain('Drama'); // This should be true since both have Drama

        // But Sci-Fi should only be in movies
        expect(animeGenres).not.toContain('Sci-Fi');
        expect(moviesGenres).toContain('Sci-Fi');

        // And Adventure should only be in anime
        expect(animeGenres).toContain('Adventure');
        expect(moviesGenres).not.toContain('Adventure');
    });

    it('should calculate correct facet counts for each index', async () => {
        // Add documents to 'anime' index
        await workerPool.addDocuments('anime', [
            { id: '1', name: 'Naruto', genres: ['Action', 'Adventure'], status: 'Ongoing' },
            { id: '2', name: 'One Piece', genres: ['Action', 'Adventure'], status: 'Ongoing' },
            { id: '3', name: 'Attack on Titan', genres: ['Action', 'Drama'], status: 'Completed' }
        ]);

        // Add documents to 'movies' index
        await workerPool.addDocuments('movies', [
            { id: '1', name: 'Inception', genres: ['Sci-Fi', 'Thriller'], status: 'Released' },
            { id: '2', name: 'The Matrix', genres: ['Sci-Fi', 'Action'], status: 'Released' },
            { id: '3', name: 'Titanic', genres: ['Romance', 'Drama'], status: 'Released' }
        ]);

        // Search anime index
        const animeSearch = await workerPool.search('anime', { match_all: {} }, {
            aggregations: {
                genres: {
                    terms: {
                        field: 'genres',
                        size: 10
                    }
                },
                status: {
                    terms: {
                        field: 'status',
                        size: 10
                    }
                }
            }
        });

        // Search movies index
        const moviesSearch = await workerPool.search('movies', { match_all: {} }, {
            aggregations: {
                genres: {
                    terms: {
                        field: 'genres',
                        size: 10
                    }
                },
                status: {
                    terms: {
                        field: 'status',
                        size: 10
                    }
                }
            }
        });

        // Verify anime facet counts
        const animeGenreCounts = animeSearch.aggregations.genres.buckets.reduce((acc: any, bucket: any) => {
            acc[bucket.key] = bucket.doc_count;
            return acc;
        }, {});

        expect(animeGenreCounts['Action']).toBe(3); // Appears in all 3 anime
        expect(animeGenreCounts['Adventure']).toBe(2); // Appears in 2 anime
        expect(animeGenreCounts['Drama']).toBe(1); // Appears in 1 anime

        // Verify movies facet counts
        const moviesGenreCounts = moviesSearch.aggregations.genres.buckets.reduce((acc: any, bucket: any) => {
            acc[bucket.key] = bucket.doc_count;
            return acc;
        }, {});

        expect(moviesGenreCounts['Sci-Fi']).toBe(2); // Appears in 2 movies
        expect(moviesGenreCounts['Action']).toBe(1); // Appears in 1 movie
        expect(moviesGenreCounts['Thriller']).toBe(1); // Appears in 1 movie
        expect(moviesGenreCounts['Romance']).toBe(1); // Appears in 1 movie
        expect(moviesGenreCounts['Drama']).toBe(1); // Appears in 1 movie

        // Verify status isolation
        const animeStatusCounts = animeSearch.aggregations.status.buckets.reduce((acc: any, bucket: any) => {
            acc[bucket.key] = bucket.doc_count;
            return acc;
        }, {});

        const moviesStatusCounts = moviesSearch.aggregations.status.buckets.reduce((acc: any, bucket: any) => {
            acc[bucket.key] = bucket.doc_count;
            return acc;
        }, {});

        expect(animeStatusCounts['Ongoing']).toBe(2);
        expect(animeStatusCounts['Completed']).toBe(1);
        expect(animeStatusCounts['Released']).toBeUndefined();

        expect(moviesStatusCounts['Released']).toBe(3);
        expect(moviesStatusCounts['Ongoing']).toBeUndefined();
        expect(moviesStatusCounts['Completed']).toBeUndefined();
    });
});
