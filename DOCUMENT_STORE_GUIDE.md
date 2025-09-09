# Document Store Architecture Guide

## Overview

The Document Store Architecture provides a unified interface for document storage with multiple backend implementations. This allows you to easily switch between different storage strategies without changing your application code.

## Features

- 🔌 **Pluggable Architecture** - Swap storage backends without code changes
- 🧠 **In-Memory Store** - Fast access for development and testing
- 💾 **File System Store** - Persistent disk-based storage
- 🗂️ **Sharded Store** - Distributed storage across multiple shards
- 🔴 **Redis Store** - External database integration
- 📊 **Performance Monitoring** - Built-in statistics and health checks
- 🔄 **Data Migration** - Snapshot-based migration between stores
- ⚙️ **Environment Configuration** - Automatic configuration based on environment

## Quick Start

```typescript
import { DocumentStoreFactory } from './src/infrastructure/stores/DocumentStoreFactory.js';

// Create a store
const store = await DocumentStoreFactory.create({
    type: 'memory', // or 'filesystem', 'sharded', 'redis'
    consistency: 'strong'
});

// Create an index
await store.createIndex('users');

// Add a document
await store.put({
    id: 'user-1',
    indexName: 'users',
    name: 'Alice',
    email: 'alice@example.com'
});

// Query documents
const users = await store.find({ indexName: 'users' });

// Cleanup
await store.shutdown();
```

## Store Types

### 1. In-Memory Store

**Best for:** Development, testing, caching

```typescript
const config = {
    type: 'memory',
    consistency: 'strong',
    durability: 'memory'
};
```

**Characteristics:**
- ✅ Fastest performance
- ✅ Zero configuration
- ❌ Data lost on restart
- ❌ Limited by available RAM

### 2. File System Store

**Best for:** Single-instance production, small to medium datasets

```typescript
const config = {
    type: 'filesystem',
    baseDir: './data/production',
    syncWrites: true,
    autoBackup: true,
    consistency: 'strong',
    durability: 'disk'
};
```

**Characteristics:**
- ✅ Persistent storage
- ✅ Automatic backups
- ✅ Good performance
- ❌ Single point of failure
- ❌ Limited by single disk

### 3. Sharded Store

**Best for:** Large datasets, high throughput, distributed systems

```typescript
const config = {
    type: 'sharded',
    baseDir: './data/sharded',
    numShards: 8,
    shardingStrategy: 'hash', // 'hash', 'round-robin', 'range', 'custom'
    replicationFactor: 2,
    autoRebalance: true,
    consistency: 'eventual',
    durability: 'disk'
};
```

**Characteristics:**
- ✅ Horizontal scalability
- ✅ High throughput
- ✅ Automatic rebalancing
- ✅ Fault tolerance with replication
- ❌ More complex setup
- ❌ Eventual consistency

### 4. Redis Store

**Best for:** External database integration, caching, distributed systems

```typescript
const config = {
    type: 'redis',
    redis: {
        host: 'localhost',
        port: 6379,
        keyPrefix: 'docs:',
        ttl: 3600, // 1 hour
        maxRetries: 5
    },
    consistency: 'strong',
    durability: 'replicated'
};
```

**Characteristics:**
- ✅ External database
- ✅ Built-in clustering
- ✅ TTL support
- ✅ High availability
- ❌ Requires Redis setup
- ❌ Network latency

## Configuration Presets

Use predefined configurations for common scenarios:

```typescript
// Development
const devConfig = DocumentStoreFactory.getPresetConfig('development');

// Testing
const testConfig = DocumentStoreFactory.getPresetConfig('testing');

// Production - Single instance
const prodConfig = DocumentStoreFactory.getPresetConfig('production-single');

// Production - Sharded
const shardedConfig = DocumentStoreFactory.getPresetConfig('production-sharded');

// Production - Redis
const redisConfig = DocumentStoreFactory.getPresetConfig('production-redis');
```

## Environment-Based Configuration

Automatically configure based on environment:

```typescript
// Uses NODE_ENV or environment variables
const config = DocumentStoreFactory.createEnvironmentConfig();
const store = await DocumentStoreFactory.create(config);
```

**Environment Variables:**
- `NODE_ENV` - development/testing/production
- `REDIS_HOST` - Redis host (triggers Redis mode)
- `REDIS_PORT` - Redis port
- `REDIS_PASSWORD` - Redis password
- `ENABLE_SHARDING=true` - Enable sharded mode
- `NUM_SHARDS` - Number of shards
- `DATA_DIR` - Base data directory

## Core Operations

### Document Management

```typescript
// Single document operations
await store.put(document);
const doc = await store.get('doc-id', 'index-name');
await store.delete('doc-id', 'index-name');
const exists = await store.exists('doc-id', 'index-name');

// Bulk operations
const result = await store.putBatch(documents);
const docs = await store.getBatch(['id1', 'id2'], 'index-name');
await store.deleteBatch(['id1', 'id2'], 'index-name');
```

### Querying

```typescript
// Find documents
const results = await store.find({
    indexName: 'users',
    query: { role: 'admin' },
    limit: 10,
    offset: 0
});

// Count documents
const count = await store.count({
    indexName: 'users',
    query: { active: true }
});
```

### Index Management

```typescript
// Create/delete indexes
await store.createIndex('users');
await store.deleteIndex('users');

// List indexes
const indexes = await store.listIndexes();

// Get index statistics
const stats = await store.getIndexStats('users');
```

