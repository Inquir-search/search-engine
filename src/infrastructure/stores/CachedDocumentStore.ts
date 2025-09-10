import { DocumentStore, Document, DocumentFilter, StorageStats, StorageOptions, BulkOperationResult, DocumentStoreSnapshot } from './DocumentStore.js';
import { InMemoryDocumentStore } from './InMemoryDocumentStore.js';
import * as fs from 'fs';

export interface CacheConfig {
    enabled: boolean;
    maxSize: number; // Maximum number of documents to cache
    ttl: number; // Time to live in milliseconds
    strategy: 'lru' | 'lfu' | 'fifo';
    writeThrough: boolean; // Write to both cache and persistent store
    writeBack: boolean; // Write to persistent store asynchronously
    prefetchEnabled: boolean;
    compressionEnabled: boolean;
}

export interface CacheStats extends StorageStats {
    cacheSize: number;
    cacheMaxSize: number;
    hitRate: number;
    missRate: number;
    evictions: number;
    prefetches: number;
}

interface CacheEntry {
    document: Document;
    accessTime: number;
    accessCount: number;
    createdTime: number;
    dirty: boolean; // Needs to be written back to persistent store
}

interface FileHandle {
    path: string;
    handle: fs.promises.FileHandle | null;
    refCount: number;
    lastAccess: number;
}

/**
 * CachedDocumentStore
 * A wrapper that provides caching layer over any DocumentStore implementation
 * Optimizes file access by maintaining file handles and provides in-memory caching
 */
export class CachedDocumentStore extends DocumentStore {
    private persistentStore: DocumentStore;
    private cache: Map<string, CacheEntry> = new Map();
    private config: CacheConfig;
    private cacheStats: CacheStats;
    private fileHandles: Map<string, FileHandle> = new Map();
    private writeBackQueue: Set<string> = new Set();
    private writeBackTimer: NodeJS.Timeout | null = null;
    private prefetchQueue: Set<string> = new Set();

    constructor(persistentStore: DocumentStore, config: Partial<CacheConfig> = {}) {
        super((persistentStore as any).options || {});

        this.persistentStore = persistentStore;
        this.config = {
            enabled: true,
            maxSize: 10000,
            ttl: 300000, // 5 minutes
            strategy: 'lru',
            writeThrough: true,
            writeBack: false,
            prefetchEnabled: true,
            compressionEnabled: false,
            ...config
        };

        this.cacheStats = {
            ...this.stats,
            cacheSize: 0,
            cacheMaxSize: this.config.maxSize,
            hitRate: 0,
            missRate: 0,
            evictions: 0,
            prefetches: 0
        };

        this.startWriteBackProcessor();
    }

    async initialize(): Promise<void> {
        await this.persistentStore.initialize();
    }

    async shutdown(): Promise<void> {
        // Flush write-back queue
        await this.flushWriteBackQueue();

        // Close all file handles
        await this.closeAllFileHandles();

        // Stop write-back processor
        if (this.writeBackTimer) {
            clearInterval(this.writeBackTimer);
        }

        await this.persistentStore.shutdown();
        this.cache.clear();
    }

    async isHealthy(): Promise<boolean> {
        return await this.persistentStore.isHealthy();
    }

    // Core CRUD operations with caching
    async put(document: Document): Promise<boolean> {
        this.validateDocument(document);
        const key = this.getDocumentKey(document.id, document.indexName);

        try {
            // Update cache
            if (this.config.enabled) {
                await this.updateCache(key, document, true);
            }

            // Write to persistent store
            if (this.config.writeThrough) {
                const success = await this.persistentStore.put(document);
                if (!success) return false;
            } else if (this.config.writeBack) {
                this.writeBackQueue.add(key);
            }

            this.updateStats('write');
            return true;
        } catch (error) {
            console.error('Failed to put document:', error);
            return false;
        }
    }

