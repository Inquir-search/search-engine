import { DocumentStore, Document, DocumentFilter } from './DocumentStore.js';
import { CachedDocumentStore } from './CachedDocumentStore.js';
import { InMemoryDocumentStore } from './InMemoryDocumentStore.js';
import { IQueryEngine, QueryContext } from '../../domain/QueryEngine.js';
import { DocumentId } from '../../domain/valueObjects/index.js';
import { DomainQuery } from '../../application/queries/SearchQuery.js';
import { QueryParser, QueryType } from '../../domain/query';

export interface StoreQueryConfig {
    enableCaching: boolean;
    cacheSize: number;
    prefetchEnabled: boolean;
    parallelQueries: boolean;
    maxParallelQueries: number;
    timeoutMs: number;
}

export interface QueryExecutionStats {
    executionTime: number;
    documentsScanned: number;
    documentsReturned: number;
    cacheHits: number;
    cacheMisses: number;
    storesQueried: number;
    parallelQueries: number;
}

/**
 * StoreBasedQueryEngine
 * A query engine that uses document stores to extract data from persistent layer
 * and performs in-memory search operations with caching optimization
 */
export class StoreBasedQueryEngine implements IQueryEngine {
    private stores: Map<string, DocumentStore> = new Map();
    private defaultStore: string = 'default';
    private config: StoreQueryConfig;
    private inMemoryStore: InMemoryDocumentStore;
    private queryStats: Map<string, QueryExecutionStats> = new Map();

    constructor(config: Partial<StoreQueryConfig> = {}) {
        this.config = {
            enableCaching: true,
            cacheSize: 10000,
            prefetchEnabled: true,
            parallelQueries: true,
            maxParallelQueries: 4,
            timeoutMs: 30000,
            ...config
        };

        // Create in-memory store for fast searches
        this.inMemoryStore = new InMemoryDocumentStore({
            consistency: 'strong',
            durability: 'memory'
        });
    }

    /**
     * Register a document store with the query engine
     */
    registerStore(name: string, store: DocumentStore, isDefault = false): void {
        // Wrap with caching if enabled
        const finalStore = this.config.enableCaching
            ? new CachedDocumentStore(store, {
                enabled: true,
                maxSize: this.config.cacheSize,
                prefetchEnabled: this.config.prefetchEnabled,
                strategy: 'lru'
            })
            : store;

        this.stores.set(name, finalStore);

        if (isDefault || this.stores.size === 1) {
            this.defaultStore = name;
        }

        ' : ''}`);
    }

    /**
     * Initialize all stores and load data into memory
     */
    async initialize(): Promise<void> {
        // Initialize in-memory store
        await this.inMemoryStore.initialize();

        // Initialize all registered stores
        for (const [name, store] of this.stores) {
            try {
                await store.initialize();
                } catch (error) {
                console.error(`❌ Failed to initialize store '${name}':`, error);
            }
        }

        // Load data from persistent stores to in-memory for fast searching
        await this.loadDataToMemory();

        }

    /**
     * Shutdown the query engine and all stores
     */
    async shutdown(): Promise<void> {
        await this.inMemoryStore.shutdown();

        for (const [name, store] of this.stores) {
            try {
                await store.shutdown();
                } catch (error) {
                console.error(`❌ Failed to shutdown store '${name}':`, error);
            }
        }

        this.stores.clear();
        }

    /**
     * Search documents using the query engine
     */
    search(query: DomainQuery, context?: QueryContext): Set<DocumentId> {
        const startTime = Date.now();
        const stats: QueryExecutionStats = {
            executionTime: 0,
            documentsScanned: 0,
            documentsReturned: 0,
            cacheHits: 0,
            cacheMisses: 0,
            storesQueried: 0,
            parallelQueries: 0
        };

        try {
            // Use in-memory store for fast search
            const results = this.searchInMemory(query, context);

            stats.executionTime = Date.now() - startTime;
            stats.documentsReturned = results.size;

            // Store stats for analysis
            const queryHash = this.hashQuery(query);
            this.queryStats.set(queryHash, stats);

            return results;
        } catch (error) {
            console.error('Query execution failed:', error);
            return new Set();
        }
    }

    /**
     * Execute a query (alias for search for interface compatibility)
     */
    execute(query: DomainQuery): Set<DocumentId> {
        return this.search(query);
    }

    /**
     * Add a document to all relevant stores
     */
    async addDocument(document: Document, storeName?: string): Promise<boolean> {
        const targetStore = storeName ? this.stores.get(storeName) : this.stores.get(this.defaultStore);
        if (!targetStore) {
            return false;
        }

        try {
            // Add to persistent store
            const success = await targetStore.put(document);

            // Also add to in-memory store for fast searching
            if (success) {
                await this.inMemoryStore.put(document);
            }

            return success;
        } catch (error) {
            console.error('Failed to add document:', error);
            return false;
        }
    }

