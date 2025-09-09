import { DocumentStore, DocumentStoreSnapshot, StorageOptions } from './DocumentStore.js';
import * as fs from 'fs';
import * as path from 'path';

export interface SnapshotConfig {
    enabled: boolean;
    interval: number; // milliseconds
    maxSnapshots: number;
    directory: string;
    compression?: boolean;
    format?: 'json' | 'binary';
    onSnapshotCreated?: (snapshot: SnapshotMetadata) => void;
    onSnapshotRestored?: (snapshot: SnapshotMetadata) => void;
    onError?: (error: Error) => void;
}

export interface SnapshotMetadata {
    id: string;
    timestamp: number;
    version: string;
    size: number;
    documentCount: number;
    indexCount: number;
    filePath: string;
    checksum?: string;
    tags?: string[];
}

export interface SnapshotRestoreOptions {
    clearExisting?: boolean;
    indexFilter?: string[];
    documentFilter?: (doc: any) => boolean;
    mergeStrategy?: 'replace' | 'merge' | 'skip';
}

/**
 * SnapshotManager
 * Manages snapshots across different document stores with scheduling, compression, and optimization
 */
export class SnapshotManager {
    private stores: Map<string, DocumentStore> = new Map();
    private config: SnapshotConfig;
    private intervalId: NodeJS.Timeout | null = null;
    private isRunning: boolean = false;
    private snapshotMetadata: Map<string, SnapshotMetadata> = new Map();

    constructor(config: SnapshotConfig) {
        this.config = {
            enabled: true,
            interval: 300000, // 5 minutes default
            maxSnapshots: 10,
            directory: './snapshots',
            compression: true,
            format: 'json',
            ...config
        };

        this.ensureSnapshotDirectory();
        this.loadSnapshotMetadata();
    }

    /**
     * Register a document store for snapshot management
     */
    registerStore(name: string, store: DocumentStore): void {
        this.stores.set(name, store);
        }

    /**
     * Unregister a document store
     */
    unregisterStore(name: string): void {
        this.stores.delete(name);
        }

    /**
     * Start automatic snapshot scheduling
     */
    start(): void {
        if (!this.config.enabled || this.isRunning) return;

        this.isRunning = true;
        this.intervalId = setInterval(async () => {
            try {
                await this.createAllSnapshots();
            } catch (error) {
                console.error('❌ Scheduled snapshot failed:', error);
                this.config.onError?.(error as Error);
            }
        }, this.config.interval);

        }

