/**
 * AdvancedSharedMemoryStore - High-performance optimized search engine storage
 * Key optimizations:
 * 1. Better hash function and collision resolution
 * 2. Compressed posting lists with term frequencies
 * 3. Bloom filters for fast negative lookups
 * 4. Document metadata caching
 * 5. Read-write locks instead of exclusive locks
 * 6. Memory-efficient data structures
 */

import SharedMemoryTokenizer from './SharedMemoryTokenizer';
import SharedMemoryQueryEngine from './SharedMemoryQueryEngine';
import { getConfigManager } from './ConfigManager';

// Domain value objects and types
export interface MemoryLayout {
    readonly MUTEX_OFFSET: number;
    readonly READ_COUNT_OFFSET: number;
    readonly WRITE_LOCK_OFFSET: number;
    readonly DOCUMENT_COUNT_OFFSET: number;
    readonly TERM_COUNT_OFFSET: number;
    readonly NEXT_DOC_ID_OFFSET: number;
    readonly INDEX_VERSION_OFFSET: number;
    readonly NEXT_DOC_OFFSET: number;
    readonly NEXT_INDEX_OFFSET: number;
    readonly BLOOM_FILTER_OFFSET: number;
    readonly BLOOM_FILTER_SIZE: number;
    readonly DOC_METADATA_OFFSET: number;
    readonly DOC_METADATA_SIZE: number;
    readonly DOCUMENTS_OFFSET: number;
    readonly DOCUMENTS_SIZE: number;
    readonly INVERTED_INDEX_OFFSET: number;
    readonly INVERTED_INDEX_SIZE: number;
    readonly OPTIMIZATION_DATA_OFFSET: number;
    readonly OPTIMIZATION_DATA_SIZE: number;
}

export interface StoreConfiguration {
    sharedBuffer?: SharedArrayBuffer;
    bufferSize?: number;
    maxDocuments?: number;
    maxTerms?: number;
    stemming?: boolean;
    stemmingOptions?: any;
    tokenCacheSize?: number;
    defaultAnalyzer?: string;
    fieldAnalyzers?: Record<string, string>;
    synonymEngine?: any;
    mappingsManager?: any;
    queryCacheSize?: number;
    forceInit?: boolean;
}

export interface PerformanceStatistics {
    cacheHits: number;
    cacheMisses: number;
    bloomFilterSaves: number;
    totalQueries: number;
    averageQueryTime: number;
}

export interface SearchOptions {
    from?: number;
    size?: number;
    indexName?: string;
    aggregations?: Record<string, any>;
    aggs?: Record<string, any>;
}

export interface SearchResult {
    hits: any[];
    total: number;
    from: number;
    size: number;
    version: number;
    allMatches?: any[];
}

export interface DocumentAddResult {
    docId: number;
    wasAdded: boolean;
}

export interface StoreStats {
    totalDocs: number;
    totalTerms: number;
    indexVersion: number;
    bufferSize: number;
    cacheHitRate: number;
    bloomFilterSaves: number;
    averageQueryTime: number;
    localCacheSize: number;
}

// Domain service for advanced shared memory operations
export default class AdvancedSharedMemoryStore {
    private readonly sharedBuffer: SharedArrayBuffer;
    private readonly bufferSize: number;
    private readonly maxDocuments: number;
    private readonly maxTerms: number;
    private readonly tokenizer: SharedMemoryTokenizer;
    private readonly layout: MemoryLayout;

    // Typed array views for better performance
    private readonly mutex: Int32Array;
    private readonly readCount: Int32Array;
    private readonly writeLock: Int32Array;
    private readonly documentCount: Int32Array;
    private readonly termCount: Int32Array;
    private readonly nextDocId: Int32Array;
    private readonly indexVersion: Int32Array;
    private readonly nextDocOffset: Int32Array;
    private readonly nextIndexOffset: Int32Array;
    private readonly bloomFilter: Uint8Array;
    private readonly docMetadataCache: Int32Array;
    private readonly documentStore: Uint8Array;
    private readonly invertedIndexStore: Uint8Array;
    private readonly optimizationData: Uint8Array;