## Data Migration

Move data between different store types:

```typescript
// Create snapshot
const snapshot = await sourceStore.createSnapshot();

// Load into new store
await targetStore.loadSnapshot(snapshot);

// Or use backup/restore
await sourceStore.backup('./backup-location');
await targetStore.restore('./backup-location');
```

## Performance Monitoring

```typescript
// Get store statistics
const stats = store.getStats();
console.log({
    documents: stats.totalDocuments,
    indexes: stats.totalIndexes,
    memory: stats.memoryUsage,
    disk: stats.diskUsage,
    operations: stats.operations
});

// Health check
const healthy = await store.isHealthy();
```

## Sharding Features

For sharded stores, additional features are available:

```typescript
// Check shard distribution
const distribution = store.getShardDistribution();

// Manual rebalancing
await store.rebalance();

// Get shard-specific stats
const shardStats = await store.getIndexStats('users');
```

## Best Practices

### 1. Choose the Right Store Type

- **Development/Testing:** Use `memory` store
- **Small Production:** Use `filesystem` store
- **Large Production:** Use `sharded` store
- **Microservices:** Use `redis` store

### 2. Index Design

```typescript
// Create indexes before adding documents
await store.createIndex('users');
await store.createIndex('products');

// Use meaningful index names
await store.createIndex('user-profiles');
await store.createIndex('product-catalog');
```

### 3. Error Handling

```typescript
try {
    await store.put(document);
} catch (error) {
    console.error('Failed to store document:', error);
    // Handle error appropriately
}
```

### 4. Resource Cleanup

```typescript
// Always cleanup when done
try {
    // Your operations
} finally {
    await store.shutdown();
    // Or close all stores
    await DocumentStoreFactory.closeAll();
}
```

### 5. Batch Operations

```typescript
// Use batch operations for better performance
const result = await store.putBatch(manyDocuments);

// Check for failures
if (result.failed > 0) {
    console.warn(`${result.failed} documents failed to store`);
    result.errors.forEach(error => {
        console.log(`Document ${error.id}: ${error.error}`);
    });
}
```

## Integration Examples

### With Express.js

```typescript
import express from 'express';
import { DocumentStoreFactory } from './stores/DocumentStoreFactory.js';

const app = express();
const store = await DocumentStoreFactory.create({
    type: process.env.NODE_ENV === 'production' ? 'sharded' : 'memory'
});

app.post('/users', async (req, res) => {
    try {
        await store.put({
            id: req.body.id,
            indexName: 'users',
            ...req.body
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/users/:id', async (req, res) => {
    const user = await store.get(req.params.id, 'users');
    if (user) {
        res.json(user);
    } else {
        res.status(404).json({ error: 'User not found' });
    }
});
```

### With Search Engine

```typescript
// Replace existing storage in your search engine
class SearchEngine {
    constructor(options) {
        this.documentStore = await DocumentStoreFactory.create(
            options.storeConfig || { type: 'memory' }
        );
    }

    async addDocument(doc) {
        // Add to search index
        this.invertedIndex.add(doc);
        
        // Store document
        await this.documentStore.put(doc);
    }

    async search(query) {
        // Get document IDs from search
        const docIds = this.invertedIndex.search(query);
        
        // Retrieve documents from store
        const documents = await this.documentStore.getBatch(docIds);
        
        return Array.from(documents.values());
    }
}
```

## Extending the Architecture

### Custom Store Implementation

```typescript
import { DocumentStore } from './DocumentStore.js';

class CustomDocumentStore extends DocumentStore {
    async put(document) {
        // Your custom implementation
    }
    
    async get(id, indexName) {
        // Your custom implementation
    }
    
    // Implement all abstract methods
}

// Register with factory
DocumentStoreFactory.registerStore('custom', CustomDocumentStore);
```

### Custom Sharding Strategy

```typescript
const config = {
    type: 'sharded',
    shardingStrategy: 'custom',
    customShardFunction: (document) => {
        // Custom sharding logic
        return document.tenantId % numShards;
    }
};
```

## Troubleshooting

### Common Issues

1. **"Store not initialized"**
   - Ensure you call `await store.initialize()` or use the factory

2. **"Failed to acquire lock"**
   - Concurrent access issue, implement retry logic

3. **"No space available"**
   - Disk full (filesystem) or memory limit (in-memory)

4. **"Index does not exist"**
   - Create index before adding documents

### Performance Issues

1. **Slow writes**
   - Use batch operations
   - Consider async writes
   - Check disk space/performance

2. **Slow reads**
   - Optimize queries
   - Add appropriate indexes
   - Consider caching

3. **Memory usage**
   - Use pagination
   - Implement TTL
   - Consider sharding

### Debugging

```typescript
// Enable debug logging
const store = await DocumentStoreFactory.create({
    type: 'filesystem',
    debug: true
});

// Monitor stats
setInterval(() => {
    const stats = store.getStats();
    console.log('Store stats:', stats);
}, 5000);

// Health checks
const healthy = await store.isHealthy();
if (!healthy) {
    console.error('Store is unhealthy!');
}
```

## Examples

See `examples/document-store-usage.ts` for comprehensive examples of all store types and features.

Run examples:
```bash
npx tsx examples/document-store-usage.ts
```

## API Reference

See the TypeScript interfaces in `src/infrastructure/stores/DocumentStore.ts` for complete API documentation. 