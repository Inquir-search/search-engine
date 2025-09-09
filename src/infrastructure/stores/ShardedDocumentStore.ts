import { DocumentStore, Document, DocumentFilter, StorageStats, StorageOptions, BulkOperationResult, DocumentStoreSnapshot } from './DocumentStore.js';
import FileSystemDocumentStore from './FileSystemDocumentStore.js';
import path from 'path';
import fs from 'fs';

interface ShardedOptions extends StorageOptions {
    baseDir?: string;
    numShards?: number;
    shardingStrategy?: 'hash' | 'round-robin' | 'range' | 'custom';
    customShardFunction?: (document: Document) => number;
    replicationFactor?: number;
    autoRebalance?: boolean;
    rebalanceThreshold?: number;
}

interface ShardInfo {
    id: number;
    store: FileSystemDocumentStore;
    documentCount: number;
    size: number;
}

/**
 * Sharded Document Store
 * Distributed document storage across multiple shards for scalability
 */
export class ShardedDocumentStore extends DocumentStore {
    private baseDir: string;
    private numShards: number;
    private shards: Map<number, ShardInfo> = new Map();
    private shardingStrategy: 'hash' | 'round-robin' | 'range' | 'custom';
    private customShardFunction?: (document: Document) => number;
    private replicationFactor: number;
    private autoRebalance: boolean;
    private rebalanceThreshold: number;
    private isInitialized: boolean = false;
    private roundRobinCounter: number = 0;

    constructor(options: ShardedOptions = {}) {
        super({
            ...options,
            durability: 'disk',
            consistency: 'eventual'
        });

        this.baseDir = options.baseDir || './data/sharded';
        this.numShards = options.numShards || 4;
        this.shardingStrategy = options.shardingStrategy || 'hash';
        this.customShardFunction = options.customShardFunction;
        this.replicationFactor = options.replicationFactor || 1;
        this.autoRebalance = options.autoRebalance === true;
        this.rebalanceThreshold = options.rebalanceThreshold || 0.3; // 30% imbalance threshold
    }

    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        // Create base directory
        if (!fs.existsSync(this.baseDir)) {
            fs.mkdirSync(this.baseDir, { recursive: true });
        }

        // Initialize shards
        for (let i = 0; i < this.numShards; i++) {
            const shardDir = path.join(this.baseDir, `shard-${i}`);
            const shardStore = new FileSystemDocumentStore({
                baseDir: shardDir,
                syncWrites: this.options.durability === 'disk',
                compression: this.options.compression
            });

            await shardStore.initialize();

            this.shards.set(i, {
                id: i,
                store: shardStore,
                documentCount: 0,
                size: 0
            });
        }

        // Load existing shard statistics
        await this.loadShardStats();

