/**
 * Base DocumentStore Interface
 * Defines the contract for all document storage implementations
 */

export interface Document {
    id: string;
    indexName: string;
    [key: string]: any;
}

export interface DocumentFilter {
    indexName?: string;
    ids?: string[];
    query?: Record<string, any>;
    limit?: number;
    offset?: number;
}

export interface StorageStats {
    totalDocuments: number;
    totalIndexes: number;
    memoryUsage: number;
    diskUsage?: number;
    cacheHitRate?: number;
    operations: {
        reads: number;
        writes: number;
        deletes: number;
    };
}

export interface StorageOptions {
    indexName?: string;
    consistency?: 'eventual' | 'strong';
    durability?: 'memory' | 'disk' | 'replicated';
    compression?: boolean;
    encryption?: boolean;
}

export interface BulkOperationResult {
    success: boolean;
    processed: number;
    failed: number;
    errors: Array<{
        id: string;
        error: string;
    }>;
}

export interface DocumentStoreSnapshot {
    version: string;
    timestamp: number;
    documents: Map<string, Document>;
    metadata: Record<string, any>;
}

/**
 * Abstract base class for all document store implementations
 */
export abstract class DocumentStore {
    protected readonly options: StorageOptions;
    protected stats: StorageStats;

    constructor(options: StorageOptions = {}) {
        this.options = options;
        this.stats = {
            totalDocuments: 0,
            totalIndexes: 0,
            memoryUsage: 0,
            operations: {
                reads: 0,
                writes: 0,
                deletes: 0
            }
        };
    }

    // Core CRUD operations
    abstract put(document: Document): Promise<boolean>;
    abstract get(id: string, indexName?: string): Promise<Document | null>;
    abstract delete(id: string, indexName?: string): Promise<boolean>;
    abstract exists(id: string, indexName?: string): Promise<boolean>;

    // Bulk operations
    abstract putBatch(documents: Document[]): Promise<BulkOperationResult>;
    abstract getBatch(ids: string[], indexName?: string): Promise<Map<string, Document>>;
    abstract deleteBatch(ids: string[], indexName?: string): Promise<BulkOperationResult>;

    // Query operations
    abstract find(filter: DocumentFilter): Promise<Document[]>;
    abstract count(filter: DocumentFilter): Promise<number>;

    // Index management
    abstract createIndex(indexName: string, options?: StorageOptions): Promise<boolean>;
    abstract deleteIndex(indexName: string): Promise<boolean>;
    abstract listIndexes(): Promise<string[]>;
    abstract getIndexStats(indexName: string): Promise<StorageStats>;

    // Persistence operations
    abstract flush(): Promise<boolean>;
    abstract backup(destination: string): Promise<boolean>;
    abstract restore(source: string): Promise<boolean>;
    abstract createSnapshot(): Promise<DocumentStoreSnapshot>;
    abstract loadSnapshot(snapshot: DocumentStoreSnapshot): Promise<boolean>;

    // Maintenance operations
    abstract compact(): Promise<boolean>;
    abstract clear(indexName?: string): Promise<boolean>;
    abstract getStats(): StorageStats;

    // Lifecycle
    abstract initialize(): Promise<void>;
    abstract shutdown(): Promise<void>;
    abstract isHealthy(): Promise<boolean>;

    // Event handling (optional)
    onDocumentAdded?(document: Document): void;
    onDocumentUpdated?(document: Document): void;
    onDocumentDeleted?(id: string, indexName: string): void;

    // Utility methods (implemented in base class)
    protected updateStats(operation: 'read' | 'write' | 'delete', count: number = 1): void {
        this.stats.operations[operation === 'read' ? 'reads' : operation === 'write' ? 'writes' : 'deletes'] += count;
    }

    protected validateDocument(document: Document): void {
        if (!document.id) {
            throw new Error('Document must have an id');
        }
        if (!document.indexName) {
            throw new Error('Document must have an indexName');
        }
    }

    protected validateId(id: string): void {
        if (!id || typeof id !== 'string') {
            throw new Error('ID must be a non-empty string');
        }
    }

    protected validateIndexName(indexName: string): void {
        if (!indexName || typeof indexName !== 'string') {
            throw new Error('Index name must be a non-empty string');
        }
    }
}

export default DocumentStore;