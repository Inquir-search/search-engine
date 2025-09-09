import { DocumentStore, Document, DocumentFilter, StorageStats, StorageOptions, BulkOperationResult, DocumentStoreSnapshot } from './DocumentStore.js';

/**
 * In-Memory Document Store
 * Fast document storage using JavaScript Maps for testing and development
 */
export class InMemoryDocumentStore extends DocumentStore {
    private documents: Map<string, Document> = new Map();
    private indexes: Map<string, Set<string>> = new Map();
    private isInitialized: boolean = false;

    constructor(options: StorageOptions = {}) {
        super({
            ...options,
            durability: 'memory',
            consistency: 'strong'
        });
    }

    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        this.isInitialized = true;
        }

    async shutdown(): Promise<void> {
        if (!this.isInitialized) return;

        this.documents.clear();
        this.indexes.clear();
        this.isInitialized = false;
        }

    async isHealthy(): Promise<boolean> {
        return this.isInitialized;
    }

    // Core CRUD operations
    async put(document: Document): Promise<boolean> {
        this.validateDocument(document);

        try {
            const key = this.getDocumentKey(document.id, document.indexName);
            const existed = this.documents.has(key);

            // Store document
            this.documents.set(key, { ...document });

            // Update index
            if (!this.indexes.has(document.indexName)) {
                this.indexes.set(document.indexName, new Set());
            }
            this.indexes.get(document.indexName)!.add(document.id);

            // Update stats
            if (!existed) {
                this.stats.totalDocuments++;
            }
            this.updateStats('write');
            this.updateMemoryUsage();

            // Trigger event
            if (existed && this.onDocumentUpdated) {
                this.onDocumentUpdated(document);
            } else if (!existed && this.onDocumentAdded) {
                this.onDocumentAdded(document);
            }

            return true;
        } catch (error) {
            console.error('Failed to put document:', error);
            return false;
        }
    }

    async get(id: string, indexName?: string): Promise<Document | null> {
        this.validateId(id);

        if (indexName) {
            const key = this.getDocumentKey(id, indexName);
            const document = this.documents.get(key) || null;
            this.updateStats('read');
            return document ? { ...document } : null;
        }

        // Search across all indexes if no index specified
        for (const doc of this.documents.values()) {
            if (doc.id === id) {
                this.updateStats('read');
                return { ...doc };
            }
        }

        this.updateStats('read');
        return null;
    }

    async delete(id: string, indexName?: string): Promise<boolean> {
        this.validateId(id);

        try {
            if (indexName) {
                const key = this.getDocumentKey(id, indexName);
                const existed = this.documents.has(key);

                if (existed) {
                    this.documents.delete(key);
                    this.indexes.get(indexName)?.delete(id);
                    this.stats.totalDocuments--;
                    this.updateStats('delete');
                    this.updateMemoryUsage();

                    if (this.onDocumentDeleted) {
                        this.onDocumentDeleted(id, indexName);
                    }
                }

                return existed;
            }

            // Delete from all indexes if no index specified
            let deleted = false;
            for (const [docKey, doc] of this.documents.entries()) {
                if (doc.id === id) {
                    this.documents.delete(docKey);
                    this.indexes.get(doc.indexName)?.delete(id);
                    this.stats.totalDocuments--;
                    deleted = true;

                    if (this.onDocumentDeleted) {
                        this.onDocumentDeleted(id, doc.indexName);
                    }
                }
            }

            if (deleted) {
                this.updateStats('delete');
                this.updateMemoryUsage();
            }

            return deleted;
        } catch (error) {
            console.error('Failed to delete document:', error);
            return false;
        }
    }

    async exists(id: string, indexName?: string): Promise<boolean> {
        this.validateId(id);

        if (indexName) {
            const key = this.getDocumentKey(id, indexName);
            return this.documents.has(key);
        }

        // Check across all indexes
        for (const doc of this.documents.values()) {
            if (doc.id === id) {
                return true;
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

        for (const document of documents) {
            try {
                const success = await this.put(document);
                if (success) {
                    result.processed++;
                } else {
                    result.failed++;
                    result.errors.push({
                        id: document.id,
                        error: 'Failed to store document'
                    });
                }
            } catch (error) {
                result.failed++;
                result.errors.push({
                    id: document.id,
                    error: error.message
                });
            }
        }

        result.success = result.failed === 0;
        return result;
    }

    async getBatch(ids: string[], indexName?: string): Promise<Map<string, Document>> {
        const result = new Map<string, Document>();

        for (const id of ids) {
            const document = await this.get(id, indexName);
            if (document) {
                result.set(id, document);
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

        for (const id of ids) {
            try {
                const success = await this.delete(id, indexName);
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
                    error: error.message
                });
            }
        }

        result.success = result.failed === 0;
        return result;
    }

    // Query operations
    async find(filter: DocumentFilter): Promise<Document[]> {
        let results: Document[] = Array.from(this.documents.values());

        // Filter by index name
        if (filter.indexName) {
            results = results.filter(doc => doc.indexName === filter.indexName);
        }

        // Filter by IDs
        if (filter.ids && filter.ids.length > 0) {
            const idSet = new Set(filter.ids);
            results = results.filter(doc => idSet.has(doc.id));
        }

        // Apply simple query filter (basic field matching)
        if (filter.query) {
            results = results.filter(doc => {
                return Object.entries(filter.query!).every(([key, value]) => {
                    return doc[key] === value;
                });
            });
        }

        // Apply pagination
        const offset = filter.offset || 0;
        const limit = filter.limit || results.length;

        this.updateStats('read', results.length);
        return results.slice(offset, offset + limit).map(doc => ({ ...doc }));
    }

    async count(filter: DocumentFilter): Promise<number> {
        const results = await this.find(filter);
        return results.length;
    }

    // Index management
    async createIndex(indexName: string, options?: StorageOptions): Promise<boolean> {
        this.validateIndexName(indexName);

        if (!this.indexes.has(indexName)) {
            this.indexes.set(indexName, new Set());
            this.stats.totalIndexes++;
            return true;
        }

        return false; // Index already exists
    }

    async deleteIndex(indexName: string): Promise<boolean> {
        this.validateIndexName(indexName);

        if (this.indexes.has(indexName)) {
            // Delete all documents in this index
            const docsToDelete: string[] = [];
            for (const [key, doc] of this.documents.entries()) {
                if (doc.indexName === indexName) {
                    docsToDelete.push(key);
                }
            }

            for (const key of docsToDelete) {
                this.documents.delete(key);
                this.stats.totalDocuments--;
            }

            this.indexes.delete(indexName);
            this.stats.totalIndexes--;
            this.updateMemoryUsage();

            `);
            return true;
        }

        return false;
    }

    async listIndexes(): Promise<string[]> {
        return Array.from(this.indexes.keys());
    }

    async getIndexStats(indexName: string): Promise<StorageStats> {
        const indexDocs = this.indexes.get(indexName)?.size || 0;

        return {
            ...this.stats,
            totalDocuments: indexDocs,
            totalIndexes: 1
        };
    }

    // Persistence operations
    async flush(): Promise<boolean> {
        // No-op for in-memory store
        return true;
    }

    async backup(destination: string): Promise<boolean> {
        try {
            const snapshot = await this.createSnapshot();
            // In a real implementation, you would write to the destination
            `);
            return true;
        } catch (error) {
            console.error('Backup failed:', error);
            return false;
        }
    }

    async restore(source: string): Promise<boolean> {
        try {
            // In a real implementation, you would read from the source
            `);
            return true;
        } catch (error) {
            console.error('Restore failed:', error);
            return false;
        }
    }

    async createSnapshot(): Promise<DocumentStoreSnapshot> {
        return {
            version: '1.0.0',
            timestamp: Date.now(),
            documents: new Map(this.documents),
            metadata: {
                indexes: Array.from(this.indexes.keys()),
                stats: { ...this.stats }
            }
        };
    }

    async loadSnapshot(snapshot: DocumentStoreSnapshot): Promise<boolean> {
        try {
            this.documents.clear();
            this.indexes.clear();

            // Restore documents
            for (const [key, doc] of snapshot.documents.entries()) {
                this.documents.set(key, doc);

                if (!this.indexes.has(doc.indexName)) {
                    this.indexes.set(doc.indexName, new Set());
                }
                this.indexes.get(doc.indexName)!.add(doc.id);
            }

            // Update stats
            this.stats.totalDocuments = snapshot.documents.size;
            this.stats.totalIndexes = this.indexes.size;
            this.updateMemoryUsage();

            return true;
        } catch (error) {
            console.error('Failed to load snapshot:', error);
            return false;
        }
    }

    // Maintenance operations
    async compact(): Promise<boolean> {
        // No-op for in-memory store (no fragmentation)
        return true;
    }

    async clear(indexName?: string): Promise<boolean> {
        if (indexName) {
            return await this.deleteIndex(indexName);
        } else {
            this.documents.clear();
            this.indexes.clear();
            this.stats.totalDocuments = 0;
            this.stats.totalIndexes = 0;
            this.updateMemoryUsage();
            return true;
        }
    }

    getStats(): StorageStats {
        return { ...this.stats };
    }

    // Private helper methods
    private getDocumentKey(id: string, indexName: string): string {
        return `${indexName}:${id}`;
    }

    private updateMemoryUsage(): void {
        // Rough estimate of memory usage
        let size = 0;
        for (const doc of this.documents.values()) {
            size += JSON.stringify(doc).length * 2; // Rough estimate (UTF-16)
        }
        this.stats.memoryUsage = size;
    }
}

export default InMemoryDocumentStore;