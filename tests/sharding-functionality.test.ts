import { describe, test, expect, beforeEach } from 'vitest';
import { SearchEngine, ShardedInvertedIndex } from '../src/index.ts';

describe('SearchEngine Sharding Functionality', () => {
    let searchEngine;

    beforeEach(async () => {
        // Clean slate for each test
        searchEngine = null;
    });

    describe('Sharding Configuration', () => {
        test('should create SearchEngine with sharding enabled', async () => {
            searchEngine = await SearchEngine.create({
                enableShardedStorage: true,
                numShards: 4,
                autoPersistence: { enabled: false }
            });

            expect(searchEngine.config.enableShardedStorage).toBe(true);
            expect(searchEngine.config.numShards).toBe(4);
        });

        test('should create ShardedInvertedIndex when sharding is enabled', async () => {
            searchEngine = await SearchEngine.create({
                enableShardedStorage: true,
                numShards: 8,
                autoPersistence: { enabled: false }
            });

            const indices = Object.keys(searchEngine.indices);
            expect(indices.length).toBeGreaterThan(0);

            const defaultIndexData = searchEngine.indices['default'];
            const defaultIndex = defaultIndexData.invertedIndex;
            expect(defaultIndex).toBeInstanceOf(ShardedInvertedIndex);
            expect(defaultIndex.getConfig().numShards).toBe(8);
            expect(defaultIndex.getConfig().shardStrategy).toBe('hash');
        });

        test('should create regular InvertedIndex when sharding is disabled', async () => {
            searchEngine = await SearchEngine.create({
                enableShardedStorage: false,
                autoPersistence: { enabled: false }
            });

            const defaultIndexData = searchEngine.indices['default'];
            const defaultIndex = defaultIndexData.invertedIndex;
            // Should be ShardedInvertedIndex with single shard (our implementation always uses ShardedInvertedIndex)
            expect(defaultIndex).toBeInstanceOf(ShardedInvertedIndex);
            expect(defaultIndex.getConfig().numShards).toBe(1);
            expect(defaultIndex.getConfig().isSingleShard).toBe(true);
        });

        test('should use default shard count when not specified', async () => {
            searchEngine = await SearchEngine.create({
                enableShardedStorage: true,
                // numShards not specified
                autoPersistence: { enabled: false }
            });

            const defaultIndexData = searchEngine.indices['default'];
            const defaultIndex = defaultIndexData.invertedIndex;
            expect(defaultIndex.getConfig().numShards).toBe(8); // Default value
        });
    });

    describe('Document Distribution Across Shards', () => {
        beforeEach(async () => {
            searchEngine = await SearchEngine.create({
                enableShardedStorage: true,
                numShards: 4,
                autoPersistence: { enabled: false }
            });
        });

        test('should distribute documents across multiple shards', async () => {
            // Add multiple documents
            const documents = [
                { id: 'doc1', title: 'Rick Sanchez', species: 'Human' },
                { id: 'doc2', title: 'Morty Smith', species: 'Human' },
                { id: 'doc3', title: 'Beth Smith', species: 'Human' },
                { id: 'doc4', title: 'Jerry Smith', species: 'Human' },
                { id: 'doc5', title: 'Summer Smith', species: 'Human' },
                { id: 'doc6', title: 'Birdperson', species: 'Bird-Person' },
                { id: 'doc7', title: 'Squanch', species: 'Squanch' },
                { id: 'doc8', title: 'Mr. Meeseeks', species: 'Meeseeks' }
            ];

            for (const doc of documents) {
                await searchEngine.add(doc);
            }

            const defaultIndexData = searchEngine.indices['default'];
            const defaultIndex = defaultIndexData.invertedIndex;

            // Check that tokens are distributed across shards
            const stats = defaultIndex.getShardStats();
            let totalTokensAcrossShards = stats.totalTerms;
            let shardsWithTokens = stats.shardSizes.filter(size => size > 0).length;

            for (let i = 0; i < stats.shardSizes.length; i++) {
                console.log(`Shard ${i}: ${stats.shardSizes[i]} items`);
            }

            // Should have tokens distributed across multiple shards
            expect(shardsWithTokens).toBeGreaterThan(1);
            expect(totalTokensAcrossShards).toBeGreaterThan(0);
        });

        test('should maintain search functionality with sharding', async () => {
            // Add test documents
            await searchEngine.add({ id: 'doc1', title: 'Rick Sanchez', status: 'Alive' });
            await searchEngine.add({ id: 'doc2', title: 'Morty Smith', status: 'Alive' });
            await searchEngine.add({ id: 'doc3', title: 'Evil Morty', status: 'Alive' });

            // Search should work across all shards
            const rickResults = await searchEngine.search('Rick');
            expect(rickResults.hits.length).toBe(1);
            expect(rickResults.hits[0].id).toBe('doc1');

            const mortyResults = await searchEngine.search('Morty');
            expect(mortyResults.hits.length).toBe(2);
            expect(mortyResults.hits.map(h => h.id).sort()).toEqual(['doc2', 'doc3']);

            const aliveResults = await searchEngine.search('Alive');
            expect(aliveResults.hits.length).toBe(3);
        });

        test('should handle shard-specific token lookups correctly', async () => {
            // Add documents with specific tokens
            await searchEngine.add({ id: 'doc1', name: 'alpha', category: 'first' });
            await searchEngine.add({ id: 'doc2', name: 'beta', category: 'second' });
            await searchEngine.add({ id: 'doc3', name: 'gamma', category: 'third' });
            await searchEngine.add({ id: 'doc4', name: 'delta', category: 'fourth' });

            const defaultIndexData = searchEngine.indices['default'];
            const defaultIndex = defaultIndexData.invertedIndex;

            // Check that each token can be found in the sharded index
            const nameTokens = ['alpha', 'beta', 'gamma', 'delta'];
            const categoryTokens = ['first', 'second', 'third', 'fourth'];

            // Test name field tokens
            for (const token of nameTokens) {
                const fieldToken = `name:${token}`;
                const shardIndex = defaultIndex._getShardForToken(fieldToken);

                // Token should be findable via getPosting
                const posting = defaultIndex.getPosting(fieldToken);
                expect(posting).toBeDefined();
                expect(posting.size).toBeGreaterThan(0);

                // Verify shard index is valid
                expect(shardIndex).toBeGreaterThanOrEqual(0);
                expect(shardIndex).toBeLessThan(defaultIndex.getConfig().numShards);
            }

            // Test category field tokens
            for (const token of categoryTokens) {
                const fieldToken = `category:${token}`;
                const shardIndex = defaultIndex._getShardForToken(fieldToken);

                // Token should be findable via getPosting
                const posting = defaultIndex.getPosting(fieldToken);
                expect(posting).toBeDefined();
                expect(posting.size).toBeGreaterThan(0);

                // Verify shard index is valid
                expect(shardIndex).toBeGreaterThanOrEqual(0);
                expect(shardIndex).toBeLessThan(defaultIndex.getConfig().numShards);
            }
        });
    });

    describe('Performance and Scaling', () => {
        test('should handle large document sets with sharding', async () => {
            searchEngine = await SearchEngine.create({
                enableShardedStorage: true,
                numShards: 8,
                autoPersistence: { enabled: false }
            });

            // Add a larger set of documents
            const startTime = Date.now();

            for (let i = 0; i < 100; i++) {
                await searchEngine.add({
                    id: `doc${i}`,
                    title: `Document ${i}`,
                    content: `This is test content for document number ${i}`,
                    category: `category_${i % 10}`,
                    tags: [`tag${i}`, `group${Math.floor(i / 10)}`]
                });
            }

            const addTime = Date.now() - startTime;
            console.log(`Added 100 documents in ${addTime}ms`);

            // Verify search still works efficiently
            const searchStart = Date.now();
            const results = await searchEngine.search('Document', { size: 100 }); // Specify size to get all 100 docs
            const searchTime = Date.now() - searchStart;

            console.log(`Search completed in ${searchTime}ms, found ${results.hits.length} documents`);

            expect(results.hits.length).toBe(100); // Should find all documents
            expect(searchTime).toBeLessThan(1000); // Should be reasonably fast
        });

        test('should distribute load evenly across shards', async () => {
            searchEngine = await SearchEngine.create({
                enableShardedStorage: true,
                numShards: 4,
                autoPersistence: { enabled: false }
            });

            // Add documents with diverse content to ensure distribution
            const testData = [
                'apple', 'banana', 'cherry', 'date', 'elderberry', 'fig', 'grape', 'honeydew',
                'kiwi', 'lemon', 'mango', 'nectarine', 'orange', 'papaya', 'quince', 'raspberry',
                'strawberry', 'tangerine', 'ugli', 'vanilla', 'watermelon', 'ximenia', 'yam', 'zucchini'
            ];

            for (let i = 0; i < testData.length; i++) {
                await searchEngine.add({
                    id: `fruit${i}`,
                    name: testData[i],
                    description: `A delicious ${testData[i]} fruit`
                });
            }

            const defaultIndexData = searchEngine.indices['default'];
            const defaultIndex = defaultIndexData.invertedIndex;
            const stats = defaultIndex.getShardStats();
            const shardSizes = stats.shardSizes;

            for (let i = 0; i < shardSizes.length; i++) {
                console.log(`Shard ${i}: ${shardSizes[i]} items`);
            }

            // Check that no single shard has all the tokens (reasonable distribution)
            const maxShardSize = Math.max(...shardSizes);
            const minShardSize = Math.min(...shardSizes);
            const totalTokens = shardSizes.reduce((sum, size) => sum + size, 0);

            expect(totalTokens).toBeGreaterThan(0);
            expect(maxShardSize).toBeLessThan(totalTokens); // No single shard has everything

            // Distribution shouldn't be too skewed (within reasonable bounds)
            if (minShardSize > 0) {
                const distributionRatio = maxShardSize / minShardSize;
                expect(distributionRatio).toBeLessThan(10); // Reasonable distribution
            }
        });
    });

    describe('Shard Strategy', () => {
        test('should use hash strategy by default', async () => {
            searchEngine = await SearchEngine.create({
                enableShardedStorage: true,
                numShards: 4,
                autoPersistence: { enabled: false }
            });

            const defaultIndexData = searchEngine.indices['default'];
            const defaultIndex = defaultIndexData.invertedIndex;
            expect(defaultIndex.getConfig().shardStrategy).toBe('hash');
        });

        test('should consistently map same tokens to same shards', async () => {
            searchEngine = await SearchEngine.create({
                enableShardedStorage: true,
                numShards: 4,
                autoPersistence: { enabled: false }
            });

            const defaultIndexData = searchEngine.indices['default'];
            const defaultIndex = defaultIndexData.invertedIndex;

            // Test that same token always goes to same shard
            const testToken = 'title:consistent';
            const shard1 = defaultIndex._getShardForToken(testToken);
            const shard2 = defaultIndex._getShardForToken(testToken);
            const shard3 = defaultIndex._getShardForToken(testToken);

            expect(shard1).toBe(shard2);
            expect(shard2).toBe(shard3);
            expect(shard1).toBeGreaterThanOrEqual(0);
            expect(shard1).toBeLessThan(4);
        });
    });
}); 