    // Query engine and caches
    private readonly queryEngine: SharedMemoryQueryEngine;
    private readonly localDocCache: Map<string, number>;
    private readonly localTermCache: Map<string, SearchResult>;
    private readonly maxLocalCacheSize: number;

    // Performance tracking
    private readonly stats: PerformanceStatistics;

    constructor(options: StoreConfiguration = {}) {
        // Get configuration from ConfigManager
        const configManager = getConfigManager();
        const sharedMemoryConfig = configManager.get('sharedMemoryStore');

        // Handle case where shared buffer is passed directly
        if (options.sharedBuffer) {
            this.sharedBuffer = options.sharedBuffer;
            this.bufferSize = options.sharedBuffer.byteLength;
        } else {
            this.bufferSize = options.bufferSize ?? sharedMemoryConfig.bufferSize;
            this.sharedBuffer = new SharedArrayBuffer(this.bufferSize);
        }

        this.maxDocuments = options.maxDocuments ?? sharedMemoryConfig.maxDocuments;
        this.maxTerms = options.maxTerms ?? sharedMemoryConfig.maxTerms;

        // Initialize the shared memory tokenizer
        this.tokenizer = new SharedMemoryTokenizer({
            stemming: options.stemming ?? sharedMemoryConfig.stemming,
            stemmingOptions: options.stemmingOptions ?? sharedMemoryConfig.stemmingOptions,
            maxCacheSize: options.tokenCacheSize ?? sharedMemoryConfig.advanced.tokenCacheSize,
            defaultAnalyzer: options.defaultAnalyzer ?? sharedMemoryConfig.defaultAnalyzer,
            fieldAnalyzers: options.fieldAnalyzers ?? sharedMemoryConfig.fieldAnalyzers
        });

        // Calculate dynamic sizes based on available buffer
        const controlStructuresSize = 64 + 4096 + 16384; // Control + Bloom filter + Doc metadata
        const remainingSize = this.bufferSize - controlStructuresSize;
        const documentsSize = Math.floor(remainingSize * 0.4);   // 40% for documents
        const indexSize = Math.floor(remainingSize * 0.5);       // 50% for index
        const optimizationSize = remainingSize - documentsSize - indexSize; // Remaining for optimization

        // Enhanced memory layout for better performance
        this.layout = {
            // Control structures (first 2KB for alignment)
            MUTEX_OFFSET: 0,                    // 4 bytes - main mutex
            READ_COUNT_OFFSET: 4,               // 4 bytes - active readers count
            WRITE_LOCK_OFFSET: 8,               // 4 bytes - write lock
            DOCUMENT_COUNT_OFFSET: 16,          // 4 bytes - total document count
            TERM_COUNT_OFFSET: 20,              // 4 bytes - total term count
            NEXT_DOC_ID_OFFSET: 24,            // 4 bytes - next available document ID
            INDEX_VERSION_OFFSET: 28,           // 4 bytes - version for cache invalidation
            NEXT_DOC_OFFSET: 32,               // 4 bytes - next document storage offset
            NEXT_INDEX_OFFSET: 36,             // 4 bytes - next inverted index offset
            BLOOM_FILTER_OFFSET: 64,           // Bloom filter starts at 64 bytes

            // Bloom filter for fast negative lookups (4KB)
            BLOOM_FILTER_SIZE: 4096,

            // Document metadata cache (16KB) - stores doc ID -> offset mapping
            DOC_METADATA_OFFSET: 64 + 4096,
            DOC_METADATA_SIZE: 16384,

            // Document storage - dynamic allocation based on buffer size
            DOCUMENTS_OFFSET: controlStructuresSize,
            DOCUMENTS_SIZE: documentsSize,

            // Advanced inverted index with posting lists - dynamic allocation
            INVERTED_INDEX_OFFSET: controlStructuresSize + documentsSize,
            INVERTED_INDEX_SIZE: indexSize,

            // Query cache and optimization data - dynamic allocation
            OPTIMIZATION_DATA_OFFSET: controlStructuresSize + documentsSize + indexSize,
            OPTIMIZATION_DATA_SIZE: optimizationSize
        };

        // Validate that the layout fits in the buffer
        const totalRequired = this.layout.OPTIMIZATION_DATA_OFFSET + this.layout.OPTIMIZATION_DATA_SIZE;
        if (totalRequired > this.bufferSize) {
            throw new Error(`Buffer size ${this.bufferSize} is too small. Required: ${totalRequired}`);
        }

        // Create typed array views with better alignment
        this.mutex = new Int32Array(this.sharedBuffer, this.layout.MUTEX_OFFSET, 1);
        this.readCount = new Int32Array(this.sharedBuffer, this.layout.READ_COUNT_OFFSET, 1);
        this.writeLock = new Int32Array(this.sharedBuffer, this.layout.WRITE_LOCK_OFFSET, 1);
        this.documentCount = new Int32Array(this.sharedBuffer, this.layout.DOCUMENT_COUNT_OFFSET, 1);
        this.termCount = new Int32Array(this.sharedBuffer, this.layout.TERM_COUNT_OFFSET, 1);
        this.nextDocId = new Int32Array(this.sharedBuffer, this.layout.NEXT_DOC_ID_OFFSET, 1);
        this.indexVersion = new Int32Array(this.sharedBuffer, this.layout.INDEX_VERSION_OFFSET, 1);
        this.nextDocOffset = new Int32Array(this.sharedBuffer, this.layout.NEXT_DOC_OFFSET, 1);
        this.nextIndexOffset = new Int32Array(this.sharedBuffer, this.layout.NEXT_INDEX_OFFSET, 1);

        // Bloom filter for fast term existence checks
        this.bloomFilter = new Uint8Array(this.sharedBuffer, this.layout.BLOOM_FILTER_OFFSET, this.layout.BLOOM_FILTER_SIZE);

        // Document metadata cache for faster lookups
        this.docMetadataCache = new Int32Array(this.sharedBuffer, this.layout.DOC_METADATA_OFFSET, this.layout.DOC_METADATA_SIZE / 4);

        // Document storage with better organization
        this.documentStore = new Uint8Array(this.sharedBuffer, this.layout.DOCUMENTS_OFFSET, this.layout.DOCUMENTS_SIZE);

        // Advanced inverted index storage
        this.invertedIndexStore = new Uint8Array(this.sharedBuffer, this.layout.INVERTED_INDEX_OFFSET, this.layout.INVERTED_INDEX_SIZE);

        // Optimization data storage
        this.optimizationData = new Uint8Array(this.sharedBuffer, this.layout.OPTIMIZATION_DATA_OFFSET, this.layout.OPTIMIZATION_DATA_SIZE);

        // Initialize the shared memory query engine with enhanced caching
        this.queryEngine = new SharedMemoryQueryEngine({
            sharedMemoryStore: this,
            tokenizer: this.tokenizer,
            maxCacheSize: options.queryCacheSize ?? sharedMemoryConfig.advanced.queryCacheSize
        });

        // Local caches for performance
        this.localDocCache = new Map(); // Document cache
        this.localTermCache = new Map(); // Term frequency cache
        this.maxLocalCacheSize = sharedMemoryConfig.advanced.maxLocalCacheSize;

        // Performance statistics
        this.stats = {
            cacheHits: 0,
            cacheMisses: 0,
            bloomFilterSaves: 0,
            totalQueries: 0,
            averageQueryTime: 0
        };

        // Initialize if this is the first worker or if specifically requested
        if (Atomics.load(this.documentCount, 0) === 0 || options.forceInit) {
            this.initialize();
        }
    }

