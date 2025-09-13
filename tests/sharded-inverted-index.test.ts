import { describe, test, expect, beforeEach } from 'vitest';
import { ShardedInvertedIndex } from '../src/index.js';

describe('ShardedInvertedIndex Core Functionality', () => {
    let shardedIndex;

    beforeEach(() => {
        shardedIndex = null;
    });

    describe('Initialization', () => {
        test('should create ShardedInvertedIndex with default settings', () => {
            shardedIndex = new ShardedInvertedIndex();

            expect(shardedIndex.numShards).toBe(8); // Default
            expect(shardedIndex.shardStrategy).toBe('hash');
            expect(shardedIndex.shards).toHaveLength(8);
            expect(shardedIndex.isSingleShard).toBe(false);
        });

        test('should create ShardedInvertedIndex with custom shard count', () => {
            shardedIndex = new ShardedInvertedIndex({ numShards: 4 });

            expect(shardedIndex.numShards).toBe(4);
            expect(shardedIndex.shards).toHaveLength(4);
            expect(shardedIndex.isSingleShard).toBe(false);
        });

        test('should optimize for single shard', () => {
            shardedIndex = new ShardedInvertedIndex({ numShards: 1 });

            expect(shardedIndex.numShards).toBe(1);
            expect(shardedIndex.isSingleShard).toBe(true);
        });

        test('should support different shard strategies', () => {
            shardedIndex = new ShardedInvertedIndex({
                numShards: 4,
                shardStrategy: 'round-robin'
            });

            expect(shardedIndex.shardStrategy).toBe('round-robin');
        });
    });

    describe('Shard Index Calculation', () => {
        beforeEach(() => {
            shardedIndex = new ShardedInvertedIndex({ numShards: 4 });
        });

        test('should consistently map same token to same shard', () => {
            const token = 'title:test';

            const shard1 = shardedIndex._getShardForToken(token);
            const shard2 = shardedIndex._getShardForToken(token);
            const shard3 = shardedIndex._getShardForToken(token);

            expect(shard1).toBe(shard2);
            expect(shard2).toBe(shard3);
            expect(shard1).toBeGreaterThanOrEqual(0);
            expect(shard1).toBeLessThan(4);
        });

        test('should distribute different tokens across shards', () => {
            const tokens = [
                'title:alpha', 'title:beta', 'title:gamma', 'title:delta',
                'content:one', 'content:two', 'content:three', 'content:four',
                'name:rick', 'name:morty', 'name:beth', 'name:jerry'
            ];

            const shardDistribution = new Map();

            for (const token of tokens) {
                const shardIndex = shardedIndex._getShardForToken(token);
                const count = shardDistribution.get(shardIndex) || 0;
                shardDistribution.set(shardIndex, count + 1);
            }

            console.log('Shard distribution:', Object.fromEntries(shardDistribution));

            // Should use multiple shards (not all tokens in one shard)
            expect(shardDistribution.size).toBeGreaterThan(1);

            // Each shard index should be valid
            for (const [shardIndex, count] of shardDistribution) {
                expect(shardIndex).toBeGreaterThanOrEqual(0);
                expect(shardIndex).toBeLessThan(4);
                expect(count).toBeGreaterThan(0);
            }
        });
    });

    describe('Document Addition and Retrieval', () => {
        beforeEach(() => {
            shardedIndex = new ShardedInvertedIndex({ numShards: 4 });
        });

        test('should add and retrieve documents across shards', () => {
            const docId = 'doc1';
            const tokens = ['title:rick', 'content:scientist', 'status:alive'];
            const positions = [0, 1, 2];

            // Add tokens for document
            for (let i = 0; i < tokens.length; i++) {
                shardedIndex.addToken(tokens[i], docId, positions[i]);
            }

            // Retrieve each token and verify document is found
            for (const token of tokens) {
                const posting = shardedIndex.getPosting(token);
                expect(posting).toBeDefined();
                expect(posting.size).toBeGreaterThan(0);

                const docInfo = posting.get(docId);
                expect(docInfo).toBeDefined();
                expect(docInfo.positions).toBeDefined();
            }
        });

        test('should handle multiple documents in same shard', () => {
            // Add multiple documents with tokens that map to same shard
            const token = 'title:test'; // This will map to a specific shard
            const shardIndex = shardedIndex._getShardForToken(token);

            // Add multiple documents with this token
            shardedIndex.addToken(token, 'doc1', 0);
            shardedIndex.addToken(token, 'doc2', 0);
            shardedIndex.addToken(token, 'doc3', 0);

            const posting = shardedIndex.getPosting(token);
            expect(posting.size).toBe(3);

            const docIds = Array.from(posting.keys()).sort();
            expect(docIds).toEqual(['doc1', 'doc2', 'doc3']);

            // Verify they're all properly stored
            expect(posting.get('doc1')).toBeDefined();
            expect(posting.get('doc2')).toBeDefined();
            expect(posting.get('doc3')).toBeDefined();
        });

        test('should handle documents distributed across multiple shards', () => {
            const document = {
                id: 'doc1',
                tokens: [
                    'title:rick',      // Will go to some shard
                    'content:morty',   // Will go to some shard  
                    'status:alive',    // Will go to some shard
                    'species:human'    // Will go to some shard
                ]
            };

            // Add all tokens for the document
            document.tokens.forEach((token, position) => {
                shardedIndex.addToken(token, document.id, position);
            });

            // Verify we can find the document by searching for any token
            for (const token of document.tokens) {
                const posting = shardedIndex.getPosting(token);
                expect(posting.size).toBeGreaterThan(0);

                const docInfo = posting.get(document.id);
                expect(docInfo).toBeDefined();
                expect(docInfo.frequency).toBeGreaterThan(0);
            }

            // Check that tokens are distributed across shards
            const shardsUsed = new Set();
            document.tokens.forEach(token => {
                const shardIndex = shardedIndex._getShardForToken(token);
                shardsUsed.add(shardIndex);
            });

            console.log(`Document tokens distributed across ${shardsUsed.size} shards:`, Array.from(shardsUsed));
            // Ideally should use multiple shards, but depends on hash function
        });
    });

    describe('Document Removal', () => {
        beforeEach(() => {
            shardedIndex = new ShardedInvertedIndex({ numShards: 4 });
        });

        test('should remove documents from correct shards', () => {
            const docId = 'doc1';
            const tokens = ['title:test', 'content:example', 'status:active'];

            // Add document tokens
            tokens.forEach((token, position) => {
                shardedIndex.addToken(token, docId, position);
            });

            // Verify document exists
            tokens.forEach(token => {
                const posting = shardedIndex.getPosting(token);
                const docInfo = posting.get(docId);
                expect(docInfo).toBeDefined();
            });

            // Remove document
            shardedIndex.deleteDocument(docId);

            // Verify document is removed from all shards
            tokens.forEach(token => {
                const posting = shardedIndex.getPosting(token);
                const docInfo = posting.get(docId);
                expect(docInfo).toBeUndefined();
            });
        });

        test('should remove only specified document when multiple docs share tokens', () => {
            const sharedToken = 'category:test';

            // Add multiple documents with shared token
            shardedIndex.addToken(sharedToken, 'doc1', 0);
            shardedIndex.addToken(sharedToken, 'doc2', 0);
            shardedIndex.addToken(sharedToken, 'doc3', 0);

            // Verify all documents exist
            let posting = shardedIndex.getPosting(sharedToken);
            expect(posting.size).toBe(3);

            // Remove one document
            shardedIndex.deleteDocument('doc2');

            // Verify only doc2 is removed
            posting = shardedIndex.getPosting(sharedToken);
            expect(posting.size).toBe(2);

            const remainingIds = Array.from(posting.keys()).sort();
            expect(remainingIds).toEqual(['doc1', 'doc3']);
        });
    });

    describe('Search Functionality', () => {
        beforeEach(() => {
            shardedIndex = new ShardedInvertedIndex({ numShards: 4 });

            // Add test data
            const testDocs = [
                { id: 'doc1', tokens: ['title:rick', 'status:alive', 'role:scientist'] },
                { id: 'doc2', tokens: ['title:morty', 'status:alive', 'role:student'] },
                { id: 'doc3', tokens: ['title:beth', 'status:alive', 'role:doctor'] },
                { id: 'doc4', tokens: ['title:jerry', 'status:alive', 'role:unemployed'] }
            ];

            testDocs.forEach(doc => {
                doc.tokens.forEach((token, position) => {
                    shardedIndex.addToken(token, doc.id, position);
                });
            });
        });

        test('should search across all shards correctly', () => {
            // Search for token that should exist
            const posting = shardedIndex.getPosting('status:alive');
            expect(posting.size).toBe(4); // All documents have this status

            const foundIds = Array.from(posting.keys()).sort();
            expect(foundIds).toEqual(['doc1', 'doc2', 'doc3', 'doc4']);
        });

        test('should return empty results for non-existent tokens', () => {
            const posting = shardedIndex.getPosting('nonexistent:token');
            expect(posting.size).toBe(0);
        });

        test('should handle single shard optimization correctly', () => {
            const singleShardIndex = new ShardedInvertedIndex({ numShards: 1 });

            // Add some data
            singleShardIndex.addToken('title:test', 'doc1', 0);
            singleShardIndex.addToken('content:example', 'doc1', 1);

            const posting = singleShardIndex.getPosting('title:test');
            expect(posting.size).toBe(1);
            expect(posting.has('doc1')).toBe(true);
        });
    });

    describe('Statistics and Monitoring', () => {
        beforeEach(() => {
            shardedIndex = new ShardedInvertedIndex({ numShards: 4 });
        });

        test('should provide correct statistics', () => {
            // Add test data
            for (let i = 0; i < 10; i++) {
                shardedIndex.addToken(`token${i}:value`, `doc${i}`, 0);
                shardedIndex.addToken(`common:shared`, `doc${i}`, 1);
            }

            const stats = shardedIndex.getShardStats();
            expect(stats).toBeDefined();
            expect(stats.totalDocuments).toBeGreaterThan(0);
            expect(stats.totalTerms).toBeGreaterThan(0);

            // Should have shard-specific stats
            expect(stats.shardSizes).toBeDefined();
            expect(stats.shardSizes.length).toBe(4);
        });

        test('should track shard distribution', () => {
            // Add varied data to see distribution
            const tokens = [
                'alpha:1', 'beta:2', 'gamma:3', 'delta:4', 'epsilon:5',
                'zeta:6', 'eta:7', 'theta:8', 'iota:9', 'kappa:10'
            ];

            tokens.forEach((token, i) => {
                shardedIndex.addToken(token, `doc${i}`, 0);
            });

            const stats = shardedIndex.getShardStats();

            // Check that work is distributed
            let totalTokensInShards = 0;
            let shardsWithData = 0;

            stats.shardSizes.forEach((shardSize, index) => {
                console.log(`Shard ${index}: ${shardSize} items`);
                totalTokensInShards += shardSize;
                if (shardSize > 0) shardsWithData++;
            });

            expect(totalTokensInShards).toBe(tokens.length);
            expect(shardsWithData).toBeGreaterThan(0);
        });
    });

    describe('Edge Cases', () => {
        test('should handle empty index gracefully', () => {
            shardedIndex = new ShardedInvertedIndex({ numShards: 4 });

            const posting = shardedIndex.getPosting('any:token');
            expect(posting.size).toBe(0);

            const stats = shardedIndex.getShardStats();
            expect(stats.totalDocuments).toBe(0);
            expect(stats.totalTerms).toBe(0);
        });

        test('should handle very large shard counts', () => {
            shardedIndex = new ShardedInvertedIndex({ numShards: 1000 });

            const config = shardedIndex.getConfig();
            expect(config.numShards).toBe(1000);

            // Should still work correctly
            shardedIndex.addToken('test:token', 'doc1', 0);
            const posting = shardedIndex.getPosting('test:token');
            expect(posting.size).toBe(1);
        });

        test('should handle special characters in tokens', () => {
            shardedIndex = new ShardedInvertedIndex({ numShards: 4 });

            const specialTokens = [
                'email:user@example.com',
                'url:https://example.com/path?param=value',
                'special:chars!@#$%^&*()',
                'unicode:测试',
                'spaces:has spaces'
            ];

            specialTokens.forEach((token, i) => {
                shardedIndex.addToken(token, `doc${i}`, 0);
            });

            // Verify all tokens can be found
            specialTokens.forEach(token => {
                const posting = shardedIndex.getPosting(token);
                expect(posting.size).toBe(1);
            });
        });
    });
}); 