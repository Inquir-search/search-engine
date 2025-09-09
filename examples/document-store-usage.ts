/**
 * Document Store Usage Examples
 * Demonstrates how to use different document store implementations
 */

import { DocumentStoreFactory, DocumentStoreConfig } from '../src/infrastructure/stores/DocumentStoreFactory.js';
import { DocumentStore, Document } from '../src/infrastructure/stores/DocumentStore.js';

// Sample documents for testing
const sampleDocuments: Document[] = [
    {
        id: 'user-1',
        indexName: 'users',
        name: 'Alice Johnson',
        email: 'alice@example.com',
        role: 'admin',
        created: new Date().toISOString()
    },
    {
        id: 'user-2',
        indexName: 'users',
        name: 'Bob Smith',
        email: 'bob@example.com',
        role: 'user',
        created: new Date().toISOString()
    },
    {
        id: 'product-1',
        indexName: 'products',
        name: 'Laptop',
        category: 'electronics',
        price: 999.99,
        inStock: true
    },
    {
        id: 'product-2',
        indexName: 'products',
        name: 'Coffee Mug',
        category: 'kitchen',
        price: 15.99,
        inStock: false
    }
];

/**
 * Example 1: In-Memory Store (Development/Testing)
 */
async function exampleInMemoryStore() {
    console.log('\n🧠 === In-Memory Store Example ===');

    const config: DocumentStoreConfig = {
        type: 'memory',
        consistency: 'strong'
    };

    const store = await DocumentStoreFactory.create(config);

    // Create indexes
    await store.createIndex('users');
    await store.createIndex('products');

    // Add documents
    console.log('📝 Adding documents...');
    for (const doc of sampleDocuments) {
        await store.put(doc);
    }

    // Query documents
    console.log('🔍 Querying documents...');
    const users = await store.find({ indexName: 'users' });
    console.log(`Found ${users.length} users:`, users.map(u => u.name));

    // Get specific document
    const user1 = await store.get('user-1', 'users');
    console.log('Retrieved user-1:', user1?.name);

    // Bulk operations
    const bulkResult = await store.getBatch(['user-1', 'user-2'], 'users');
    console.log(`Bulk retrieved ${bulkResult.size} users`);

    // Stats
    const stats = store.getStats();
    console.log('📊 Store stats:', {
        documents: stats.totalDocuments,
        indexes: stats.totalIndexes,
        memory: `${Math.round(stats.memoryUsage / 1024)}KB`
    });

    await DocumentStoreFactory.close('memory');
}

/**
 * Example 2: File System Store (Single Instance)
 */
async function exampleFileSystemStore() {
    console.log('\n💾 === File System Store Example ===');

    const config: DocumentStoreConfig = {
        type: 'filesystem',
        baseDir: './data/filesystem-example',
        syncWrites: true,
        autoBackup: false,
        consistency: 'strong',
        durability: 'disk'
    };

    const store = await DocumentStoreFactory.create(config);

    // Create indexes
    await store.createIndex('users');
    await store.createIndex('products');

    // Add documents
    console.log('📝 Adding documents to filesystem...');
    const batchResult = await store.putBatch(sampleDocuments);
    console.log(`Batch added: ${batchResult.processed} success, ${batchResult.failed} failed`);

    // Query with filters
    console.log('🔍 Querying with filters...');
    const adminUsers = await store.find({
        indexName: 'users',
        query: { role: 'admin' }
    });
    console.log(`Found ${adminUsers.length} admin users`);

    // Test persistence
    console.log('💾 Testing persistence...');
    await store.flush();

    // Create snapshot
    const snapshot = await store.createSnapshot();
    console.log(`📸 Created snapshot with ${snapshot.documents.size} documents`);

    // Backup
    await store.backup('./data/filesystem-backup');
    console.log('💾 Backup completed');

    // Stats
    const stats = store.getStats();
    console.log('📊 Store stats:', {
        documents: stats.totalDocuments,
        indexes: stats.totalIndexes,
        diskUsage: `${Math.round((stats.diskUsage || 0) / 1024)}KB`
    });

    await DocumentStoreFactory.close('filesystem-data_filesystem-example');
}

/**
 * Example 3: Sharded Store (Distributed)
 */