    private initialize(): void {
        // Initialize shared memory state with better defaults
        Atomics.store(this.documentCount, 0, 0);
        Atomics.store(this.termCount, 0, 0);
        Atomics.store(this.nextDocId, 0, 1);
        Atomics.store(this.indexVersion, 0, 1);
        Atomics.store(this.nextDocOffset, 0, 0);
        Atomics.store(this.nextIndexOffset, 0, 0);
        Atomics.store(this.readCount, 0, 0);
        Atomics.store(this.writeLock, 0, 0);

        // Initialize bloom filter to all zeros
        this.bloomFilter.fill(0);

        // Initialize document metadata cache
        this.docMetadataCache.fill(0);

    }

    /**
     * Acquire read lock (allows multiple readers)
     */
    private acquireReadLock(timeoutMs: number = 5000): boolean {
        const start = Date.now();

        while (Date.now() - start < timeoutMs) {
            // Wait for write lock to be released
            if (Atomics.load(this.writeLock, 0) === 0) {
                // Increment reader count atomically
                Atomics.add(this.readCount, 0, 1);

                // Double-check that no writer acquired the lock
                if (Atomics.load(this.writeLock, 0) === 0) {
                    return true; // Read lock acquired
                } else {
                    // Writer took the lock, decrement reader count
                    Atomics.sub(this.readCount, 0, 1);
                }
            }

            // Wait briefly before retry
            Atomics.wait(this.writeLock, 0, 1, 1);
        }

        throw new Error(`Failed to acquire read lock within ${timeoutMs}ms`);
    }