    async get(id: string, indexName?: string): Promise<Document | null> {
        this.validateId(id);
        const key = this.getDocumentKey(id, indexName || 'default');

        try {
            // Check cache first
            if (this.config.enabled) {
                const cached = await this.getFromCache(key);
                if (cached) {
                    this.cacheStats.operations.reads++;
                    this.updateCacheHitRate(true);
                    return cached.document;
                }
            }

            // Cache miss - get from persistent store
            const document = await this.persistentStore.get(id, indexName);
            this.updateCacheHitRate(false);

            // Add to cache
            if (document && this.config.enabled) {
                await this.updateCache(key, document, false);
            }

            // Prefetch related documents
            if (document && this.config.prefetchEnabled) {
                this.schedulePrefetch(document.indexName, id);
            }

            this.updateStats('read');
            return document;
        } catch (error) {
            console.error('Failed to get document:', error);
            return null;
        }
    }

    async delete(id: string, indexName?: string): Promise<boolean> {
        this.validateId(id);
        const key = this.getDocumentKey(id, indexName || 'default');

        try {
            // Remove from cache
            if (this.config.enabled) {
                this.cache.delete(key);
                this.writeBackQueue.delete(key);
            }

            // Delete from persistent store
            const success = await this.persistentStore.delete(id, indexName);

            if (success) {
                this.updateStats('delete');
            }

            return success;
        } catch (error) {
            console.error('Failed to delete document:', error);
            return false;
        }
    }

    async exists(id: string, indexName?: string): Promise<boolean> {
        // Check cache first
        if (this.config.enabled) {
            const key = this.getDocumentKey(id, indexName || 'default');
            if (this.cache.has(key)) {
                return true;
            }
        }

        return await this.persistentStore.exists(id, indexName);
    }

    // Bulk operations with caching optimization
    async putBatch(documents: Document[]): Promise<BulkOperationResult> {
        const result: BulkOperationResult = {
            success: true,
            processed: 0,
            failed: 0,
            errors: []
        };

        for (const doc of documents) {
            try {
                const success = await this.put(doc);
                if (success) {
                    result.processed++;
                } else {
                    result.failed++;
                    result.errors.push({ id: doc.id, error: 'Put operation failed' });
                }
            } catch (error) {
                result.failed++;
                result.errors.push({ id: doc.id, error: (error as Error).message });
            }
        }

        result.success = result.failed === 0;
        return result;
    }

    async getBatch(ids: string[], indexName?: string): Promise<Map<string, Document>> {
        const result = new Map<string, Document>();
        const cacheMisses: string[] = [];

        // Check cache for all documents
        if (this.config.enabled) {
            for (const id of ids) {
                const key = this.getDocumentKey(id, indexName || 'default');
                const cached = await this.getFromCache(key);
                if (cached) {
                    result.set(id, cached.document);
                } else {
                    cacheMisses.push(id);
                }
            }
        } else {
            cacheMisses.push(...ids);
        }

        // Fetch cache misses from persistent store
        if (cacheMisses.length > 0) {
            const persistentResults = await this.persistentStore.getBatch(cacheMisses, indexName);

            // Add to cache and result
            for (const [id, doc] of persistentResults) {
                result.set(id, doc);
                if (this.config.enabled) {
                    const key = this.getDocumentKey(id, indexName || 'default');
                    await this.updateCache(key, doc, false);
                }
            }
        }

        return result;
    }

    async deleteBatch(ids: string[], indexName?: string): Promise<BulkOperationResult> {
        // Remove from cache
        if (this.config.enabled) {
            for (const id of ids) {
                const key = this.getDocumentKey(id, indexName || 'default');
                this.cache.delete(key);
                this.writeBackQueue.delete(key);
            }
        }

        return await this.persistentStore.deleteBatch(ids, indexName);
    }

    // Delegate operations to persistent store
    async find(filter: DocumentFilter): Promise<Document[]> {
        return await this.persistentStore.find(filter);
    }

    async count(filter: DocumentFilter): Promise<number> {
        return await this.persistentStore.count(filter);
    }

    async createIndex(indexName: string, options?: StorageOptions): Promise<boolean> {
        return await this.persistentStore.createIndex(indexName, options);
    }

