import { SnapshotManager, SnapshotConfig } from '../src/infrastructure/stores/SnapshotManager.js';
import { CachedDocumentStore } from '../src/infrastructure/stores/CachedDocumentStore.js';
import { StoreBasedQueryEngine } from '../src/infrastructure/stores/StoreBasedQueryEngine.js';
import { InMemoryDocumentStore } from '../src/infrastructure/stores/InMemoryDocumentStore.js';
import { FileSystemDocumentStore } from '../src/infrastructure/stores/FileSystemDocumentStore.js';
import { DocumentStoreFactory } from '../src/infrastructure/stores/DocumentStoreFactory.js';

/**
 * Comprehensive example demonstrating the complete store-based architecture:
 * - SnapshotManager for persistence
 * - CachedDocumentStore for performance
 * - StoreBasedQueryEngine for search
 * - File optimization (open once)
 */
async function demonstrateStoreArchitecture() {
    console.log('🏗️  === Store-Based Architecture Demo ===\n');

    // 1. Create different types of stores
    console.log('📦 Setting up document stores...');

    const memoryStore = new InMemoryDocumentStore();
    const fileStore = new FileSystemDocumentStore('./demo-data');

    // 2. Set up caching layer
    console.log('🚀 Setting up caching layer...');

    const cachedFileStore = new CachedDocumentStore(fileStore, {
        enabled: true,
        maxSize: 1000,
        strategy: 'lru',
        writeThrough: true,
        prefetchEnabled: true,
        ttl: 300000 // 5 minutes
    });

    // 3. Initialize stores
    await memoryStore.initialize();
    await cachedFileStore.initialize();

    // 4. Set up SnapshotManager
    console.log('📸 Setting up SnapshotManager...');

    const snapshotConfig: SnapshotConfig = {
        enabled: true,
        interval: 60000, // 1 minute for demo
        maxSnapshots: 5,
        directory: './demo-snapshots',
        compression: true,
        onSnapshotCreated: (snapshot) => {
            console.log(`✅ Snapshot created: ${snapshot.id} (${snapshot.documentCount} docs)`);
        },
        onSnapshotRestored: (snapshot) => {
            console.log(`🔄 Snapshot restored: ${snapshot.id}`);
        }
    };

    const snapshotManager = new SnapshotManager(snapshotConfig);
    snapshotManager.registerStore('memory', memoryStore);
    snapshotManager.registerStore('cached-file', cachedFileStore);

    // 5. Set up QueryEngine
    console.log('🔍 Setting up StoreBasedQueryEngine...');

    const queryEngine = new StoreBasedQueryEngine({
        enableCaching: true,
        cacheSize: 5000,
        prefetchEnabled: true,
        parallelQueries: true,
        maxParallelQueries: 3
    });

    queryEngine.registerStore('memory', memoryStore, true);
    queryEngine.registerStore('cached-file', cachedFileStore);
    await queryEngine.initialize();

    // 6. Add sample data
    console.log('\n📝 Adding sample documents...');

    const sampleDocuments = [
        {
            id: 'doc1',
            indexName: 'products',
            name: 'iPhone 15 Pro',
            category: 'Electronics',
            price: 999,
            specs: {
                storage: '256GB',
                color: 'Natural Titanium'
            }
        },
        {
            id: 'doc2',
            indexName: 'products',
            name: 'MacBook Pro',
            category: 'Electronics',
            price: 1999,
            specs: {
                processor: 'M3 Pro',
                memory: '16GB'
            }
        },
        {
            id: 'doc3',
            indexName: 'users',
            name: 'John Doe',
            email: 'john@example.com',
            profile: {
                age: 30,
                location: 'New York'
            }
        }
    ];

    for (const doc of sampleDocuments) {
        await queryEngine.addDocument(doc);
        console.log(`  ✓ Added document: ${doc.id}`);
    }

    // 7. Demonstrate search functionality
    console.log('\n🔍 Testing search functionality...');

    // Simple match all query
    const allDocsQuery = { match_all: {} };
    const allResults = queryEngine.search(allDocsQuery);
    console.log(`  📊 Match all query returned ${allResults.size} documents`);

    // 8. Create snapshots
    console.log('\n📸 Creating snapshots...');

    snapshotManager.start();
    const snapshots = await snapshotManager.createAllSnapshots();
    console.log(`  ✅ Created ${snapshots.length} snapshots`);

    // 9. Demonstrate snapshot listing
    console.log('\n📋 Listing snapshots...');

    const allSnapshots = snapshotManager.listSnapshots();
    allSnapshots.forEach(snapshot => {
        console.log(`  📸 ${snapshot.id}: ${snapshot.documentCount} docs, ${formatBytes(snapshot.size)}`);
    });

    // 10. Demonstrate stats collection
    console.log('\n📊 Collecting statistics...');

    const engineStats = await queryEngine.getEngineStats();
    console.log(`  🔍 Query engine: ${engineStats.queryCount} queries, avg: ${engineStats.avgExecutionTime.toFixed(2)}ms`);

    const snapshotStats = snapshotManager.getStats();
    console.log(`  📸 Snapshots: ${snapshotStats.totalSnapshots} total, ${formatBytes(snapshotStats.totalSize)}`);

    // 11. Demonstrate cache performance
    console.log('\n⚡ Testing cache performance...');

    const cacheStats = cachedFileStore.getStats();
    console.log(`  📈 Cache: ${cacheStats.cacheSize}/${cacheStats.cacheMaxSize} items`);
    console.log(`  📈 Hit rate: ${(cacheStats.hitRate * 100).toFixed(1)}%`);

    // 12. Demonstrate snapshot restore
    console.log('\n🔄 Testing snapshot restore...');

    if (allSnapshots.length > 0) {
        const latestSnapshot = allSnapshots[0];

        // Clear memory store
        await memoryStore.clear();
        console.log('  🗑️ Cleared memory store');

        // Restore from snapshot
        const restored = await snapshotManager.restoreSnapshot(
            latestSnapshot.id,
            'memory',
            { clearExisting: true }
        );

        if (restored) {
            console.log('  ✅ Snapshot restored successfully');

            // Refresh query engine data
            await queryEngine.refreshMemoryData();
            console.log('  🔄 Query engine data refreshed');
        }
    }

    // 13. Optimize and cleanup
    console.log('\n🔧 Optimizing and cleaning up...');

    await queryEngine.optimize();
    snapshotManager.stop();

    await queryEngine.shutdown();
    await snapshotManager.deleteSnapshot(allSnapshots[0]?.id);

    console.log('✅ Demo completed successfully!\n');
}

