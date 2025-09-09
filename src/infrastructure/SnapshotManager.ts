import { FileSystemManager } from './FileSystemManager';
import { ShardManager } from './ShardManager';
import { GlobalMetadata, PersistenceSnapshot, ShardedStateInput, ShardIncrementalUpdates } from './types';

export class SnapshotManager {
    private readonly fileSystemManager: FileSystemManager;
    private readonly shardManager: ShardManager;
    private readonly baseDir: string;

    constructor(baseDir: string, fileSystemManager: FileSystemManager, shardManager: ShardManager) {
        this.baseDir = baseDir;
        this.fileSystemManager = fileSystemManager;
        this.shardManager = shardManager;
    }

    async saveSnapshot(state: any): Promise<void> {
        try {
            // Save global metadata
            const globalMetadata: GlobalMetadata = {
                totalDocs: state.totalDocs || 0,
                avgDocLength: state.avgDocLength || 0,
                lastFlush: new Date().toISOString(),
                documentCount: state.totalDocs || 0,
                indexCount: 1,
                shardMetadata: {},
                isSharded: false,
                numShards: 1,
                enableShardedStorage: false,
                facetFields: state.facetFields || []
            };

            this.fileSystemManager.writeFileSync(
                `${this.baseDir}/global-metadata.json`,
                JSON.stringify(globalMetadata, null, 2)
            );

            // Save documents
            if (state.documents && state.documents.size > 0) {
                const documentsArray = Array.from(state.documents.values());
                const documentsContent = documentsArray.map(doc => JSON.stringify(doc)).join('\n');
                this.fileSystemManager.writeFileSync(`${this.baseDir}/documents.jsonl`, documentsContent);
            }

            // Save inverted index
            if (state.invertedIndex) {
                const indexContent = JSON.stringify(state.invertedIndex, null, 2);
                this.fileSystemManager.writeFileSync(`${this.baseDir}/index.jsonl`, indexContent);
            }

            // Save document lengths
            if (state.docLengths && state.docLengths.size > 0) {
                const docLengthsObj = Object.fromEntries(state.docLengths);
                this.fileSystemManager.writeFileSync(`${this.baseDir}/doc_lengths.jsonl`, JSON.stringify(docLengthsObj, null, 2));
            }

            // Save mappings
            if (state.mappings) {
                this.fileSystemManager.writeFileSync(`${this.baseDir}/mappings.json`, JSON.stringify(state.mappings, null, 2));
            }

            // Save snapshot
            const snapshot = {
                documents: state.documents ? Object.fromEntries(state.documents) : {},
                invertedIndex: state.invertedIndex || {},
                docLengths: state.docLengths ? Object.fromEntries(state.docLengths) : {},
                totalDocs: state.totalDocs || 0,
                avgDocLength: state.avgDocLength || 0,
                mappings: state.mappings || {},
                facetEngine: state.facetEngine,
                facetFields: state.facetFields || []
            };

            this.fileSystemManager.writeFileSync(`${this.baseDir}/snapshot.json`, JSON.stringify(snapshot, null, 2));

        } catch (error) {
            console.error('Failed to save snapshot:', error);
            throw error;
        }
    }

    async loadSnapshot(): Promise<PersistenceSnapshot | null> {
        // Implementation for loading a full snapshot
        return null;
    }

    async saveShardedSnapshot(shardedState: ShardedStateInput): Promise<void> {
        try {
            // Save sharded data across multiple shards
            const { shards, documents } = shardedState;
            const numShards = shards.length;

            // Save global metadata with sharding info
            const globalMetadata: GlobalMetadata = {
                totalDocs: documents.flat().length,
                avgDocLength: 0, // Calculate if needed
                lastFlush: new Date().toISOString(),
                documentCount: documents.flat().length,
                indexCount: 1,
                shardMetadata: {},
                isSharded: true,
                numShards: numShards,
                enableShardedStorage: true,
                facetFields: []
            };

            // Calculate shard metadata
            for (let i = 0; i < numShards; i++) {
                const shardDocs = documents[i] || [];
                const shardIndex = shards[i] || {};

                globalMetadata.shardMetadata[i] = {
                    shardIndex: i,
                    documentCount: shardDocs.length,
                    indexCount: Object.keys(shardIndex).length,
                    lastUpdate: new Date().toISOString()
                };
            }

            this.fileSystemManager.writeFileSync(
                `${this.baseDir}/global-metadata.json`,
                JSON.stringify(globalMetadata, null, 2)
            );

            // Save each shard's data
            for (let i = 0; i < numShards; i++) {
                const shardDir = this.shardManager.getShardDir(i);
                this.fileSystemManager.ensureDirectoryExists(shardDir);

                const shardDocs = documents[i] || [];
                const shardIndex = shards[i] || {};

                // Save shard documents
                if (shardDocs.length > 0) {
                    const documentsContent = shardDocs.map(doc => JSON.stringify(doc)).join('\n');
                    this.fileSystemManager.writeFileSync(`${shardDir}/documents.jsonl`, documentsContent);
                }

                // Save shard index
                if (Object.keys(shardIndex).length > 0) {
                    this.fileSystemManager.writeFileSync(`${shardDir}/index.jsonl`, JSON.stringify(shardIndex, null, 2));
                }

                // Save shard metadata
                const shardMetadata = {
                    shardIndex: i,
                    documentCount: shardDocs.length,
                    indexCount: Object.keys(shardIndex).length,
                    lastUpdate: new Date().toISOString()
                };
                this.fileSystemManager.writeFileSync(`${shardDir}/metadata.json`, JSON.stringify(shardMetadata, null, 2));
            }

            // Save combined snapshot for backward compatibility
            const allDocuments = documents.flat();
            const allIndex = shards.reduce((acc, shard) => ({ ...acc, ...shard }), {});

            const snapshot = {
                documents: allDocuments.reduce((acc, doc, index) => ({ ...acc, [doc.id || index]: doc }), {}),
                invertedIndex: { index: allIndex },
                docLengths: {},
                totalDocs: allDocuments.length,
                avgDocLength: 0,
                mappings: {},
                facetEngine: null,
                facetFields: []
            };

            this.fileSystemManager.writeFileSync(`${this.baseDir}/snapshot.json`, JSON.stringify(snapshot, null, 2));

        } catch (error) {
            console.error('Failed to save sharded snapshot:', error);
            throw error;
        }
    }

    async loadShardedSnapshot(): Promise<PersistenceSnapshot | null> {
        // Implementation for loading a sharded snapshot
        return null;
    }

    async saveShardIncremental(shardIndex: number, updates: ShardIncrementalUpdates): Promise<void> {
        // Implementation for saving incremental shard updates
    }
}