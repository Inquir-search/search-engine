import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import SharedMemoryWorkerPool from '../src/infrastructure/SharedMemoryWorkerPool';

describe('Search Filtering and Multi-Index Tests', () => {
    let workerPool: SharedMemoryWorkerPool;

    beforeEach(async () => {
        workerPool = new SharedMemoryWorkerPool({
            workerThreads: 2,
            taskTimeout: 5000,
            sharedMemorySize: 50 * 1024 * 1024, // 50MB
            enablePersistence: false
        });
        await workerPool.initialize();
    });

    afterEach(async () => {
        if (workerPool) {
            await workerPool.shutdown();
        }
    });

    describe('Multi-Index Document Isolation', () => {
        it('should store documents in separate indices without conflicts', async () => {
            // Add documents to rickandmorty index
            const rickDocs = [
                { id: '1', name: 'Rick Sanchez', species: 'Human', status: 'Alive' },
                { id: '2', name: 'Morty Smith', species: 'Human', status: 'Alive' },
                { id: '3', name: 'Summer Smith', species: 'Human', status: 'Alive' }
            ];

            const rickResult = await workerPool.addDocuments('rickandmorty', rickDocs);
            expect(rickResult.success).toBe(true);
            expect(rickResult.totalResults).toBe(3);

            // Add documents to anime index
            const animeDocs = [
                { id: '1', name: 'Naruto Uzumaki', series: 'Naruto', status: 'Alive' },
                { id: '2', name: 'Goku', series: 'Dragon Ball', status: 'Alive' },
                { id: '3', name: 'Luffy', series: 'One Piece', status: 'Alive' }
            ];

            const animeResult = await workerPool.addDocuments('anime', animeDocs);
            expect(animeResult.success).toBe(true);
            expect(animeResult.totalResults).toBe(3);

            // Verify documents are stored with correct indexName
            const rickSearch = await workerPool.search('rickandmorty', { match_all: {} });
            expect(rickSearch.success).toBe(true);
            expect(rickSearch.hits).toHaveLength(3);
            expect(rickSearch.hits.every((doc: any) => doc.indexName === 'rickandmorty')).toBe(true);

            const animeSearch = await workerPool.search('anime', { match_all: {} });
            expect(animeSearch.success).toBe(true);
            expect(animeSearch.hits).toHaveLength(3);
            expect(animeSearch.hits.every((doc: any) => doc.indexName === 'anime')).toBe(true);
        });

        it('should handle duplicate document IDs across different indices', async () => {
            // Add document with ID '1' to rickandmorty index
            const rickDoc = { id: '1', name: 'Rick Sanchez', species: 'Human' };
            const rickResult = await workerPool.addDocuments('rickandmorty', [rickDoc]);
            expect(rickResult.success).toBe(true);

            // Add document with same ID '1' to anime index
            const animeDoc = { id: '1', name: 'Naruto Uzumaki', series: 'Naruto' };
            const animeResult = await workerPool.addDocuments('anime', [animeDoc]);
            expect(animeResult.success).toBe(true);

            // Both documents should exist with composite IDs
            const rickSearch = await workerPool.search('rickandmorty', { match_all: {} });
            expect(rickSearch.success).toBe(true);
            expect(rickSearch.hits).toHaveLength(1);
            expect(rickSearch.hits[0].name).toBe('Rick Sanchez');
            expect(rickSearch.hits[0].indexName).toBe('rickandmorty');

            const animeSearch = await workerPool.search('anime', { match_all: {} });
            expect(animeSearch.success).toBe(true);
            expect(animeSearch.hits).toHaveLength(1);
            expect(animeSearch.hits[0].name).toBe('Naruto Uzumaki');
            expect(animeSearch.hits[0].indexName).toBe('anime');
        });
    });

    describe('Search Filtering by Index Name', () => {
        beforeEach(async () => {
            // Setup test data with multiple indices
            const rickDocs = [
                { id: '1', name: 'Rick Sanchez', species: 'Human', status: 'Alive' },
                { id: '2', name: 'Morty Smith', species: 'Human', status: 'Alive' },
                { id: '3', name: 'Summer Smith', species: 'Human', status: 'Alive' }
            ];

            const animeDocs = [
                { id: '1', name: 'Naruto Uzumaki', series: 'Naruto', status: 'Alive' },
                { id: '2', name: 'Goku', series: 'Dragon Ball', status: 'Alive' },
                { id: '3', name: 'Luffy', series: 'One Piece', status: 'Alive' }
            ];

            await workerPool.addDocuments('rickandmorty', rickDocs);
            await workerPool.addDocuments('anime', animeDocs);
        });

        it('should only return documents from the specified index', async () => {
            const rickSearch = await workerPool.search('rickandmorty', { match_all: {} });
            expect(rickSearch.success).toBe(true);
            expect(rickSearch.hits).toHaveLength(3);
            expect(rickSearch.hits.every((doc: any) => doc.indexName === 'rickandmorty')).toBe(true);
            expect(rickSearch.hits.every((doc: any) => doc.species === 'Human')).toBe(true);

            const animeSearch = await workerPool.search('anime', { match_all: {} });
            expect(animeSearch.success).toBe(true);
            expect(animeSearch.hits).toHaveLength(3);
            expect(animeSearch.hits.every((doc: any) => doc.indexName === 'anime')).toBe(true);
            expect(animeSearch.hits.every((doc: any) => doc.series)).toBe(true);
        });

        it('should filter string queries by index name', async () => {
            const rickSearch = await workerPool.search('rickandmorty', 'Rick');
            expect(rickSearch.success).toBe(true);
            expect(rickSearch.hits).toHaveLength(1);
            expect(rickSearch.hits[0].name).toBe('Rick Sanchez');
            expect(rickSearch.hits[0].indexName).toBe('rickandmorty');

            const animeSearch = await workerPool.search('anime', 'Naruto');
            expect(animeSearch.success).toBe(true);
            expect(animeSearch.hits).toHaveLength(1);
            expect(animeSearch.hits[0].name).toBe('Naruto Uzumaki');
            expect(animeSearch.hits[0].indexName).toBe('anime');
        });

        it('should filter wildcard queries by index name', async () => {
            const rickSearch = await workerPool.search('rickandmorty', '*');
            expect(rickSearch.success).toBe(true);
            expect(rickSearch.hits).toHaveLength(3);
            expect(rickSearch.hits.every((doc: any) => doc.indexName === 'rickandmorty')).toBe(true);

            const animeSearch = await workerPool.search('anime', '*');
            expect(animeSearch.success).toBe(true);
            expect(animeSearch.hits).toHaveLength(3);
            expect(animeSearch.hits.every((doc: any) => doc.indexName === 'anime')).toBe(true);
        });

        it('should not return documents from other indices', async () => {
            // Search rickandmorty index should not return anime documents
            const rickSearch = await workerPool.search('rickandmorty', 'Naruto');
            expect(rickSearch.success).toBe(true);
            expect(rickSearch.hits).toHaveLength(0);

            // Search anime index should not return rickandmorty documents
            const animeSearch = await workerPool.search('anime', 'Rick');
            expect(animeSearch.success).toBe(true);
            expect(animeSearch.hits).toHaveLength(0);
        });
    });

    describe('Complex Query Filtering', () => {
        beforeEach(async () => {
            // Setup test data with more complex documents
            const rickDocs = [
                { id: '1', name: 'Rick Sanchez', species: 'Human', status: 'Alive', origin: 'Earth C-137' },
                { id: '2', name: 'Morty Smith', species: 'Human', status: 'Alive', origin: 'Earth C-137' },
                { id: '3', name: 'Summer Smith', species: 'Human', status: 'Alive', origin: 'Earth C-137' },
                { id: '4', name: 'Beth Smith', species: 'Human', status: 'Alive', origin: 'Earth C-137' }
            ];

            const animeDocs = [
                { id: '1', name: 'Naruto Uzumaki', series: 'Naruto', status: 'Alive', village: 'Konoha' },
                { id: '2', name: 'Goku', series: 'Dragon Ball', status: 'Alive', planet: 'Earth' },
                { id: '3', name: 'Luffy', series: 'One Piece', status: 'Alive', crew: 'Straw Hat Pirates' },
                { id: '4', name: 'Ichigo', series: 'Bleach', status: 'Alive', occupation: 'Soul Reaper' }
            ];

            await workerPool.addDocuments('rickandmorty', rickDocs);
            await workerPool.addDocuments('anime', animeDocs);
        });

        it('should handle match queries with proper filtering', async () => {
            const rickSearch = await workerPool.search('rickandmorty', { match: { field: 'name', value: 'Rick' } });
            expect(rickSearch.success).toBe(true);
            expect(rickSearch.hits).toHaveLength(1);
            expect(rickSearch.hits[0].name).toBe('Rick Sanchez');
            expect(rickSearch.hits[0].indexName).toBe('rickandmorty');

            const animeSearch = await workerPool.search('anime', { match: { field: 'series', value: 'Naruto' } });
            expect(animeSearch.success).toBe(true);
            expect(animeSearch.hits).toHaveLength(1);
            expect(animeSearch.hits[0].name).toBe('Naruto Uzumaki');
            expect(animeSearch.hits[0].indexName).toBe('anime');
        });

        it('should handle term queries with proper filtering', async () => {
            const rickSearch = await workerPool.search('rickandmorty', { term: { field: 'species', value: 'Human' } });
            expect(rickSearch.success).toBe(true);
            expect(rickSearch.hits).toHaveLength(4);
            expect(rickSearch.hits.every((doc: any) => doc.indexName === 'rickandmorty')).toBe(true);
            expect(rickSearch.hits.every((doc: any) => doc.species === 'Human')).toBe(true);

            const animeSearch = await workerPool.search('anime', { term: { field: 'status', value: 'Alive' } });
            expect(animeSearch.success).toBe(true);
            expect(animeSearch.hits).toHaveLength(4);
            expect(animeSearch.hits.every((doc: any) => doc.indexName === 'anime')).toBe(true);
            expect(animeSearch.hits.every((doc: any) => doc.status === 'Alive')).toBe(true);
        });

        it('should handle wildcard queries with proper filtering', async () => {
            const rickSearch = await workerPool.search('rickandmorty', { wildcard: { field: 'name', value: '*Rick*' } });
            expect(rickSearch.success).toBe(true);
            expect(rickSearch.hits).toHaveLength(1);
            expect(rickSearch.hits[0].name).toBe('Rick Sanchez');
            expect(rickSearch.hits[0].indexName).toBe('rickandmorty');

            const animeSearch = await workerPool.search('anime', { wildcard: { field: 'name', value: '*Naruto*' } });
            expect(animeSearch.success).toBe(true);
            expect(animeSearch.hits).toHaveLength(1);
            expect(animeSearch.hits[0].name).toBe('Naruto Uzumaki');
            expect(animeSearch.hits[0].indexName).toBe('anime');
        });
    });

    describe('Pagination and Performance', () => {
        beforeEach(async () => {
            // Create larger datasets for pagination tests
            const rickDocs = Array.from({ length: 50 }, (_, i) => ({
                id: `${i + 1}`,
                name: `Character ${i + 1}`,
                species: 'Human',
                status: 'Alive',
                indexName: 'rickandmorty'
            }));

            const animeDocs = Array.from({ length: 30 }, (_, i) => ({
                id: `${i + 1}`,
                name: `Anime Character ${i + 1}`,
                series: 'Test Series',
                status: 'Alive',
                indexName: 'anime'
            }));

            await workerPool.addDocuments('rickandmorty', rickDocs);
            await workerPool.addDocuments('anime', animeDocs);
        });

        it('should handle pagination correctly for each index', async () => {
            // Test first page of rickandmorty
            const rickPage1 = await workerPool.search('rickandmorty', { match_all: {} }, { from: 0, size: 10 });
            expect(rickPage1.success).toBe(true);
            expect(rickPage1.hits).toHaveLength(10);
            expect(rickPage1.total).toBe(50);
            expect(rickPage1.from).toBe(0);
            expect(rickPage1.size).toBe(10);
            expect(rickPage1.hits.every((doc: any) => doc.indexName === 'rickandmorty')).toBe(true);

            // Test second page of rickandmorty
            const rickPage2 = await workerPool.search('rickandmorty', { match_all: {} }, { from: 10, size: 10 });
            expect(rickPage2.success).toBe(true);
            expect(rickPage2.hits).toHaveLength(10);
            expect(rickPage2.total).toBe(50);
            expect(rickPage2.from).toBe(10);
            expect(rickPage2.size).toBe(10);

            // Test anime pagination
            const animePage1 = await workerPool.search('anime', { match_all: {} }, { from: 0, size: 5 });
            expect(animePage1.success).toBe(true);
            expect(animePage1.hits).toHaveLength(5);
            expect(animePage1.total).toBe(30);
            expect(animePage1.hits.every((doc: any) => doc.indexName === 'anime')).toBe(true);
        });

        it('should maintain index isolation during concurrent searches', async () => {
            // Perform concurrent searches on different indices
            const [rickSearch, animeSearch] = await Promise.all([
                workerPool.search('rickandmorty', { match_all: {} }, { size: 100 }),
                workerPool.search('anime', { match_all: {} }, { size: 100 })
            ]);

            expect(rickSearch.success).toBe(true);
            expect(animeSearch.success).toBe(true);

            expect(rickSearch.hits).toHaveLength(50);
            expect(animeSearch.hits).toHaveLength(30);

            expect(rickSearch.hits.every((doc: any) => doc.indexName === 'rickandmorty')).toBe(true);
            expect(animeSearch.hits.every((doc: any) => doc.indexName === 'anime')).toBe(true);
        });
    });

    describe('Error Handling', () => {
        it('should handle searches on non-existent indices gracefully', async () => {
            const result = await workerPool.search('nonexistent', { match_all: {} });
            expect(result.success).toBe(false);
            expect(result.error).toContain('not found');
        });

        it('should handle empty queries gracefully', async () => {
            await workerPool.addDocuments('test', [{ id: '1', name: 'Test' }]);

            const result = await workerPool.search('test', '');
            expect(result.success).toBe(true);
            expect(result.hits).toHaveLength(0);
        });

        it('should handle null/undefined queries gracefully', async () => {
            await workerPool.addDocuments('test', [{ id: '1', name: 'Test' }]);

            const result = await workerPool.search('test', null);
            expect(result.success).toBe(true);
            expect(result.hits).toHaveLength(0);
        });
    });

    describe('Index Statistics and Metadata', () => {
        it('should provide correct statistics for each index', async () => {
            const rickDocs = [
                { id: '1', name: 'Rick Sanchez', species: 'Human' },
                { id: '2', name: 'Morty Smith', species: 'Human' }
            ];

            const animeDocs = [
                { id: '1', name: 'Naruto Uzumaki', series: 'Naruto' }
            ];

            await workerPool.addDocuments('rickandmorty', rickDocs);
            await workerPool.addDocuments('anime', animeDocs);

            // Get statistics
            const stats = workerPool.getStats();
            expect(stats.totalIndices).toBe(2);
            expect(stats.totalDocuments).toBe(3);
            expect(stats.indexStats).toHaveProperty('rickandmorty');
            expect(stats.indexStats).toHaveProperty('anime');
            expect(stats.indexStats.rickandmorty.documentCount).toBe(2);
            expect(stats.indexStats.anime.documentCount).toBe(1);
        });
    });
});