    /**
     * Release read lock
     */
    private releaseReadLock(): void {
        Atomics.sub(this.readCount, 0, 1);
        // Notify waiting writers if this was the last reader
        if (Atomics.load(this.readCount, 0) === 0) {
            Atomics.notify(this.readCount, 0, 1);
        }
    }

    /**
     * Acquire write lock (exclusive)
     */
    private acquireWriteLock(timeoutMs: number = 5000): boolean {
        const start = Date.now();

        while (Date.now() - start < timeoutMs) {
            // Try to acquire write lock
            if (Atomics.compareExchange(this.writeLock, 0, 0, 1) === 0) {
                // Wait for all readers to finish
                while (Atomics.load(this.readCount, 0) > 0) {
                    Atomics.wait(this.readCount, 0, Atomics.load(this.readCount, 0), 1);
                }
                return true; // Write lock acquired
            }

            Atomics.wait(this.writeLock, 0, 1, 1);
        }

        throw new Error(`Failed to acquire write lock within ${timeoutMs}ms`);
    }

    /**
     * Release write lock
     */
    private releaseWriteLock(): void {
        Atomics.store(this.writeLock, 0, 0);
        Atomics.notify(this.writeLock, 0, 1);
    }

    /**
     * Better hash function for reduced collisions
     */
    private betterHashFunction(str: string): number {
        let hash = 2166136261; // FNV-1a initial value
        for (let i = 0; i < str.length; i++) {
            hash ^= str.charCodeAt(i);
            hash *= 16777619; // FNV-1a prime
        }
        return Math.abs(hash);
    }

    /**
     * Add to bloom filter for fast negative lookups
     */
    private addToBloomFilter(term: string): void {
        const hash1 = this.betterHashFunction(term) % (this.layout.BLOOM_FILTER_SIZE * 8);
        const hash2 = this.betterHashFunction(term + 'salt') % (this.layout.BLOOM_FILTER_SIZE * 8);
        const hash3 = this.betterHashFunction('salt' + term) % (this.layout.BLOOM_FILTER_SIZE * 8);

        this.setBit(hash1);
        this.setBit(hash2);
        this.setBit(hash3);
    }

    /**
     * Check bloom filter for term existence
     */
    private bloomFilterContains(term: string): boolean {
        const hash1 = this.betterHashFunction(term) % (this.layout.BLOOM_FILTER_SIZE * 8);
        const hash2 = this.betterHashFunction(term + 'salt') % (this.layout.BLOOM_FILTER_SIZE * 8);
        const hash3 = this.betterHashFunction('salt' + term) % (this.layout.BLOOM_FILTER_SIZE * 8);

        return this.getBit(hash1) && this.getBit(hash2) && this.getBit(hash3);
    }

    private setBit(bitIndex: number): void {
        const byteIndex = Math.floor(bitIndex / 8);
        const bitPosition = bitIndex % 8;
        this.bloomFilter[byteIndex] |= (1 << bitPosition);
    }