async function exampleShardedStore() {
    console.log('\n🗂️ === Sharded Store Example ===');

    const config: DocumentStoreConfig = {
        type: 'sharded',
        baseDir: './data/sharded-example',
        numShards: 4,
        shardingStrategy: 'hash',
        replicationFactor: 2,
        autoRebalance: true,
        rebalanceThreshold: 0.3,
        consistency: 'eventual',
        durability: 'disk'
    };

    const store = await DocumentStoreFactory.create(config);

    // Create indexes
    await store.createIndex('users');
    await store.createIndex('products');

    // Add many documents to test sharding
    console.log('📝 Adding documents across shards...');
    const manyDocuments: Document[] = [];

    for (let i = 0; i < 100; i++) {
        manyDocuments.push({
            id: `doc-${i}`,
            indexName: 'test-index',
            value: Math.random(),
            category: i % 3 === 0 ? 'A' : i % 3 === 1 ? 'B' : 'C',
            shard: `shard-${i % 4}`
        });
    }

    const batchResult = await store.putBatch([...sampleDocuments, ...manyDocuments]);
    console.log(`Batch added: ${batchResult.processed} success, ${batchResult.failed} failed`);

    // Check shard distribution (if available)
    if ('getShardDistribution' in store) {
        const distribution = (store as any).getShardDistribution();
        console.log('📊 Shard distribution:');
        distribution.forEach((shard: any) => {
            console.log(`  Shard ${shard.shardId}: ${shard.documentCount} docs (${shard.percentage.toFixed(1)}%)`);
        });
    }

    // Query across shards
    console.log('🔍 Querying across shards...');
    const categoryA = await store.find({
        indexName: 'test-index',
        query: { category: 'A' },
        limit: 10
    });
    console.log(`Found ${categoryA.length} documents in category A`);

    // Test rebalancing (if available)
    if ('rebalance' in store) {
        console.log('⚖️ Testing rebalancing...');
        await (store as any).rebalance();
    }

    // Stats
    const stats = store.getStats();
    console.log('📊 Store stats:', {
        documents: stats.totalDocuments,
        indexes: stats.totalIndexes,
        diskUsage: `${Math.round((stats.diskUsage || 0) / 1024)}KB`
    });

    await DocumentStoreFactory.close('sharded-data_sharded-example-shards-4');
}

/**
 * Example 4: Redis Store (External Database)
 */
async function exampleRedisStore() {
    console.log('\n🔴 === Redis Store Example ===');

    const config: DocumentStoreConfig = {
        type: 'redis',
        redis: {
            host: 'localhost',
            port: 6379,
            keyPrefix: 'example:',
            ttl: 3600, // 1 hour TTL
            maxRetries: 3
        },
        consistency: 'strong',
        durability: 'replicated'
    };

    try {
        const store = await DocumentStoreFactory.create(config);

        console.log('⚠️ Note: This example uses a mock Redis client');

        // Create indexes
        await store.createIndex('users');
        await store.createIndex('products');

        // Add documents
        console.log('📝 Adding documents to Redis...');
        for (const doc of sampleDocuments) {
            await store.put(doc);
        }

        // Query documents
        const users = await store.find({ indexName: 'users' });
        console.log(`Found ${users.length} users in Redis`);

        // Test TTL functionality (mock implementation)
        console.log('⏰ TTL set to 1 hour for all documents');

        // Stats
        const stats = store.getStats();
        console.log('📊 Store stats:', {
            documents: stats.totalDocuments,
            indexes: stats.totalIndexes
        });

        await DocumentStoreFactory.close('redis-localhost:6379');
    } catch (error) {
        console.log('⚠️ Redis store example skipped (Redis not available):', error.message);
    }
}

/**
 * Example 5: Environment-based Configuration
 */
async function exampleEnvironmentConfig() {
    console.log('\n🌍 === Environment Configuration Example ===');

    // Test different environment configurations
    const envConfigs = ['development', 'testing', 'production'];

    for (const env of envConfigs) {
        console.log(`\n📋 ${env.toUpperCase()} configuration:`);
        const config = DocumentStoreFactory.createEnvironmentConfig(env);
        console.log(JSON.stringify(config, null, 2));
    }

    // Test preset configurations
    const presets = ['development', 'testing', 'production-single', 'production-sharded'] as const;

    for (const preset of presets) {
        console.log(`\n📋 ${preset.toUpperCase()} preset:`);
        const config = DocumentStoreFactory.getPresetConfig(preset);
        console.log(JSON.stringify(config, null, 2));
    }
}

/**
 * Example 6: Store Migration
 */