        this.isInitialized = true;
        }

    async shutdown(): Promise<void> {
        if (!this.isInitialized) return;

        // Shutdown all shards
        for (const shardInfo of this.shards.values()) {
            await shardInfo.store.shutdown();
        }

        this.shards.clear();
        this.isInitialized = false;
        }

    async isHealthy(): Promise<boolean> {
        if (!this.isInitialized) return false;

        // Check health of all shards
        for (const shardInfo of this.shards.values()) {
            if (!(await shardInfo.store.isHealthy())) {
                return false;
            }
        }

        return true;
    }

    // Core CRUD operations
    async put(document: Document): Promise<boolean> {
        this.validateDocument(document);

        try {
            const shardIds = this.getShardIds(document);
            const results: boolean[] = [];

            // Write to primary shard and replicas
            for (const shardId of shardIds) {
                const shard = this.shards.get(shardId);
                if (shard) {
                    const result = await shard.store.put(document);
                    results.push(result);

                    if (result) {
                        shard.documentCount++;
                        this.stats.totalDocuments++;
                    }
                }
            }

            // Update stats
            this.updateStats('write');
            await this.updateShardStats();

            // Check if rebalancing is needed
            if (this.autoRebalance) {
                await this.checkRebalance();
            }

            // Consider success if at least one write succeeded
            const success = results.some(r => r);

            if (success && this.onDocumentAdded) {
                this.onDocumentAdded(document);
            }

            return success;
        } catch (error) {
            console.error('Failed to put document:', error);
            return false;
        }
    }

    async get(id: string, indexName?: string): Promise<Document | null> {
        this.validateId(id);

        // Try to find the document in any shard
        for (const shardInfo of this.shards.values()) {
            try {
                const document = await shardInfo.store.get(id, indexName);
                if (document) {
                    this.updateStats('read');
                    return document;
                }
            } catch (error) {
                }
        }

        this.updateStats('read');
        return null;
    }

    async delete(id: string, indexName?: string): Promise<boolean> {
        this.validateId(id);

        try {
            let deleted = false;

            // Delete from all shards that might contain the document
            for (const shardInfo of this.shards.values()) {
                try {
                    const result = await shardInfo.store.delete(id, indexName);
                    if (result) {
                        deleted = true;
                        shardInfo.documentCount--;
                        this.stats.totalDocuments--;

                        if (this.onDocumentDeleted) {
                            this.onDocumentDeleted(id, indexName || 'unknown');
                        }
                    }
                } catch (error) {
                    }
            }

            if (deleted) {
                this.updateStats('delete');
                await this.updateShardStats();
            }

            return deleted;
        } catch (error) {
            console.error('Failed to delete document:', error);
            return false;
        }
    }

    async exists(id: string, indexName?: string): Promise<boolean> {
        this.validateId(id);

        // Check if document exists in any shard
        for (const shardInfo of this.shards.values()) {
            try {
                if (await shardInfo.store.exists(id, indexName)) {
                    return true;
                }
            } catch (error) {
                }
        }

        return false;
    }

    // Bulk operations
    async putBatch(documents: Document[]): Promise<BulkOperationResult> {
        const result: BulkOperationResult = {
            success: true,
            processed: 0,
            failed: 0,
            errors: []
        };

        // Group documents by shard for efficient batch operations
        const shardBatches = new Map<number, Document[]>();

        for (const document of documents) {
            const primaryShardId = this.getShardIds(document)[0];
            if (!shardBatches.has(primaryShardId)) {
                shardBatches.set(primaryShardId, []);
            }
            shardBatches.get(primaryShardId)!.push(document);
        }

        // Execute batch operations on each shard
        for (const [shardId, shardDocuments] of shardBatches.entries()) {
            const shard = this.shards.get(shardId);
            if (shard) {
                try {
                    const shardResult = await shard.store.putBatch(shardDocuments);
                    result.processed += shardResult.processed;
                    result.failed += shardResult.failed;
                    result.errors.push(...shardResult.errors);
                } catch (error) {
                    result.failed += shardDocuments.length;
                    for (const doc of shardDocuments) {
                        result.errors.push({
                            id: doc.id,
                            error: `Shard ${shardId} failed: ${error.message}`
                        });
                    }
                }
            }
        }

        result.success = result.failed === 0;
        await this.updateShardStats();

        return result;
    }

    async getBatch(ids: string[], indexName?: string): Promise<Map<string, Document>> {
        const result = new Map<string, Document>();

        // Parallel queries across all shards
        const promises = Array.from(this.shards.values()).map(async (shardInfo) => {
            try {
                return await shardInfo.store.getBatch(ids, indexName);
            } catch (error) {
                return new Map<string, Document>();
            }
        });

        const shardResults = await Promise.all(promises);

        // Merge results (first occurrence wins)
        for (const shardResult of shardResults) {
            for (const [id, document] of shardResult.entries()) {
                if (!result.has(id)) {
                    result.set(id, document);
                }
            }
        }

        return result;
    }

    async deleteBatch(ids: string[], indexName?: string): Promise<BulkOperationResult> {
        const result: BulkOperationResult = {
            success: true,
            processed: 0,
            failed: 0,
            errors: []
        };

        // Delete from all shards in parallel
        const promises = Array.from(this.shards.values()).map(async (shardInfo) => {
            try {
                return await shardInfo.store.deleteBatch(ids, indexName);
            } catch (error) {
                return {
                    success: false,
                    processed: 0,
                    failed: ids.length,
                    errors: ids.map(id => ({ id, error: `Shard ${shardInfo.id} failed: ${error.message}` }))
                };
            }
        });

        const shardResults = await Promise.all(promises);

        // Aggregate results
        for (const shardResult of shardResults) {
            result.processed += shardResult.processed;
            result.failed += shardResult.failed;
            result.errors.push(...shardResult.errors);
        }

        result.success = result.failed === 0;
        await this.updateShardStats();

        return result;
    }

    // Query operations
    async find(filter: DocumentFilter): Promise<Document[]> {
        const results: Document[] = [];

        // Query all shards in parallel
        const promises = Array.from(this.shards.values()).map(async (shardInfo) => {
            try {
                return await shardInfo.store.find(filter);
            } catch (error) {
                return [];
            }
        });

        const shardResults = await Promise.all(promises);

        // Merge results and handle deduplication
        const documentMap = new Map<string, Document>();

        for (const shardResult of shardResults) {
            for (const document of shardResult) {
                const key = `${document.indexName}:${document.id}`;
                if (!documentMap.has(key)) {
                    documentMap.set(key, document);
                }
            }
        }

        results.push(...documentMap.values());

        // Apply pagination at the global level
        const offset = filter.offset || 0;
        const limit = filter.limit || results.length;

        this.updateStats('read', results.length);
        return results.slice(offset, offset + limit);
    }

    async count(filter: DocumentFilter): Promise<number> {
        // Count from all shards and deduplicate
        const promises = Array.from(this.shards.values()).map(async (shardInfo) => {
            try {
                return await shardInfo.store.find({ ...filter, limit: undefined, offset: undefined });
            } catch (error) {
                return [];
            }
        });

        const shardResults = await Promise.all(promises);

        // Deduplicate across shards
        const documentSet = new Set<string>();

        for (const shardResult of shardResults) {
            for (const document of shardResult) {
                documentSet.add(`${document.indexName}:${document.id}`);
            }
        }

        return documentSet.size;
    }

    // Index management
    async createIndex(indexName: string, options?: StorageOptions): Promise<boolean> {
        this.validateIndexName(indexName);

        // Create index on all shards
        const promises = Array.from(this.shards.values()).map(shardInfo =>
            shardInfo.store.createIndex(indexName, options)
        );

        const results = await Promise.all(promises);
        const success = results.some(r => r);

        if (success) {
            this.stats.totalIndexes++;
            }

        return success;
    }

    async deleteIndex(indexName: string): Promise<boolean> {
        this.validateIndexName(indexName);

        // Delete index from all shards
        const promises = Array.from(this.shards.values()).map(shardInfo =>
            shardInfo.store.deleteIndex(indexName)
        );

        const results = await Promise.all(promises);
        const success = results.some(r => r);

        if (success) {
            this.stats.totalIndexes--;
            await this.updateShardStats();
            }

        return success;
    }

    async listIndexes(): Promise<string[]> {
        // Get indexes from the first shard (should be consistent across all shards)
        const firstShard = this.shards.values().next().value;
        if (firstShard) {
            return await firstShard.store.listIndexes();
        }
        return [];
    }

    async getIndexStats(indexName: string): Promise<StorageStats> {
        // Aggregate stats from all shards
        const promises = Array.from(this.shards.values()).map(shardInfo =>
            shardInfo.store.getIndexStats(indexName)
        );

        const shardStats = await Promise.all(promises);

        const aggregatedStats: StorageStats = {
            totalDocuments: 0,
            totalIndexes: 1,
            memoryUsage: 0,
            diskUsage: 0,
            operations: {
                reads: 0,
                writes: 0,
                deletes: 0
            }
        };

        for (const stats of shardStats) {
            aggregatedStats.totalDocuments += stats.totalDocuments;
            aggregatedStats.memoryUsage += stats.memoryUsage;
            aggregatedStats.diskUsage += stats.diskUsage || 0;
            aggregatedStats.operations.reads += stats.operations.reads;
            aggregatedStats.operations.writes += stats.operations.writes;
            aggregatedStats.operations.deletes += stats.operations.deletes;
        }

        return aggregatedStats;
    }

    // Persistence operations
    async flush(): Promise<boolean> {
        const promises = Array.from(this.shards.values()).map(shardInfo =>
            shardInfo.store.flush()
        );

        const results = await Promise.all(promises);
        return results.every(r => r);
    }

    async backup(destination: string): Promise<boolean> {
        try {
            if (!fs.existsSync(destination)) {
                fs.mkdirSync(destination, { recursive: true });
            }

            // Backup each shard
            const promises = Array.from(this.shards.values()).map(async (shardInfo) => {
                const shardBackupDir = path.join(destination, `shard-${shardInfo.id}`);
                return await shardInfo.store.backup(shardBackupDir);
            });

            const results = await Promise.all(promises);
            const success = results.every(r => r);

            if (success) {
                // Save shard metadata
                const metadata = {
                    numShards: this.numShards,
                    shardingStrategy: this.shardingStrategy,
                    replicationFactor: this.replicationFactor,
                    timestamp: new Date().toISOString(),
                    stats: this.getStats()
                };

                fs.writeFileSync(
                    path.join(destination, 'shard-metadata.json'),
                    JSON.stringify(metadata, null, 2)
                );

                }

            return success;
        } catch (error) {
            console.error('Sharded backup failed:', error);
            return false;
        }
    }

    async restore(source: string): Promise<boolean> {
        try {
            const metadataPath = path.join(source, 'shard-metadata.json');
            if (!fs.existsSync(metadataPath)) {
                throw new Error('Shard metadata not found in backup');
            }

            const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

            // Validate backup compatibility
            if (metadata.numShards !== this.numShards) {
                }

            // Restore each shard
            const promises = Array.from(this.shards.values()).map(async (shardInfo) => {
                const shardBackupDir = path.join(source, `shard-${shardInfo.id}`);
                if (fs.existsSync(shardBackupDir)) {
                    return await shardInfo.store.restore(shardBackupDir);
                }
                return false;
            });

            const results = await Promise.all(promises);
            const success = results.some(r => r);

            if (success) {
                await this.loadShardStats();
                }

            return success;
        } catch (error) {
            console.error('Sharded restore failed:', error);
            return false;
        }
    }

    async createSnapshot(): Promise<DocumentStoreSnapshot> {
        const allDocuments = new Map<string, Document>();

        // Collect snapshots from all shards
        const promises = Array.from(this.shards.values()).map(shardInfo =>
            shardInfo.store.createSnapshot()
        );

        const shardSnapshots = await Promise.all(promises);

        // Merge documents (handle deduplication)
        for (const snapshot of shardSnapshots) {
            for (const [key, document] of snapshot.documents.entries()) {
                if (!allDocuments.has(key)) {
                    allDocuments.set(key, document);
                }
            }
        }

        return {
            version: '1.0.0',
            timestamp: Date.now(),
            documents: allDocuments,
            metadata: {
                sharding: {
                    numShards: this.numShards,
                    strategy: this.shardingStrategy,
                    replicationFactor: this.replicationFactor
                },
                stats: this.getStats(),
                shardSnapshots: shardSnapshots.map(s => s.metadata)
            }
        };
    }

    async loadSnapshot(snapshot: DocumentStoreSnapshot): Promise<boolean> {
        try {
            // Clear all shards
            await this.clear();

            // Redistribute documents across shards
            for (const document of snapshot.documents.values()) {
                await this.put(document);
            }

            return true;
        } catch (error) {
            console.error('Failed to load sharded snapshot:', error);
            return false;
        }
    }

    // Maintenance operations
    async compact(): Promise<boolean> {
        const promises = Array.from(this.shards.values()).map(shardInfo =>
            shardInfo.store.compact()
        );

        const results = await Promise.all(promises);
        const success = results.every(r => r);

        if (success) {
            }

        return success;
    }

    async clear(indexName?: string): Promise<boolean> {
        const promises = Array.from(this.shards.values()).map(shardInfo =>
            shardInfo.store.clear(indexName)
        );

        const results = await Promise.all(promises);
        const success = results.every(r => r);

        if (success) {
            if (indexName) {
                } else {
                this.stats.totalDocuments = 0;
                this.stats.totalIndexes = 0;
                await this.updateShardStats();
                }
        }

        return success;
    }

    getStats(): StorageStats {
        return { ...this.stats };
    }

    // Sharding-specific methods
    async rebalance(): Promise<boolean> {
        try {
            // Get current distribution
            const shardSizes = Array.from(this.shards.values()).map(s => s.documentCount);
            const totalDocs = shardSizes.reduce((sum, count) => sum + count, 0);
            const averageSize = totalDocs / this.numShards;

            // Find over-loaded and under-loaded shards
            const moveOperations: Array<{
                fromShard: number;
                toShard: number;
                documents: Document[];
            }> = [];

            for (const [shardId, shardInfo] of this.shards.entries()) {
                const deviation = (shardInfo.documentCount - averageSize) / averageSize;

                if (Math.abs(deviation) > this.rebalanceThreshold) {
                    // This shard needs rebalancing
                    .toFixed(1)}% deviation)`);
                }
            }

            // Execute move operations
            for (const operation of moveOperations) {
                // Implementation would move documents between shards
                }

            return true;
        } catch (error) {
            console.error('❌ Shard rebalancing failed:', error);
            return false;
        }
    }

    getShardDistribution(): Array<{ shardId: number; documentCount: number; size: number; percentage: number }> {
        const totalDocs = this.stats.totalDocuments;

        return Array.from(this.shards.values()).map(shard => ({
            shardId: shard.id,
            documentCount: shard.documentCount,
            size: shard.size,
            percentage: totalDocs > 0 ? (shard.documentCount / totalDocs) * 100 : 0
        }));
    }

    // Private helper methods
    private getShardIds(document: Document): number[] {
        const primaryShardId = this.getShardId(document);
        const shardIds = [primaryShardId];

        // Add replica shards if replication is enabled
        for (let i = 1; i < this.replicationFactor; i++) {
            const replicaShardId = (primaryShardId + i) % this.numShards;
            shardIds.push(replicaShardId);
        }

        return shardIds;
    }

    private getShardId(document: Document): number {
        switch (this.shardingStrategy) {
            case 'hash':
                return this.hashShardId(document.id);
            case 'round-robin':
                return this.roundRobinShardId();
            case 'range':
                return this.rangeShardId(document);
            case 'custom':
                return this.customShardFunction ? this.customShardFunction(document) : this.hashShardId(document.id);
            default:
                return this.hashShardId(document.id);
        }
    }

    private hashShardId(key: string): number {
        let hash = 0;
        for (let i = 0; i < key.length; i++) {
            hash = ((hash << 5) - hash + key.charCodeAt(i)) & 0x7fffffff;
        }
        return hash % this.numShards;
    }

    private roundRobinShardId(): number {
        const shardId = this.roundRobinCounter % this.numShards;
        this.roundRobinCounter++;
        return shardId;
    }

    private rangeShardId(document: Document): number {
        // Simple range sharding based on document ID lexicographic order
        const firstChar = document.id.charAt(0).toLowerCase();
        const charCode = firstChar.charCodeAt(0);
        const range = Math.floor((charCode - 97) / (26 / this.numShards)); // 'a' = 97
        return Math.max(0, Math.min(range, this.numShards - 1));
    }

    private async loadShardStats(): Promise<void> {
        this.stats.totalDocuments = 0;
        this.stats.totalIndexes = 0;

        for (const shardInfo of this.shards.values()) {
            const shardStats = shardInfo.store.getStats();
            shardInfo.documentCount = shardStats.totalDocuments;
            shardInfo.size = shardStats.diskUsage || 0;

            this.stats.totalDocuments += shardStats.totalDocuments;
            this.stats.operations.reads += shardStats.operations.reads;
            this.stats.operations.writes += shardStats.operations.writes;
            this.stats.operations.deletes += shardStats.operations.deletes;
        }

        // Get index count from first shard (should be consistent)
        const firstShard = this.shards.values().next().value;
        if (firstShard) {
            const indexes = await firstShard.store.listIndexes();
            this.stats.totalIndexes = indexes.length;
        }
    }

    private async updateShardStats(): Promise<void> {
        for (const shardInfo of this.shards.values()) {
            const shardStats = shardInfo.store.getStats();
            shardInfo.documentCount = shardStats.totalDocuments;
            shardInfo.size = shardStats.diskUsage || 0;
        }

        // Recalculate totals
        this.stats.totalDocuments = Array.from(this.shards.values())
            .reduce((sum, shard) => sum + shard.documentCount, 0);
    }

    private async checkRebalance(): Promise<void> {
        if (!this.autoRebalance) return;

        const shardSizes = Array.from(this.shards.values()).map(s => s.documentCount);
        const totalDocs = shardSizes.reduce((sum, count) => sum + count, 0);

        if (totalDocs === 0) return;

        const averageSize = totalDocs / this.numShards;
        const maxDeviation = Math.max(...shardSizes.map(size => Math.abs((size - averageSize) / averageSize)));

        if (maxDeviation > this.rebalanceThreshold) {
            .toFixed(1)}%), triggering rebalance...`);
            await this.rebalance();
        }
    }
}

export default ShardedDocumentStore;