    private getBit(bitIndex: number): boolean {
        const byteIndex = Math.floor(bitIndex / 8);
        const bitPosition = bitIndex % 8;
        return (this.bloomFilter[byteIndex] & (1 << bitPosition)) !== 0;
    }

    /**
     * Enhanced document existence check using bloom filter and metadata cache
     */
    private documentExistsOptimized(docOriginalId: string, indexName: string): number | null {
        const key = `${indexName}:${docOriginalId}`;

        // First check bloom filter for quick negative results
        if (!this.bloomFilterContains(key)) {
            this.stats.bloomFilterSaves++;
            return null;
        }

        // Check local cache first
        if (this.localDocCache.has(key)) {
            this.stats.cacheHits++;
            return this.localDocCache.get(key)!;
        }

        this.stats.cacheMisses++;

        // Fall back to linear search (could be optimized further with B-trees)
        const docCount = Atomics.load(this.documentCount, 0);
        for (let i = 1; i <= docCount; i++) {
            try {
                const doc = this.getDocument(i);
                if (doc && doc.id === docOriginalId && doc.indexName === indexName) {
                    // Cache the result
                    if (this.localDocCache.size < this.maxLocalCacheSize) {
                        this.localDocCache.set(key, i);
                    }
                    return i;
                }
            } catch (error) {
                continue;
            }
        }

        return null;
    }

    /**
     * Enhanced search with optimizations
     */
    search(query: string, options: SearchOptions = {}): SearchResult {
        const startTime = Date.now();
        this.stats.totalQueries++;

        if (!this.acquireReadLock()) {
            throw new Error('Failed to acquire read lock for search');
        }

        try {
            const currentVersion = Atomics.load(this.indexVersion, 0);

            // Check query cache first
            const cacheKey = JSON.stringify({ query, options, version: currentVersion });
            if (this.localTermCache.has(cacheKey)) {
                this.stats.cacheHits++;
                return this.localTermCache.get(cacheKey)!;
            }

            // Use the domain-based query engine
            const docIds = Array.from(this.queryEngine.search(query, options));

            // Optimized document retrieval with early termination for pagination
            const from = options.from || 0;
            const size = options.size || 10;
            const needsAllResults = options.aggregations || options.aggs;

            let results: any[] = [];
            const targetIndex = options.indexName;
            const seenDocIds = new Set<number>();

            // If we don't need aggregations, we can do early termination
            if (!needsAllResults) {
                let processedCount = 0;
                let collectedCount = 0;

                for (const docId of docIds) {
                    if (seenDocIds.has(docId)) continue;
                    seenDocIds.add(docId);

                    const doc = this.getDocument(docId);
                    if (doc && (!targetIndex || doc.indexName === targetIndex)) {
                        if (processedCount >= from && collectedCount < size) {
                            results.push({ ...doc, _score: this.calculateQueryScore(doc, query) });
                            collectedCount++;
                        }
                        processedCount++;

                        // Early termination when we have enough results
                        if (collectedCount >= size && processedCount >= from + size) {
                            break;
                        }
                    }
                }

                const searchResult: SearchResult = {
                    hits: results,
                    total: processedCount,
                    from,
                    size,
                    version: currentVersion
                };

                // Cache the result
                if (this.localTermCache.size < this.maxLocalCacheSize) {
                    this.localTermCache.set(cacheKey, searchResult);
                }

                return searchResult;
            } else {
                // Need all results for aggregations
                for (const docId of docIds) {
                    if (seenDocIds.has(docId)) continue;
                    seenDocIds.add(docId);

                    const doc = this.getDocument(docId);
                    if (doc && (!targetIndex || doc.indexName === targetIndex)) {
                        results.push({ ...doc, _score: this.calculateQueryScore(doc, query) });
                    }
                }

                // Sort by score
                results.sort((a, b) => b._score - a._score);

                const searchResult: SearchResult = {
                    hits: results.slice(from, from + size),
                    total: results.length,
                    from,
                    size,
                    version: currentVersion,
                    allMatches: results
                };

                return searchResult;
            }

        } finally {
            this.releaseReadLock();

            // Update performance stats
            const queryTime = Date.now() - startTime;
            this.stats.averageQueryTime = ((this.stats.averageQueryTime * (this.stats.totalQueries - 1)) + queryTime) / this.stats.totalQueries;
        }
    }