    /**
     * Remove a document from all stores
     */
    async removeDocument(id: string, indexName: string, storeName?: string): Promise<boolean> {
        const targetStore = storeName ? this.stores.get(storeName) : this.stores.get(this.defaultStore);
        if (!targetStore) {
            return false;
        }

        try {
            // Remove from persistent store
            const success = await targetStore.delete(id, indexName);

            // Also remove from in-memory store
            if (success) {
                await this.inMemoryStore.delete(id, indexName);
            }

            return success;
        } catch (error) {
            console.error('Failed to remove document:', error);
            return false;
        }
    }

    /**
     * Refresh in-memory data from persistent stores
     */
    async refreshMemoryData(indexName?: string): Promise<void> {
        // Clear in-memory store
        await this.inMemoryStore.clear(indexName);

        // Reload from persistent stores
        await this.loadDataToMemory(indexName);

        }

    /**
     * Get query execution statistics
     */
    getQueryStats(): Map<string, QueryExecutionStats> {
        return new Map(this.queryStats);
    }

    /**
     * Get overall engine statistics
     */
    async getEngineStats(): Promise<{
        storeStats: Map<string, any>;
        memoryStats: any;
        queryCount: number;
        avgExecutionTime: number;
    }> {
        const storeStats = new Map();

        // Collect stats from all stores
        for (const [name, store] of this.stores) {
            try {
                storeStats.set(name, store.getStats());
            } catch (error) {
                console.error(`Failed to get stats for store '${name}':`, error);
            }
        }

        // Calculate average execution time
        const stats = Array.from(this.queryStats.values());
        const avgExecutionTime = stats.length > 0
            ? stats.reduce((sum, stat) => sum + stat.executionTime, 0) / stats.length
            : 0;

        return {
            storeStats,
            memoryStats: this.inMemoryStore.getStats(),
            queryCount: this.queryStats.size,
            avgExecutionTime
        };
    }

    /**
     * Optimize the query engine performance
     */
    async optimize(): Promise<void> {
        // Compact all stores
        for (const [name, store] of this.stores) {
            try {
                await store.compact();
                } catch (error) {
                console.error(`❌ Failed to compact store '${name}':`, error);
            }
        }

        // Clear old query stats
        this.queryStats.clear();

        }

    // Private methods
    private async loadDataToMemory(indexName?: string): Promise<void> {
        const loadPromises: Promise<void>[] = [];

        for (const [storeName, store] of this.stores) {
            loadPromises.push(this.loadFromStore(store, storeName, indexName));
        }

        // Load in parallel if configured
        if (this.config.parallelQueries) {
            const chunks = this.chunkArray(loadPromises, this.config.maxParallelQueries);
            for (const chunk of chunks) {
                await Promise.all(chunk);
            }
        } else {
            for (const promise of loadPromises) {
                await promise;
            }
        }
    }

    private async loadFromStore(store: DocumentStore, storeName: string, indexName?: string): Promise<void> {
        try {
            const filter: DocumentFilter = indexName ? { indexName } : {};
            const documents = await store.find(filter);

            ` : ''}`);

            // Add documents to in-memory store in batches
            const batchSize = 1000;
            for (let i = 0; i < documents.length; i += batchSize) {
                const batch = documents.slice(i, i + batchSize);
                await this.inMemoryStore.putBatch(batch);
            }

        } catch (error) {
            console.error(`Failed to load data from store '${storeName}':`, error);
        }
    }

    private searchInMemory(query: DomainQuery, context?: QueryContext): Set<DocumentId> {
        // This is a simplified implementation
        // In a real scenario, you'd implement the actual query processing logic
        // based on the DomainQuery structure

        if (query.match_all) {
            return this.getAllDocumentIds();
        }

        if (query.match) {
            return this.searchByMatch(query.match, context);
        }

        if (query.term) {
            return this.searchByTerm(query.term, context);
        }

        if (query.bool) {
            return this.searchByBool(query.bool, context);
        }

        return new Set();
    }

    private getAllDocumentIds(): Set<DocumentId> {
        // Get all document IDs from in-memory store
        const results = new Set<DocumentId>();
        // Implementation would iterate through in-memory store
        // This is a placeholder
        return results;
    }

    private searchByMatch(matchQuery: any, context?: QueryContext): Set<DocumentId> {
        // Implement match query logic
        // This is a placeholder
        return new Set<DocumentId>();
    }

    private searchByTerm(termQuery: any, context?: QueryContext): Set<DocumentId> {
        // Implement term query logic
        // This is a placeholder
        return new Set<DocumentId>();
    }

    private searchByBool(boolQuery: any, context?: QueryContext): Set<DocumentId> {
        // Implement boolean query logic
        // This is a placeholder
        return new Set<DocumentId>();
    }

    private hashQuery(query: DomainQuery): string {
        return JSON.stringify(query);
    }

    private chunkArray<T>(array: T[], chunkSize: number): T[][] {
        const chunks: T[][] = [];
        for (let i = 0; i < array.length; i += chunkSize) {
            chunks.push(array.slice(i, i + chunkSize));
        }
        return chunks;
    }
}