    async deleteIndex(indexName: string): Promise<boolean> {
        // Clear cache entries for this index
        if (this.config.enabled) {
            for (const [key, entry] of this.cache) {
                if (entry.document.indexName === indexName) {
                    this.cache.delete(key);
                }
            }
        }

        return await this.persistentStore.deleteIndex(indexName);
    }

    async listIndexes(): Promise<string[]> {
        return await this.persistentStore.listIndexes();
    }

    async getIndexStats(indexName: string): Promise<StorageStats> {
        return await this.persistentStore.getIndexStats(indexName);
    }

    // Persistence operations with cache management
    async flush(): Promise<boolean> {
        await this.flushWriteBackQueue();
        return await this.persistentStore.flush();
    }

    async backup(destination: string): Promise<boolean> {
        await this.flushWriteBackQueue();
        return await this.persistentStore.backup(destination);
    }

    async restore(source: string): Promise<boolean> {
        this.cache.clear();
        return await this.persistentStore.restore(source);
    }

    async createSnapshot(): Promise<DocumentStoreSnapshot> {
        await this.flushWriteBackQueue();
        return await this.persistentStore.createSnapshot();
    }

    async loadSnapshot(snapshot: DocumentStoreSnapshot): Promise<boolean> {
        this.cache.clear();
        return await this.persistentStore.loadSnapshot(snapshot);
    }

    async compact(): Promise<boolean> {
        await this.flushWriteBackQueue();
        return await this.persistentStore.compact();
    }

    async clear(indexName?: string): Promise<boolean> {
        if (indexName) {
            // Clear cache entries for specific index
            for (const [key, entry] of this.cache) {
                if (entry.document.indexName === indexName) {
                    this.cache.delete(key);
                }
            }
        } else {
            this.cache.clear();
        }

        return await this.persistentStore.clear(indexName);
    }

    getStats(): CacheStats {
        this.cacheStats.cacheSize = this.cache.size;
        return { ...this.cacheStats };
    }

    // Cache management methods
    private async getFromCache(key: string): Promise<CacheEntry | null> {
        const entry = this.cache.get(key);
        if (!entry) return null;

        // Check TTL
        if (Date.now() - entry.createdTime > this.config.ttl) {
            this.cache.delete(key);
            this.cacheStats.evictions++;
            return null;
        }

        // Update access info
        entry.accessTime = Date.now();
        entry.accessCount++;

        return entry;
    }

    private async updateCache(key: string, document: Document, dirty: boolean): Promise<void> {
        // Check if cache is full and evict if necessary
        if (this.cache.size >= this.config.maxSize && !this.cache.has(key)) {
            await this.evictFromCache();
        }

        const entry: CacheEntry = {
            document: { ...document },
            accessTime: Date.now(),
            accessCount: 1,
            createdTime: Date.now(),
            dirty
        };

        this.cache.set(key, entry);
    }

    private async evictFromCache(): Promise<void> {
        if (this.cache.size === 0) return;

        let keyToEvict: string;

        switch (this.config.strategy) {
            case 'lru':
                keyToEvict = this.findLRUKey();
                break;
            case 'lfu':
                keyToEvict = this.findLFUKey();
                break;
            case 'fifo':
                keyToEvict = this.findFIFOKey();
                break;
            default:
                keyToEvict = this.cache.keys().next().value || '';
        }

        const entry = this.cache.get(keyToEvict);
        if (entry?.dirty && this.config.writeBack) {
            this.writeBackQueue.add(keyToEvict);
        }

        this.cache.delete(keyToEvict);
        this.cacheStats.evictions++;
    }

    private findLRUKey(): string {
        let oldestKey = '';
        let oldestTime = Date.now();

        for (const [key, entry] of this.cache) {
            if (entry.accessTime < oldestTime) {
                oldestTime = entry.accessTime;
                oldestKey = key;
            }
        }

        return oldestKey;
    }