    /**
     * Stop automatic snapshot scheduling
     */
    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.isRunning = false;
        }

    /**
     * Create snapshots for all registered stores
     */
    async createAllSnapshots(): Promise<SnapshotMetadata[]> {
        const results: SnapshotMetadata[] = [];

        for (const [storeName, store] of this.stores) {
            try {
                const metadata = await this.createSnapshot(storeName, store);
                results.push(metadata);
            } catch (error) {
                console.error(`❌ Failed to create snapshot for store '${storeName}':`, error);
                this.config.onError?.(error as Error);
            }
        }

        await this.cleanupOldSnapshots();
        return results;
    }

    /**
     * Create a snapshot for a specific store
     */
    async createSnapshot(storeName: string, store?: DocumentStore, tags?: string[]): Promise<SnapshotMetadata> {
        const targetStore = store || this.stores.get(storeName);
        if (!targetStore) {
            throw new Error(`Store '${storeName}' not found`);
        }

        const startTime = Date.now();

        // Create snapshot from store
        const snapshot = await targetStore.createSnapshot();

        // Generate metadata
        const snapshotId = `${storeName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const fileName = `${snapshotId}.${this.config.format}`;
        const filePath = path.join(this.config.directory, fileName);

        // Save snapshot to file
        const size = await this.saveSnapshotToFile(snapshot, filePath);

        const metadata: SnapshotMetadata = {
            id: snapshotId,
            timestamp: snapshot.timestamp,
            version: snapshot.version,
            size,
            documentCount: snapshot.documents.size,
            indexCount: Object.keys(snapshot.metadata.indexes || {}).length,
            filePath,
            tags: tags || []
        };

        // Store metadata
        this.snapshotMetadata.set(snapshotId, metadata);
        await this.saveSnapshotMetadata();

        const duration = Date.now() - startTime;
        console.log(`✅ Snapshot '${snapshotId}' created successfully in ${duration}ms`);

        this.config.onSnapshotCreated?.(metadata);
        return metadata;
    }

    /**
     * Restore a snapshot to a store
     */
    async restoreSnapshot(
        snapshotId: string,
        storeName: string,
        options: SnapshotRestoreOptions = {}
    ): Promise<boolean> {
        const metadata = this.snapshotMetadata.get(snapshotId);
        if (!metadata) {
            throw new Error(`Snapshot '${snapshotId}' not found`);
        }

        const store = this.stores.get(storeName);
        if (!store) {
            throw new Error(`Store '${storeName}' not found`);
        }

        const startTime = Date.now();

        try {
            // Load snapshot from file
            const snapshot = await this.loadSnapshotFromFile(metadata.filePath);

            // Apply filters if specified
            if (options.indexFilter || options.documentFilter) {
                this.filterSnapshot(snapshot, options);
            }

            // Clear existing data if requested
            if (options.clearExisting) {
                await store.clear();
            }

            // Load snapshot into store
            const success = await store.loadSnapshot(snapshot);

            if (success) {
                const duration = Date.now() - startTime;
                this.config.onSnapshotRestored?.(metadata);
                return true;
            } else {
                throw new Error('Store failed to load snapshot');
            }
        } catch (error) {
            console.error(`❌ Failed to restore snapshot '${snapshotId}':`, error);
            this.config.onError?.(error as Error);
            return false;
        }
    }

    /**
     * List available snapshots
     */
    listSnapshots(storeName?: string, tags?: string[]): SnapshotMetadata[] {
        let snapshots = Array.from(this.snapshotMetadata.values());

        // Filter by store name
        if (storeName) {
            snapshots = snapshots.filter(s => s.id.startsWith(storeName));
        }

        // Filter by tags
        if (tags && tags.length > 0) {
            snapshots = snapshots.filter(s =>
                tags.some(tag => s.tags?.includes(tag))
            );
        }

        return snapshots.sort((a, b) => b.timestamp - a.timestamp);
    }

    /**
     * Delete a snapshot
     */
    async deleteSnapshot(snapshotId: string): Promise<boolean> {
        const metadata = this.snapshotMetadata.get(snapshotId);
        if (!metadata) {
            return false;
        }

        try {
            // Delete file
            if (fs.existsSync(metadata.filePath)) {
                await fs.promises.unlink(metadata.filePath);
            }

            // Remove metadata
            this.snapshotMetadata.delete(snapshotId);
            await this.saveSnapshotMetadata();

            return true;
        } catch (error) {
            console.error(`❌ Failed to delete snapshot '${snapshotId}':`, error);
            return false;
        }
    }

    /**
     * Get snapshot statistics
     */
    getStats(): {
        totalSnapshots: number;
        totalSize: number;
        oldestSnapshot?: SnapshotMetadata;
        newestSnapshot?: SnapshotMetadata;
        byStore: Record<string, number>;
    } {
        const snapshots = Array.from(this.snapshotMetadata.values());
        const byStore: Record<string, number> = {};

        let totalSize = 0;
        for (const snapshot of snapshots) {
            totalSize += snapshot.size;
            const storeName = snapshot.id.split('_')[0];
            byStore[storeName] = (byStore[storeName] || 0) + 1;
        }

        const sorted = snapshots.sort((a, b) => a.timestamp - b.timestamp);

        return {
            totalSnapshots: snapshots.length,
            totalSize,
            oldestSnapshot: sorted[0],
            newestSnapshot: sorted[sorted.length - 1],
            byStore
        };
    }

    // Private helper methods
    private ensureSnapshotDirectory(): void {
        if (!fs.existsSync(this.config.directory)) {
            fs.mkdirSync(this.config.directory, { recursive: true });
        }
    }

    private async saveSnapshotToFile(snapshot: DocumentStoreSnapshot, filePath: string): Promise<number> {
        const data = {
            ...snapshot,
            documents: Array.from(snapshot.documents.entries())
        };

        let content: string | Buffer;
        if (this.config.format === 'json') {
            content = JSON.stringify(data, null, this.config.compression ? 0 : 2);
        } else {
            // Binary format could use compression/serialization
            content = JSON.stringify(data);
        }

        await fs.promises.writeFile(filePath, content, 'utf8');
        return Buffer.byteLength(content, 'utf8');
    }

    private async loadSnapshotFromFile(filePath: string): Promise<DocumentStoreSnapshot> {
        const content = await fs.promises.readFile(filePath, 'utf8');
        const data = JSON.parse(content);

        return {
            ...data,
            documents: new Map(data.documents)
        };
    }

    private filterSnapshot(snapshot: DocumentStoreSnapshot, options: SnapshotRestoreOptions): void {
        const filteredDocs = new Map<string, any>();

        for (const [key, doc] of snapshot.documents) {
            // Index filter
            if (options.indexFilter && !options.indexFilter.includes(doc.indexName)) {
                continue;
            }

            // Document filter
            if (options.documentFilter && !options.documentFilter(doc)) {
                continue;
            }

            filteredDocs.set(key, doc);
        }

        snapshot.documents = filteredDocs;
    }

    private async cleanupOldSnapshots(): Promise<void> {
        const snapshots = Array.from(this.snapshotMetadata.values())
            .sort((a, b) => b.timestamp - a.timestamp);

        const toDelete = snapshots.slice(this.config.maxSnapshots);

        for (const snapshot of toDelete) {
            await this.deleteSnapshot(snapshot.id);
        }

        if (toDelete.length > 0) {
            }
    }

    private async loadSnapshotMetadata(): Promise<void> {
        const metadataPath = path.join(this.config.directory, 'metadata.json');
        if (fs.existsSync(metadataPath)) {
            try {
                const content = await fs.promises.readFile(metadataPath, 'utf8');
                const data = JSON.parse(content);
                this.snapshotMetadata = new Map(Object.entries(data));
            } catch (error) {
                }
        }
    }

    private async saveSnapshotMetadata(): Promise<void> {
        const metadataPath = path.join(this.config.directory, 'metadata.json');
        const data = Object.fromEntries(this.snapshotMetadata);
        await fs.promises.writeFile(metadataPath, JSON.stringify(data, null, 2), 'utf8');
    }

    private formatBytes(bytes: number): string {
        const sizes = ['B', 'KB', 'MB', 'GB'];
        if (bytes === 0) return '0 B';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return `${Math.round(bytes / Math.pow(1024, i) * 100) / 100} ${sizes[i]}`;
    }
}