async function exampleStoreMigration() {
    console.log('\n🔄 === Store Migration Example ===');

    // Start with in-memory store
    const memoryStore = await DocumentStoreFactory.create({
        type: 'memory'
    });

    await memoryStore.createIndex('migration-test');

    // Add some data
    const testDocs: Document[] = [
        { id: 'migrate-1', indexName: 'migration-test', data: 'test data 1' },
        { id: 'migrate-2', indexName: 'migration-test', data: 'test data 2' },
        { id: 'migrate-3', indexName: 'migration-test', data: 'test data 3' }
    ];

    await memoryStore.putBatch(testDocs);
    console.log('📝 Added test data to memory store');

    // Create snapshot
    const snapshot = await memoryStore.createSnapshot();
    console.log(`📸 Created snapshot with ${snapshot.documents.size} documents`);

    // Migrate to file system store
    const fileStore = await DocumentStoreFactory.create({
        type: 'filesystem',
        baseDir: './data/migration-example'
    });

    // Load snapshot into new store
    await fileStore.loadSnapshot(snapshot);
    console.log('📥 Migrated data to file system store');

    // Verify migration
    const migratedDocs = await fileStore.find({ indexName: 'migration-test' });
    console.log(`✅ Verified: ${migratedDocs.length} documents migrated successfully`);

    // Cleanup
    await DocumentStoreFactory.close('memory');
    await DocumentStoreFactory.close('filesystem-data_migration-example');
}

/**
 * Example 7: Performance Comparison
 */
async function examplePerformanceComparison() {
    console.log('\n⚡ === Performance Comparison Example ===');

    const storeConfigs = [
        { name: 'Memory', config: { type: 'memory' as const } },
        { name: 'FileSystem', config: { type: 'filesystem' as const, baseDir: './data/perf-fs' } },
        { name: 'Sharded', config: { type: 'sharded' as const, baseDir: './data/perf-sharded', numShards: 2 } }
    ];

    const testDocuments: Document[] = Array.from({ length: 1000 }, (_, i) => ({
        id: `perf-doc-${i}`,
        indexName: 'performance-test',
        value: Math.random(),
        timestamp: Date.now()
    }));

    for (const { name, config } of storeConfigs) {
        console.log(`\n🏃 Testing ${name} store...`);

        const store = await DocumentStoreFactory.create(config);
        await store.createIndex('performance-test');

        // Measure write performance
        const writeStart = Date.now();
        const batchResult = await store.putBatch(testDocuments);
        const writeTime = Date.now() - writeStart;

        // Measure read performance
        const readStart = Date.now();
        const results = await store.find({ indexName: 'performance-test', limit: 100 });
        const readTime = Date.now() - readStart;

        console.log(`📊 ${name} Performance:`);
        console.log(`  Write: ${batchResult.processed} docs in ${writeTime}ms (${(batchResult.processed / writeTime * 1000).toFixed(1)} docs/sec)`);
        console.log(`  Read: ${results.length} docs in ${readTime}ms (${(results.length / readTime * 1000).toFixed(1)} docs/sec)`);

        // Close using a generated key based on config type
        const instanceKey = `${config.type}-${name.toLowerCase()}`;
        try {
            await DocumentStoreFactory.close(instanceKey);
        } catch (error) {
            console.warn(`Could not close ${name} store instance`);
        }
    }
}

/**
 * Main example runner
 */
async function runAllExamples() {
    console.log('🎯 Document Store Examples Starting...\n');

    try {
        await exampleInMemoryStore();
        await exampleFileSystemStore();
        await exampleShardedStore();
        await exampleRedisStore();
        await exampleEnvironmentConfig();
        await exampleStoreMigration();
        await examplePerformanceComparison();

        console.log('\n✅ All examples completed successfully!');

        // Show active instances
        const instances = DocumentStoreFactory.listInstances();
        if (instances.length > 0) {
            console.log('\n📋 Active store instances:');
            instances.forEach(instance => {
                console.log(`  - ${instance.key} (${instance.type})`);
            });
        }

    } catch (error) {
        console.error('❌ Example failed:', error);
    } finally {
        // Cleanup all instances
        await DocumentStoreFactory.closeAll();
        console.log('\n🧹 Cleanup completed');
    }
}

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runAllExamples().catch(console.error);
}

export {
    exampleInMemoryStore,
    exampleFileSystemStore,
    exampleShardedStore,
    exampleRedisStore,
    exampleEnvironmentConfig,
    exampleStoreMigration,
    examplePerformanceComparison,
    runAllExamples
}; 