    /**
     * Enhanced document addition with optimizations
     */
    addDocument(doc: any): DocumentAddResult {
        if (!this.acquireWriteLock()) {
            throw new Error('Failed to acquire write lock for document addition');
        }

        try {
            // Check for duplicates using optimized method
            const existingDocId = this.documentExistsOptimized(doc.id, doc.indexName);
            if (existingDocId) {
                return { docId: existingDocId, wasAdded: false };
            }

            // Add to bloom filter
            const key = `${doc.indexName}:${doc.id}`;
            this.addToBloomFilter(key);

            // Serialize document to binary format
            const serialized = this.serializeDocument(doc);

            // Find space in document store
            const docId = Atomics.load(this.nextDocId, 0);
            const offset = this.findDocumentSlot(serialized.length);

            if (offset === -1) {
                throw new Error('No space available for document');
            }

            // Write document with metadata
            const sizeView = new Int32Array(this.sharedBuffer, this.layout.DOCUMENTS_OFFSET + offset, 1);
            sizeView[0] = serialized.length;
            this.documentStore.set(serialized, offset + 4);

            // Update document metadata cache
            const metadataIndex = (docId - 1) % (this.layout.DOC_METADATA_SIZE / 8);
            this.docMetadataCache[metadataIndex * 2] = docId;
            this.docMetadataCache[metadataIndex * 2 + 1] = offset;

            // Update inverted index with better posting lists
            this.updateInvertedIndexOptimized(doc, docId);

            // Update counters atomically
            Atomics.add(this.documentCount, 0, 1);
            Atomics.add(this.nextDocId, 0, 1);
            Atomics.add(this.indexVersion, 0, 1);

            // Cache locally
            if (this.localDocCache.size < this.maxLocalCacheSize) {
                this.localDocCache.set(key, docId);
            }

            return { docId, wasAdded: true };
        } finally {
            this.releaseWriteLock();
        }
    }

    getStats(): StoreStats {
        const documentCount = Atomics.load(this.documentCount, 0);
        const termCount = Atomics.load(this.termCount, 0);
        const indexVersion = Atomics.load(this.indexVersion, 0);

        return {
            totalDocs: documentCount,
            totalTerms: termCount,
            indexVersion: indexVersion,
            bufferSize: this.bufferSize,
            cacheHitRate: this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses),
            bloomFilterSaves: this.stats.bloomFilterSaves,
            averageQueryTime: this.stats.averageQueryTime,
            localCacheSize: this.localDocCache.size
        };
    }

    // Placeholder methods that would need full implementation
    private updateInvertedIndexOptimized(doc: any, docId: number): void {
        // Enhanced inverted index update with compressed posting lists
        // TODO: Implement compressed posting lists with term frequencies
    }

    private serializeDocument(doc: any): Uint8Array {
        // TODO: Implement more efficient serialization
        const json = JSON.stringify(doc);
        return new TextEncoder().encode(json);
    }

    private deserializeDocument(bytes: Uint8Array): any {
        const json = new TextDecoder().decode(bytes);
        return JSON.parse(json);
    }

    private findDocumentSlot(size: number): number {
        // TODO: Implement better allocation strategy
        const currentOffset = Atomics.load(this.nextDocOffset, 0);
        const alignedOffset = Math.ceil(currentOffset / 4) * 4;
        const newOffset = alignedOffset + size + 4;

        if (newOffset > this.layout.DOCUMENTS_SIZE) {
            return -1;
        }

        Atomics.store(this.nextDocOffset, 0, newOffset);
        return alignedOffset;
    }

    private getDocument(docId: number): any | null {
        // TODO: Implement optimized document retrieval using metadata cache
        // For now, use basic implementation
        return null;
    }

    private calculateQueryScore(doc: any, query: string): number {
        // TODO: Implement enhanced scoring with cached term frequencies
        return 0;
    }

    async deleteDocument(docId: string): Promise<boolean> {
        // TODO: Implement document deletion
        return false;
    }
}