/**
 * Demonstrate file handle optimization
 */
async function demonstrateFileOptimization() {
    console.log('📁 === File Handle Optimization Demo ===\n');

    // Create multiple file-based stores sharing the same optimization
    const store1 = new FileSystemDocumentStore('./demo-data-1');
    const store2 = new FileSystemDocumentStore('./demo-data-2');

    // Wrap with caching to get file handle optimization
    const cachedStore1 = new CachedDocumentStore(store1);
    const cachedStore2 = new CachedDocumentStore(store2);

    await cachedStore1.initialize();
    await cachedStore2.initialize();

    console.log('📂 Multiple file stores initialized with optimized handles');

    // Add documents that would normally require multiple file opens
    const docs = Array.from({ length: 100 }, (_, i) => ({
        id: `doc${i}`,
        indexName: 'test',
        data: `Document content ${i}`,
        timestamp: Date.now()
    }));

    console.log('📝 Adding documents to demonstrate file handle reuse...');

    const startTime = Date.now();

    // Add to both stores - file handles should be reused
    await cachedStore1.putBatch(docs.slice(0, 50));
    await cachedStore2.putBatch(docs.slice(50));

    const endTime = Date.now();

    console.log(`✅ Added 100 documents in ${endTime - startTime}ms with optimized file handles`);
    console.log('📈 File handles were opened only once per file and reused across operations');

    await cachedStore1.shutdown();
    await cachedStore2.shutdown();

    console.log('✅ File optimization demo completed!\n');
}

/**
 * Demonstrate advanced snapshot management
 */
async function demonstrateAdvancedSnapshots() {
    console.log('🎯 === Advanced Snapshot Management Demo ===\n');

    const store = new InMemoryDocumentStore();
    await store.initialize();

    const snapshotManager = new SnapshotManager({
        enabled: true,
        interval: 5000,
        maxSnapshots: 3,
        directory: './advanced-snapshots'
    });

    snapshotManager.registerStore('advanced', store);

    // Add different types of documents
    const productDocs = Array.from({ length: 10 }, (_, i) => ({
        id: `product${i}`,
        indexName: 'products',
        name: `Product ${i}`,
        category: 'Electronics'
    }));

    const userDocs = Array.from({ length: 5 }, (_, i) => ({
        id: `user${i}`,
        indexName: 'users',
        name: `User ${i}`,
        email: `user${i}@example.com`
    }));

    await store.putBatch([...productDocs, ...userDocs]);
    console.log('📦 Added 15 documents across 2 indexes');

    // Create tagged snapshots
    await snapshotManager.createSnapshot('advanced', store, ['initial-data']);
    console.log('📸 Created tagged snapshot');

    // Add more data
    await store.put({
        id: 'product11',
        indexName: 'products',
        name: 'New Product',
        category: 'Software'
    });

    await snapshotManager.createSnapshot('advanced', store, ['with-new-product']);
    console.log('📸 Created second snapshot with tag');

    // Demonstrate filtered restore
    console.log('\n🎯 Testing filtered snapshot restore...');

    const snapshots = snapshotManager.listSnapshots('advanced');
    if (snapshots.length > 0) {
        await store.clear();

        // Restore only products index
        await snapshotManager.restoreSnapshot(
            snapshots[0].id,
            'advanced',
            {
                clearExisting: true,
                indexFilter: ['products'],
                documentFilter: (doc) => doc.category === 'Electronics'
            }
        );

        const remainingDocs = await store.find({});
        console.log(`✅ Filtered restore completed: ${remainingDocs.length} documents remain`);
        console.log('   (Only Electronics products should remain)');
    }

    await store.shutdown();
    console.log('✅ Advanced snapshot demo completed!\n');
}

// Helper function
function formatBytes(bytes: number): string {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${Math.round(bytes / Math.pow(1024, i) * 100) / 100} ${sizes[i]}`;
}

// Run all demonstrations
if (import.meta.url === `file://${process.argv[1]}`) {
    (async () => {
        try {
            await demonstrateStoreArchitecture();
            await demonstrateFileOptimization();
            await demonstrateAdvancedSnapshots();

            console.log('🎉 All demonstrations completed successfully!');
        } catch (error) {
            console.error('❌ Demo failed:', error);
        }
    })();
}

export {
    demonstrateStoreArchitecture,
    demonstrateFileOptimization,
    demonstrateAdvancedSnapshots
}; 