import { DocumentStore, Document, DocumentFilter, StorageStats, StorageOptions, BulkOperationResult, DocumentStoreSnapshot } from './DocumentStore.js';
import fs from 'fs';
import path from 'path';

interface FileSystemOptions extends StorageOptions {
    baseDir?: string;
    syncWrites?: boolean;
    autoBackup?: boolean;
    backupInterval?: number;
}

/**
 * FileSystem Document Store
 * Persistent document storage using the file system with JSON files
 */
export class FileSystemDocumentStore extends DocumentStore {
    private baseDir: string;
    private indexes: Map<string, Set<string>> = new Map();
    private isInitialized: boolean = false;
    private syncWrites: boolean;
    private autoBackup: boolean;
    private backupInterval: number;
    private backupTimer: NodeJS.Timeout | null = null;

    constructor(options: FileSystemOptions = {}) {
        super({
            ...options,
            durability: 'disk',
            consistency: 'eventual'
        });

        this.baseDir = options.baseDir || './data/documents';
        this.syncWrites = options.syncWrites !== false; // Default to true
        this.autoBackup = options.autoBackup === true;
        this.backupInterval = options.backupInterval || 3600000; // 1 hour
    }

    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        // Create base directory if it doesn't exist
        if (!fs.existsSync(this.baseDir)) {
            fs.mkdirSync(this.baseDir, { recursive: true });
        }

        // Load existing indexes
        await this.loadIndexes();

        // Start auto-backup if enabled
        if (this.autoBackup) {
            this.startAutoBackup();
        }

