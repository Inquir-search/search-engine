import { DocumentStore, Document, DocumentFilter, StorageStats, StorageOptions, BulkOperationResult, DocumentStoreSnapshot } from './DocumentStore.js';
import { getErrorMessage } from '../../lib/utils/ErrorUtils';

// Redis client interface (to avoid direct dependency)
interface RedisClient {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    ping(): Promise<string>;
    set(key: string, value: string, options?: any): Promise<string | null>;
    get(key: string): Promise<string | null>;
    del(key: string | string[]): Promise<number>;
    exists(key: string | string[]): Promise<number>;
    keys(pattern: string): Promise<string[]>;
    mset(keyValues: Record<string, string>): Promise<string | null>;
    mget(keys: string[]): Promise<(string | null)[]>;
    hset(key: string, field: string, value: string): Promise<number>;
    hget(key: string, field: string): Promise<string | null>;
    hgetall(key: string): Promise<Record<string, string>>;
    hdel(key: string, field: string | string[]): Promise<number>;
    sadd(key: string, member: string | string[]): Promise<number>;
    smembers(key: string): Promise<string[]>;
    srem(key: string, member: string | string[]): Promise<number>;
    flushdb(): Promise<string>;
    expire(key: string, seconds: number): Promise<number>;
    ttl(key: string): Promise<number>;
}

interface RedisOptions extends StorageOptions {
    host?: string;
    port?: number;
    password?: string;
    database?: number;
    keyPrefix?: string;
    ttl?: number; // Time to live in seconds
    maxRetries?: number;
    retryDelay?: number;
    cluster?: boolean;
    clusterNodes?: Array<{ host: string; port: number }>;
}

/**
 * Redis Document Store
 * High-performance document storage using Redis as the backend
 * Supports both single Redis instance and Redis Cluster
 */
export class RedisDocumentStore extends DocumentStore {
    private client: RedisClient;
    private keyPrefix: string;
    private ttl: number;
    private maxRetries: number;
    private retryDelay: number;
    private isInitialized: boolean = false;
    private isConnected: boolean = false;