    private findLFUKey(): string {
        let leastUsedKey = '';
        let leastCount = Infinity;

        for (const [key, entry] of this.cache) {
            if (entry.accessCount < leastCount) {
                leastCount = entry.accessCount;
                leastUsedKey = key;
            }
        }

        return leastUsedKey;
    }

    private findFIFOKey(): string {
        let oldestKey = '';
        let oldestTime = Date.now();

        for (const [key, entry] of this.cache) {
            if (entry.createdTime < oldestTime) {
                oldestTime = entry.createdTime;
                oldestKey = key;
            }
        }

        return oldestKey;
    }

    private updateCacheHitRate(hit: boolean): void {
        const total = this.cacheStats.operations.reads + 1;
        if (hit) {
            this.cacheStats.hitRate = ((this.cacheStats.hitRate * (total - 1)) + 1) / total;
        } else {
            this.cacheStats.missRate = ((this.cacheStats.missRate * (total - 1)) + 1) / total;
        }
    }

    private async flushWriteBackQueue(): Promise<void> {
        if (this.writeBackQueue.size === 0) return;

        for (const key of this.writeBackQueue) {
            const entry = this.cache.get(key);
            if (entry?.dirty) {
                try {
                    await this.persistentStore.put(entry.document);
                    entry.dirty = false;
                } catch (error) {
                    console.error(`Failed to write back document ${key}:`, error);
                }
            }
        }

        this.writeBackQueue.clear();
    }

    private startWriteBackProcessor(): void {
        if (!this.config.writeBack) return;

        this.writeBackTimer = setInterval(async () => {
            await this.flushWriteBackQueue();
        }, 10000); // Flush every 10 seconds
    }

    private schedulePrefetch(indexName: string, baseId: string): void {
        if (!this.config.prefetchEnabled) return;

        // Simple prefetch strategy - could be enhanced
        this.prefetchQueue.add(`${indexName}:${baseId}`);

        // Process prefetch queue periodically
        setTimeout(async () => {
            await this.processPrefetchQueue();
        }, 100);
    }

    private async processPrefetchQueue(): Promise<void> {
        if (this.prefetchQueue.size === 0) return;

        const items = Array.from(this.prefetchQueue).slice(0, 10); // Limit prefetch batch
        this.prefetchQueue.clear();

        for (const item of items) {
            try {
                const [indexName, baseId] = item.split(':');
                // Prefetch related documents (implementation depends on use case)
                this.cacheStats.prefetches++;
            } catch (error) {
                console.error('Prefetch failed:', error);
            }
        }
    }

    // File handle optimization
    private async getOptimizedFileHandle(filePath: string): Promise<fs.promises.FileHandle | null> {
        let handle = this.fileHandles.get(filePath);

        if (!handle) {
            try {
                const fileHandle = await fs.promises.open(filePath, 'r');
                handle = {
                    path: filePath,
                    handle: fileHandle,
                    refCount: 1,
                    lastAccess: Date.now()
                };
                this.fileHandles.set(filePath, handle);
            } catch (error) {
                console.error(`Failed to open file handle for ${filePath}:`, error);
                return null;
            }
        } else {
            handle.refCount++;
            handle.lastAccess = Date.now();
        }

        return handle.handle;
    }

    private async releaseFileHandle(filePath: string): Promise<void> {
        const handle = this.fileHandles.get(filePath);
        if (!handle) return;

        handle.refCount--;

        if (handle.refCount <= 0) {
            try {
                await handle.handle?.close();
                this.fileHandles.delete(filePath);
            } catch (error) {
                console.error(`Failed to close file handle for ${filePath}:`, error);
            }
        }
    }

    private async closeAllFileHandles(): Promise<void> {
        for (const [path, handle] of this.fileHandles) {
            try {
                await handle.handle?.close();
            } catch (error) {
                console.error(`Failed to close file handle for ${path}:`, error);
            }
        }
        this.fileHandles.clear();
    }

    private getDocumentKey(id: string, indexName: string): string {
        return `${indexName}:${id}`;
    }
}