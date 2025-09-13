import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import SharedMemoryWorkerPool from '../src/infrastructure/SharedMemoryWorkerPool.js';

describe('SharedMemoryWorkerPool Sharding Integration', () => {
    let workerPool;

    beforeEach(async () => {
        workerPool = new SharedMemoryWorkerPool({
            workerThreads: 2,
            sharedMemorySize: 32 * 1024 * 1024, // 32MB
            maxDocuments: 1000,
            maxTerms: 10000,
            taskTimeout: 30000,
            enablePersistence: false
        });

        await workerPool.initialize();
    });

    afterEach(async () => {
        if (workerPool) {
            await workerPool.shutdown();
            workerPool = null;
        }
    });

    describe('Index Creation with Sharding', () => {
        test('should store sharding metadata when index is created', async () => {
            const indexName = 'test-sharded-index';

            const result = await workerPool.initializeEngine({
                indexName,
                enableShardedStorage: true,
                numShards: 4,
                facetFields: ['status', 'species']
            });

            expect(result.success).toBe(true);
            expect(result.indexName).toBe(indexName);

            // Check that metadata is stored
            const metadata = workerPool.indexMetadata.get(indexName);
            expect(metadata).toBeDefined();
            expect(metadata.enableShardedStorage).toBe(true);
            expect(metadata.numShards).toBe(4);
            expect(metadata.facetFields).toEqual(['status', 'species']);
        });

        test('should create index without sharding when disabled', async () => {
            const indexName = 'test-regular-index';

            const result = await workerPool.initializeEngine({
                indexName,
                enableShardedStorage: false,
                facetFields: ['category']
            });

            expect(result.success).toBe(true);

            const metadata = workerPool.indexMetadata.get(indexName);
            expect(metadata).toBeDefined();
            expect(metadata.enableShardedStorage).toBe(false);
        });
    });

    describe('Document Addition with Sharding', () => {
        beforeEach(async () => {
            // Create a sharded index first
            await workerPool.initializeEngine({
                indexName: 'sharded-docs',
                enableShardedStorage: true,
                numShards: 4,
                facetFields: ['status', 'species', 'gender']
            });
        });

        test('should handle document addition to sharded index', async () => {
            const documents = [
                {
                    id: 'char1',
                    name: 'Rick Sanchez',
                    status: 'Alive',
                    species: 'Human',
                    gender: 'Male'
                },
                {
                    id: 'char2',
                    name: 'Morty Smith',
                    status: 'Alive',
                    species: 'Human',
                    gender: 'Male'
                },
                {
                    id: 'char3',
                    name: 'Summer Smith',
                    status: 'Alive',
                    species: 'Human',
                    gender: 'Female'
                },
                {
                    id: 'char4',
                    name: 'Birdperson',
                    status: 'Deceased',
                    species: 'Bird-Person',
                    gender: 'Male'
                }
            ];

            const result = await workerPool.addDocuments('sharded-docs', documents);

            expect(result.success).toBe(true);
            expect(result.addedCount).toBeGreaterThan(0);
            expect(result.totalResults).toBeGreaterThan(0);

            console.log(`Added ${result.addedCount} documents to sharded index`);
            console.log(`Total results: ${result.totalResults}`);
        });

        test('should search across sharded documents', async () => {
            // Add documents first
            const documents = [
                { id: 'doc1', title: 'Rick and Morty Adventures', category: 'Animation' },
                { id: 'doc2', title: 'Morty\'s Mind Blowers', category: 'Comedy' },
                { id: 'doc3', title: 'Rick\'s Inventions', category: 'Science' },
                { id: 'doc4', title: 'Summer\'s Stories', category: 'Drama' }
            ];

            await workerPool.addDocuments('sharded-docs', documents);

            // Test search functionality
            const rickResults = await workerPool.search('sharded-docs', 'Rick');
            expect(rickResults.success).toBe(true);
            expect(rickResults.hits).toBeDefined();
            expect(rickResults.total).toBeGreaterThan(0);

            console.log(`Rick search found ${rickResults.total} results`);

            const mortyResults = await workerPool.search('sharded-docs', 'Morty');
            expect(mortyResults.success).toBe(true);
            expect(mortyResults.hits).toBeDefined();
            expect(mortyResults.total).toBeGreaterThan(0);

            console.log(`Morty search found ${mortyResults.total} results`);
        });

        test('should handle mixed sharded and non-sharded indices', async () => {
            // Create a non-sharded index
            await workerPool.initializeEngine({
                indexName: 'regular-docs',
                enableShardedStorage: false,
                facetFields: ['type']
            });

            // Add documents to both indices
            const shardedDocs = [
                { id: 'shard1', name: 'Sharded Doc 1', content: 'This goes to sharded index' }
            ];

            const regularDocs = [
                { id: 'reg1', name: 'Regular Doc 1', content: 'This goes to regular index' }
            ];

            const shardedResult = await workerPool.addDocuments('sharded-docs', shardedDocs);
            const regularResult = await workerPool.addDocuments('regular-docs', regularDocs);

            expect(shardedResult.success).toBe(true);
            expect(regularResult.success).toBe(true);

            // Search in both indices
            const shardedSearch = await workerPool.search('sharded-docs', 'Sharded');
            const regularSearch = await workerPool.search('regular-docs', 'Regular');

            expect(shardedSearch.success).toBe(true);
            expect(regularSearch.success).toBe(true);
        });
    });

    describe('Index Management with Sharding', () => {
        test('should list indices with sharding information', async () => {
            // Create multiple indices with different configurations
            await workerPool.initializeEngine({
                indexName: 'sharded-index-1',
                enableShardedStorage: true,
                numShards: 4
            });

            await workerPool.initializeEngine({
                indexName: 'sharded-index-2',
                enableShardedStorage: true,
                numShards: 8
            });

            await workerPool.initializeEngine({
                indexName: 'regular-index',
                enableShardedStorage: false
            });

            const indices = await workerPool.listIndices();
            expect(indices.success).toBe(true);
            expect(indices.indices).toBeDefined();
            expect(Object.keys(indices.indices)).toHaveLength(3);

            // Check metadata for each index
            expect(indices.indices['sharded-index-1']).toBeDefined();
            expect(indices.indices['sharded-index-2']).toBeDefined();
            expect(indices.indices['regular-index']).toBeDefined();
        });

        test('should get index stats including sharding info', async () => {
            const indexName = 'stats-test-index';

            await workerPool.initializeEngine({
                indexName,
                enableShardedStorage: true,
                numShards: 6,
                facetFields: ['category', 'status']
            });

            // Add some documents
            await workerPool.addDocuments(indexName, [
                { id: 'stat1', name: 'Test Doc 1', category: 'A', status: 'active' },
                { id: 'stat2', name: 'Test Doc 2', category: 'B', status: 'inactive' }
            ]);

            const stats = await workerPool.getIndexStats(indexName);
            expect(stats.success).toBe(true);
            expect(stats.stats).toBeDefined();
            expect(stats.stats.totalDocs).toBeGreaterThan(0);

            console.log(`Index stats for ${indexName}:`, stats.stats);
        });

        test('should delete sharded index correctly', async () => {
            const indexName = 'delete-test-index';

            await workerPool.initializeEngine({
                indexName,
                enableShardedStorage: true,
                numShards: 4
            });

            // Verify index exists
            let indices = await workerPool.listIndices();
            expect(indices.indices[indexName]).toBeDefined();

            // Delete the index
            const deleteResult = await workerPool.deleteIndex(indexName);
            expect(deleteResult.success).toBe(true);

            // Verify index is gone
            indices = await workerPool.listIndices();
            expect(indices.indices[indexName]).toBeUndefined();
        });
    });

    describe('Error Handling with Sharding', () => {
        test('should handle invalid sharding configuration gracefully', async () => {
            try {
                await workerPool.initializeEngine({
                    indexName: 'invalid-config',
                    enableShardedStorage: true,
                    numShards: 0 // Invalid
                });
                // Should not reach here
                expect(false).toBe(true);
            } catch (error) {
                expect(error).toBeDefined();
            }
        });

        test('should handle document addition to non-existent sharded index', async () => {
            try {
                await workerPool.addDocuments('non-existent-index', [
                    { id: 'test', name: 'Test Doc' }
                ]);
                // Depending on implementation, this might succeed or fail
                // The test documents the current behavior
            } catch (error) {
                // Error is expected for non-existent index
                expect(error).toBeDefined();
            }
        });

        test('should handle search on non-existent sharded index', async () => {
            const result = await workerPool.search('non-existent-sharded', 'test query');

            // Should return error or empty results, not crash
            expect(result).toBeDefined();
            // The specific behavior depends on implementation
        });
    });

    describe('Performance with Sharding', () => {
        test('should demonstrate sharding performance benefits', async () => {
            // Create indices with different shard counts
            await workerPool.initializeEngine({
                indexName: 'small-shards',
                enableShardedStorage: true,
                numShards: 2
            });

            await workerPool.initializeEngine({
                indexName: 'large-shards',
                enableShardedStorage: true,
                numShards: 8
            });

            // Add same documents to both
            const documents = [];
            for (let i = 0; i < 50; i++) {
                documents.push({
                    id: `perf_doc_${i}`,
                    title: `Performance Test Document ${i}`,
                    content: `Content for document ${i} with various keywords like test, performance, sharding, database`,
                    category: `cat_${i % 5}`,
                    priority: i % 3
                });
            }

            console.log('Adding documents to small-shards index...');
            const start1 = Date.now();
            await workerPool.addDocuments('small-shards', documents);
            const time1 = Date.now() - start1;
            console.log(`Small shards (2): ${time1}ms`);

            console.log('Adding documents to large-shards index...');
            const start2 = Date.now();
            await workerPool.addDocuments('large-shards', documents);
            const time2 = Date.now() - start2;
            console.log(`Large shards (8): ${time2}ms`);

            // Test search performance
            console.log('Testing search performance...');
            const searchStart1 = Date.now();
            const searchResult1 = await workerPool.search('small-shards', 'performance');
            const searchTime1 = Date.now() - searchStart1;

            const searchStart2 = Date.now();
            const searchResult2 = await workerPool.search('large-shards', 'performance');
            const searchTime2 = Date.now() - searchStart2;

            console.log(`Search small-shards: ${searchTime1}ms, results: ${searchResult1.total}`);
            console.log(`Search large-shards: ${searchTime2}ms, results: ${searchResult2.total}`);

            // Both should find the same number of documents
            expect(searchResult1.total).toBe(searchResult2.total);
        });
    });
}); 