        this.isInitialized = true;
    }

    async shutdown(): Promise<void> {
        if (!this.isInitialized) return;

        // Stop auto-backup
        if (this.backupTimer) {
            clearInterval(this.backupTimer);
            this.backupTimer = null;
        }

        // Flush any pending writes
        await this.flush();

        this.indexes.clear();
        this.isInitialized = false;
    }

    async isHealthy(): Promise<boolean> {
        try {
            if (!this.isInitialized) return false;

            // Check if base directory is accessible
            await fs.promises.access(this.baseDir, fs.constants.R_OK | fs.constants.W_OK);
            return true;
        } catch {
            return false;
        }
    }

    // Core CRUD operations
    async put(document: Document): Promise<boolean> {
        this.validateDocument(document);

        try {
            const docPath = this.getDocumentPath(document.id, document.indexName);
            const existed = fs.existsSync(docPath);

            // Ensure directory exists
            const docDir = path.dirname(docPath);
            if (!fs.existsSync(docDir)) {
                fs.mkdirSync(docDir, { recursive: true });
            }

            // Write document to file
            const content = JSON.stringify(document, null, 2);
            if (this.syncWrites) {
                fs.writeFileSync(docPath, content, 'utf8');
            } else {
                await fs.promises.writeFile(docPath, content, 'utf8');
            }

            // Update index
            if (!this.indexes.has(document.indexName)) {
                this.indexes.set(document.indexName, new Set());
                this.stats.totalIndexes++;
            }
            this.indexes.get(document.indexName)!.add(document.id);

            // Update stats
            if (!existed) {
                this.stats.totalDocuments++;
            }
            this.updateStats('write');
            this.updateDiskUsage();

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

        try {
            if (indexName) {
                const docPath = this.getDocumentPath(id, indexName);
                if (fs.existsSync(docPath)) {
                    const content = await fs.promises.readFile(docPath, 'utf8');
                    this.updateStats('read');
                    return JSON.parse(content);
                }
                this.updateStats('read');
                return null;
            }

            // Search across all indexes
            for (const indexName of this.indexes.keys()) {
                const docPath = this.getDocumentPath(id, indexName);
                if (fs.existsSync(docPath)) {
                    const content = await fs.promises.readFile(docPath, 'utf8');
                    this.updateStats('read');
                    return JSON.parse(content);
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
                const docPath = this.getDocumentPath(id, indexName);
                if (fs.existsSync(docPath)) {
                    await fs.promises.unlink(docPath);
                    this.indexes.get(indexName)?.delete(id);
                    this.stats.totalDocuments--;
                    this.updateStats('delete');
                    this.updateDiskUsage();

                    if (this.onDocumentDeleted) {
                        this.onDocumentDeleted(id, indexName);
                    }

                    return true;
                }
                return false;
            }

            // Delete from all indexes
            let deleted = false;
            for (const indexName of this.indexes.keys()) {
                const docPath = this.getDocumentPath(id, indexName);
                if (fs.existsSync(docPath)) {
                    await fs.promises.unlink(docPath);
                    this.indexes.get(indexName)?.delete(id);
                    this.stats.totalDocuments--;
                    deleted = true;

                    if (this.onDocumentDeleted) {
                        this.onDocumentDeleted(id, indexName);
                    }
                }
            }

            if (deleted) {
                this.updateStats('delete');
                this.updateDiskUsage();
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
            const docPath = this.getDocumentPath(id, indexName);
            return fs.existsSync(docPath);
        }

        // Check across all indexes
        for (const indexName of this.indexes.keys()) {
            const docPath = this.getDocumentPath(id, indexName);
            if (fs.existsSync(docPath)) {
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

        // Use parallel reads for better performance
        const promises = ids.map(async (id) => {
            const document = await this.get(id, indexName);
            return { id, document };
        });

        const results = await Promise.all(promises);
        for (const { id, document } of results) {
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
        const results: Document[] = [];
        const indexesToSearch = filter.indexName ? [filter.indexName] : Array.from(this.indexes.keys());

        for (const indexName of indexesToSearch) {
            const indexPath = this.getIndexPath(indexName);
            if (!fs.existsSync(indexPath)) continue;

            const documentIds = filter.ids ?
                filter.ids.filter(id => this.indexes.get(indexName)?.has(id)) :
                Array.from(this.indexes.get(indexName) || []);

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
    }

    async count(filter: DocumentFilter): Promise<number> {
        if (filter.indexName && !filter.query && !filter.ids) {
            // Fast count for simple index queries
            return this.indexes.get(filter.indexName)?.size || 0;
        }

        const results = await this.find({ ...filter, limit: undefined, offset: undefined });
        return results.length;
    }

    // Index management
    async createIndex(indexName: string, options?: StorageOptions): Promise<boolean> {
        this.validateIndexName(indexName);

        const indexPath = this.getIndexPath(indexName);

        if (!fs.existsSync(indexPath)) {
            fs.mkdirSync(indexPath, { recursive: true });
            this.indexes.set(indexName, new Set());
            this.stats.totalIndexes++;
            return true;
        }

        return false;
    }

    async deleteIndex(indexName: string): Promise<boolean> {
        this.validateIndexName(indexName);

        const indexPath = this.getIndexPath(indexName);

        if (fs.existsSync(indexPath)) {
            // Delete all documents in the index
            const documentIds = Array.from(this.indexes.get(indexName) || []);
            let deletedCount = 0;

            for (const docId of documentIds) {
                try {
                    await this.delete(docId, indexName);
                    deletedCount++;
                } catch (error) {
                }
            }

            // Remove index directory
            try {
                fs.rmSync(indexPath, { recursive: true, force: true });
                this.indexes.delete(indexName);
                this.stats.totalIndexes--;
                this.updateDiskUsage();

                return true;
            } catch (error) {
                console.error(`Failed to delete index directory:`, error);
                return false;
            }
        }

        return false;
    }

    async listIndexes(): Promise<string[]> {
        return Array.from(this.indexes.keys());
    }

    async getIndexStats(indexName: string): Promise<StorageStats> {
        const indexDocs = this.indexes.get(indexName)?.size || 0;
        const indexPath = this.getIndexPath(indexName);
        let diskUsage = 0;

        if (fs.existsSync(indexPath)) {
            diskUsage = await this.calculateDirectorySize(indexPath);
        }

        return {
            ...this.stats,
            totalDocuments: indexDocs,
            totalIndexes: 1,
            diskUsage
        };
    }

    // Persistence operations
    async flush(): Promise<boolean> {
        // For file system store, writes are already persistent
        // This could be used for any pending operations
        return true;
    }

    async backup(destination: string): Promise<boolean> {
        try {
            if (!fs.existsSync(destination)) {
                fs.mkdirSync(destination, { recursive: true });
            }

            // Copy entire data directory
            await this.copyDirectory(this.baseDir, destination);

            return true;
        } catch (error) {
            console.error('Backup failed:', error);
            return false;
        }
    }

    async restore(source: string): Promise<boolean> {
        try {
            if (!fs.existsSync(source)) {
                throw new Error(`Source directory does not exist: ${source}`);
            }

            // Clear current data
            await this.clear();

            // Copy from source
            await this.copyDirectory(source, this.baseDir);

            // Reload indexes
            await this.loadIndexes();

            return true;
        } catch (error) {
            console.error('Restore failed:', error);
            return false;
        }
    }

    async createSnapshot(): Promise<DocumentStoreSnapshot> {
        const documents = new Map<string, Document>();

        // Load all documents
        for (const [indexName, documentIds] of this.indexes.entries()) {
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
                indexes: Array.from(this.indexes.keys()),
                stats: { ...this.stats },
                baseDir: this.baseDir
            }
        };
    }

    async loadSnapshot(snapshot: DocumentStoreSnapshot): Promise<boolean> {
        try {
            // Clear current data
            await this.clear();

            // Restore documents
            for (const document of snapshot.documents.values()) {
                await this.put(document);
            }

            return true;
        } catch (error) {
            console.error('Failed to load snapshot:', error);
            return false;
        }
    }

    // Maintenance operations
    async compact(): Promise<boolean> {
        // For file system, compaction could involve defragmentation or cleanup
        // This is a placeholder implementation
        ');
        return true;
    }

    async clear(indexName?: string): Promise<boolean> {
        if (indexName) {
            return await this.deleteIndex(indexName);
        } else {
            // Clear all data
            try {
                if (fs.existsSync(this.baseDir)) {
                    fs.rmSync(this.baseDir, { recursive: true, force: true });
                    fs.mkdirSync(this.baseDir, { recursive: true });
                }

                this.indexes.clear();
                this.stats.totalDocuments = 0;
                this.stats.totalIndexes = 0;
                this.stats.diskUsage = 0;

                return true;
            } catch (error) {
                console.error('Failed to clear data:', error);
                return false;
            }
        }
    }

    getStats(): StorageStats {
        return { ...this.stats };
    }

    // Private helper methods
    private getDocumentPath(id: string, indexName: string): string {
        return path.join(this.baseDir, indexName, `${id}.json`);
    }

    private getIndexPath(indexName: string): string {
        return path.join(this.baseDir, indexName);
    }

    private async loadIndexes(): Promise<void> {
        try {
            if (!fs.existsSync(this.baseDir)) return;

            const entries = await fs.promises.readdir(this.baseDir, { withFileTypes: true });

            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const indexName = entry.name;
                    const indexPath = path.join(this.baseDir, indexName);
                    const documentSet = new Set<string>();

                    // Load document IDs from files
                    const files = await fs.promises.readdir(indexPath);
                    for (const file of files) {
                        if (file.endsWith('.json')) {
                            const docId = path.basename(file, '.json');
                            documentSet.add(docId);
                        }
                    }

                    this.indexes.set(indexName, documentSet);
                    this.stats.totalDocuments += documentSet.size;
                }
            }

            this.stats.totalIndexes = this.indexes.size;
            await this.updateDiskUsage();

        } catch (error) {
            console.error('Failed to load indexes:', error);
        }
    }

    private async updateDiskUsage(): Promise<void> {
        try {
            this.stats.diskUsage = await this.calculateDirectorySize(this.baseDir);
        } catch (error) {
        }
    }

    private async calculateDirectorySize(dirPath: string): Promise<number> {
        if (!fs.existsSync(dirPath)) return 0;

        let size = 0;
        const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            const entryPath = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
                size += await this.calculateDirectorySize(entryPath);
            } else {
                const stats = await fs.promises.stat(entryPath);
                size += stats.size;
            }
        }

        return size;
    }

    private async copyDirectory(source: string, destination: string): Promise<void> {
        if (!fs.existsSync(destination)) {
            fs.mkdirSync(destination, { recursive: true });
        }

        const entries = await fs.promises.readdir(source, { withFileTypes: true });

        for (const entry of entries) {
            const sourcePath = path.join(source, entry.name);
            const destPath = path.join(destination, entry.name);

            if (entry.isDirectory()) {
                await this.copyDirectory(sourcePath, destPath);
            } else {
                await fs.promises.copyFile(sourcePath, destPath);
            }
        }
    }

    private startAutoBackup(): void {
        this.backupTimer = setInterval(async () => {
            const backupDir = path.join(this.baseDir, '..', 'backups', new Date().toISOString().replace(/[:.]/g, '-'));
            try {
                await this.backup(backupDir);
            } catch (error) {
                console.error('Auto-backup failed:', error);
            }
        }, this.backupInterval);
    }
}

export default FileSystemDocumentStore;