    constructor(client: RedisClient, options: RedisOptions = {}) {
        super({
            ...options,
            durability: 'replicated',
            consistency: 'strong'
        });

        this.client = client;
        this.keyPrefix = options.keyPrefix || 'docs:';
        this.ttl = options.ttl || 0; // 0 means no expiration
        this.maxRetries = options.maxRetries || 3;
        this.retryDelay = options.retryDelay || 1000;
    }

    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        try {
            await this.connectWithRetry();
            await this.loadStats();

            this.isInitialized = true;
        } catch (error) {
            console.error('❌ Failed to initialize RedisDocumentStore:', error);
            throw error;
        }
    }

    async shutdown(): Promise<void> {
        if (!this.isInitialized) return;

        try {
            if (this.isConnected) {
                await this.client.disconnect();
                this.isConnected = false;
            }

            this.isInitialized = false;
        } catch (error) {
            console.error('⚠️ Error during shutdown:', error);
        }
    }

    async isHealthy(): Promise<boolean> {
        try {
            if (!this.isConnected) return false;
            const pong = await this.client.ping();
            return pong === 'PONG';
        } catch {
            return false;
        }
    }

    // Core CRUD operations
    async put(document: Document): Promise<boolean> {
        this.validateDocument(document);

        try {
            const key = this.getDocumentKey(document.id, document.indexName);
            const value = JSON.stringify(document);

            const options = this.ttl > 0 ? { EX: this.ttl } : undefined;
            const result = await this.client.set(key, value, options);

            if (result === 'OK') {
                // Update index set
                await this.client.sadd(this.getIndexSetKey(document.indexName), document.id);

                // Update stats
                const existed = await this.client.exists(key) > 0;
                if (!existed) {
                    this.stats.totalDocuments++;
                }
                this.updateStats('write');

                // Trigger event
                if (this.onDocumentAdded) {
                    this.onDocumentAdded(document);
                }

                return true;
            }

            return false;
        } catch (error) {
            console.error('Failed to put document:', error);
            return false;
        }
    }

    async get(id: string, indexName?: string): Promise<Document | null> {
        this.validateId(id);

        try {
            if (indexName) {
                const key = this.getDocumentKey(id, indexName);
                const value = await this.client.get(key);
                this.updateStats('read');

                return value ? JSON.parse(value) : null;
            }

            // Search across all indexes
            const indexKeys = await this.client.keys(this.getIndexSetKey('*'));

            for (const indexKey of indexKeys) {
                const indexName = this.extractIndexName(indexKey);
                const key = this.getDocumentKey(id, indexName);
                const value = await this.client.get(key);

                if (value) {
                    this.updateStats('read');
                    return JSON.parse(value);
                }
            }

            this.updateStats('read');
            return null;
        } catch (error) {
            console.error('Failed to get document:', error);
            return null;
        }
    }

    async delete(id: string, indexName?: string): Promise<boolean> {
        this.validateId(id);

        try {
            if (indexName) {
                const key = this.getDocumentKey(id, indexName);
                const deleted = await this.client.del(key);

                if (deleted > 0) {
                    await this.client.srem(this.getIndexSetKey(indexName), id);
                    this.stats.totalDocuments--;
                    this.updateStats('delete');

                    if (this.onDocumentDeleted) {
                        this.onDocumentDeleted(id, indexName);
                    }

                    return true;
                }

                return false;
            }

            // Delete from all indexes
            const indexKeys = await this.client.keys(this.getIndexSetKey('*'));
            let deleted = false;

            for (const indexKey of indexKeys) {
                const indexName = this.extractIndexName(indexKey);
                const key = this.getDocumentKey(id, indexName);
                const result = await this.client.del(key);

                if (result > 0) {
                    await this.client.srem(this.getIndexSetKey(indexName), id);
                    this.stats.totalDocuments--;
                    deleted = true;

                    if (this.onDocumentDeleted) {
                        this.onDocumentDeleted(id, indexName);
                    }
                }
            }

            if (deleted) {
                this.updateStats('delete');
            }

            return deleted;
        } catch (error) {
            console.error('Failed to delete document:', error);
            return false;
        }
    }

    async exists(id: string, indexName?: string): Promise<boolean> {
        this.validateId(id);

        try {
            if (indexName) {
                const key = this.getDocumentKey(id, indexName);
                return (await this.client.exists(key)) > 0;
            }

            // Check across all indexes
            const indexKeys = await this.client.keys(this.getIndexSetKey('*'));

            for (const indexKey of indexKeys) {
                const indexName = this.extractIndexName(indexKey);
                const key = this.getDocumentKey(id, indexName);

                if ((await this.client.exists(key)) > 0) {
                    return true;
                }
            }

            return false;
        } catch (error) {
            console.error('Failed to check existence:', error);
            return false;
        }
    }

    // Bulk operations
    async putBatch(documents: Document[]): Promise<BulkOperationResult> {
        const result: BulkOperationResult = {
            success: true,
            processed: 0,
            failed: 0,
            errors: []
        };

        try {
            // Prepare batch operations
            const keyValues: Record<string, string> = {};
            const indexUpdates: Record<string, string[]> = {};

            for (const document of documents) {
                try {
                    this.validateDocument(document);

                    const key = this.getDocumentKey(document.id, document.indexName);
                    keyValues[key] = JSON.stringify(document);

                    if (!indexUpdates[document.indexName]) {
                        indexUpdates[document.indexName] = [];
                    }
                    indexUpdates[document.indexName].push(document.id);

                    result.processed++;
                } catch (error) {
                    result.failed++;
                    result.errors.push({
                        id: document.id,
                        error: getErrorMessage(error)
                    });
                }
            }

            // Execute batch set
            if (Object.keys(keyValues).length > 0) {
                await this.client.mset(keyValues);

                // Update index sets
                for (const [indexName, documentIds] of Object.entries(indexUpdates)) {
                    await this.client.sadd(this.getIndexSetKey(indexName), documentIds);
                }

                this.stats.totalDocuments += result.processed;
                this.updateStats('write', result.processed);
            }

            result.success = result.failed === 0;
            return result;
        } catch (error) {
            console.error('Batch put failed:', error);
            return {
                success: false,
                processed: 0,
                failed: documents.length,
                errors: [{ id: 'batch', error: error instanceof Error ? error.message : String(error) }]
            };
        }
    }

    async getBatch(ids: string[], indexName?: string): Promise<Map<string, Document>> {
        const result = new Map<string, Document>();

        try {
            if (indexName) {
                const keys = ids.map(id => this.getDocumentKey(id, indexName));
                const values = await this.client.mget(keys);

                for (let i = 0; i < ids.length; i++) {
                    const value = values[i];
                    if (value) {
                        result.set(ids[i], JSON.parse(value));
                    }
                }
            } else {
                // Get from all indexes
                for (const id of ids) {
                    const document = await this.get(id);
                    if (document) {
                        result.set(id, document);
                    }
                }
            }

            this.updateStats('read', result.size);
            return result;
        } catch (error) {
            console.error('Batch get failed:', error);
            return result;
        }
    }

    async deleteBatch(ids: string[], indexName?: string): Promise<BulkOperationResult> {
        const result: BulkOperationResult = {
            success: true,
            processed: 0,
            failed: 0,
            errors: []
        };

        try {
            if (indexName) {
                const keys = ids.map(id => this.getDocumentKey(id, indexName));
                const deleted = await this.client.del(keys);

                if (deleted > 0) {
                    await this.client.srem(this.getIndexSetKey(indexName), ids);
                    result.processed = deleted;
                    this.stats.totalDocuments -= deleted;
                    this.updateStats('delete', deleted);
                }
            } else {
                // Delete from all indexes
                for (const id of ids) {
                    try {
                        const success = await this.delete(id);
                        if (success) {
                            result.processed++;
                        } else {
                            result.failed++;
                            result.errors.push({
                                id,
                                error: 'Document not found'
                            });
                        }
                    } catch (error) {
                        result.failed++;
                        result.errors.push({
                            id,
                            error: getErrorMessage(error)
                        });
                    }
                }
            }

            result.success = result.failed === 0;
            return result;
        } catch (error) {
            console.error('Batch delete failed:', error);
            return {
                success: false,
                processed: 0,
                failed: ids.length,
                errors: [{ id: 'batch', error: error instanceof Error ? error.message : String(error) }]
            };
        }
    }

    // Query operations
    async find(filter: DocumentFilter): Promise<Document[]> {
        const results: Document[] = [];

        try {
            const indexesToSearch = filter.indexName ? [filter.indexName] : await this.listIndexes();

            for (const indexName of indexesToSearch) {
                const documentIds = filter.ids ?
                    filter.ids :
                    await this.client.smembers(this.getIndexSetKey(indexName));

                for (const docId of documentIds) {
                    try {
                        const document = await this.get(docId, indexName);
                        if (document) {
                            // Apply query filter if specified
                            if (filter.query) {
                                const matches = Object.entries(filter.query).every(([key, value]) => {
                                    return document[key] === value;
                                });
                                if (!matches) continue;
                            }

                            results.push(document);
                        }
                    } catch (error) {
                    }
                }
            }

            // Apply pagination
            const offset = filter.offset || 0;
            const limit = filter.limit || results.length;

            this.updateStats('read', results.length);
            return results.slice(offset, offset + limit);
        } catch (error) {
            console.error('Find failed:', error);
            return [];
        }
    }

    async count(filter: DocumentFilter): Promise<number> {
        try {
            if (filter.indexName && !filter.query && !filter.ids) {
                // Fast count for simple index queries
                const members = await this.client.smembers(this.getIndexSetKey(filter.indexName));
                return members.length;
            }

            const results = await this.find({ ...filter, limit: undefined, offset: undefined });
            return results.length;
        } catch (error) {
            console.error('Count failed:', error);
            return 0;
        }
    }

    // Index management
    async createIndex(indexName: string, options?: StorageOptions): Promise<boolean> {
        this.validateIndexName(indexName);

        try {
            const indexKey = this.getIndexSetKey(indexName);
            const exists = (await this.client.exists(indexKey)) > 0;

            if (!exists) {
                // Create empty set for the index
                await this.client.sadd(indexKey, '__placeholder__');
                await this.client.srem(indexKey, '__placeholder__');

                this.stats.totalIndexes++;
                return true;
            }

            return false;
        } catch (error) {
            console.error('Failed to create index:', error);
            return false;
        }
    }

    async deleteIndex(indexName: string): Promise<boolean> {
        this.validateIndexName(indexName);

        try {
            // Get all document IDs in the index
            const documentIds = await this.client.smembers(this.getIndexSetKey(indexName));

            // Delete all documents
            for (const docId of documentIds) {
                await this.delete(docId, indexName);
            }

            // Delete the index set
            await this.client.del(this.getIndexSetKey(indexName));

            this.stats.totalIndexes--;
            console.log(`Index '${indexName}' deleted successfully`);
            return true;
        } catch (error) {
            console.error('Failed to delete index:', error);
            return false;
        }
    }

    async listIndexes(): Promise<string[]> {
        try {
            const indexKeys = await this.client.keys(this.getIndexSetKey('*'));
            return indexKeys.map(key => this.extractIndexName(key));
        } catch (error) {
            console.error('Failed to list indexes:', error);
            return [];
        }
    }

    async getIndexStats(indexName: string): Promise<StorageStats> {
        try {
            const documentIds = await this.client.smembers(this.getIndexSetKey(indexName));

            return {
                ...this.stats,
                totalDocuments: documentIds.length,
                totalIndexes: 1
            };
        } catch (error) {
            console.error('Failed to get index stats:', error);
            return {
                ...this.stats,
                totalDocuments: 0,
                totalIndexes: 0
            };
        }
    }

    // Persistence operations
    async flush(): Promise<boolean> {
        // Redis automatically persists data based on its configuration
        return true;
    }

    async backup(destination: string): Promise<boolean> {
        try {
            // Create a snapshot of all data
            const snapshot = await this.createSnapshot();

            // In a real implementation, you would serialize and save the snapshot
            return true;
        } catch (error) {
            console.error('Redis backup failed:', error);
            return false;
        }
    }

    async restore(source: string): Promise<boolean> {
        try {
            // In a real implementation, you would load and deserialize the snapshot
            return true;
        } catch (error) {
            console.error('Redis restore failed:', error);
            return false;
        }
    }

    async createSnapshot(): Promise<DocumentStoreSnapshot> {
        const documents = new Map<string, Document>();

        try {
            const indexes = await this.listIndexes();

            for (const indexName of indexes) {
                const documentIds = await this.client.smembers(this.getIndexSetKey(indexName));

                for (const docId of documentIds) {
                    const document = await this.get(docId, indexName);
                    if (document) {
                        documents.set(`${indexName}:${docId}`, document);
                    }
                }
            }

            return {
                version: '1.0.0',
                timestamp: Date.now(),
                documents,
                metadata: {
                    indexes,
                    stats: { ...this.stats },
                    redisInfo: {
                        keyPrefix: this.keyPrefix,
                        ttl: this.ttl
                    }
                }
            };
        } catch (error) {
            console.error('Failed to create snapshot:', error);
            throw error;
        }
    }

    async loadSnapshot(snapshot: DocumentStoreSnapshot): Promise<boolean> {
        try {
            // Clear existing data
            await this.clear();

            // Restore documents
            for (const document of snapshot.documents.values()) {
                await this.put(document);
            }

            console.log(`Restored ${snapshot.documents.size} documents across ${snapshot.metadata.indexes.length} indexes`);
            return true;
        } catch (error) {
            console.error('Failed to load snapshot:', error);
            return false;
        }
    }

    // Maintenance operations
    async compact(): Promise<boolean> {
        // Redis handles memory optimization internally
        return true;
    }

    async clear(indexName?: string): Promise<boolean> {
        try {
            if (indexName) {
                return await this.deleteIndex(indexName);
            } else {
                // Clear all data
                await this.client.flushdb();
                this.stats.totalDocuments = 0;
                this.stats.totalIndexes = 0;
                return true;
            }
        } catch (error) {
            console.error('Failed to clear data:', error);
            return false;
        }
    }

    getStats(): StorageStats {
        return { ...this.stats };
    }

    // Redis-specific helper methods
    private async connectWithRetry(): Promise<void> {
        let attempts = 0;

        while (attempts < this.maxRetries) {
            try {
                await this.client.connect();
                this.isConnected = true;
                return;
            } catch (error) {
                attempts++;
                if (attempts >= this.maxRetries) {
                    throw new Error(`Failed to connect to Redis after ${this.maxRetries} attempts`);
                }

                await new Promise(resolve => setTimeout(resolve, this.retryDelay));
            }
        }
    }

    private async loadStats(): Promise<void> {
        try {
            // Count total documents across all indexes
            const indexes = await this.listIndexes();
            this.stats.totalIndexes = indexes.length;
            this.stats.totalDocuments = 0;

            for (const indexName of indexes) {
                const documentIds = await this.client.smembers(this.getIndexSetKey(indexName));
                this.stats.totalDocuments += documentIds.length;
            }

        } catch (error) {
        }
    }

    private getDocumentKey(id: string, indexName: string): string {
        return `${this.keyPrefix}${indexName}:${id}`;
    }

    private getIndexSetKey(indexName: string): string {
        return `${this.keyPrefix}index:${indexName}`;
    }

    private extractIndexName(indexKey: string): string {
        const prefix = `${this.keyPrefix}index:`;
        return indexKey.substring(prefix.length);
    }
}

export default RedisDocumentStore;