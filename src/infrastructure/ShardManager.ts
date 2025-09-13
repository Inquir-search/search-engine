import { FileSystemManager } from './FileSystemManager';
import { GlobalMetadata, ShardMetadata, ShardFiles, IndexShardingConfig } from './types';

export class ShardManager {
    private readonly baseDir: string;
    private readonly fileSystemManager: FileSystemManager;
    private readonly indexShardingConfig?: IndexShardingConfig;

    constructor(baseDir: string, fileSystemManager: FileSystemManager, indexShardingConfig?: IndexShardingConfig) {
        this.baseDir = baseDir;
        this.fileSystemManager = fileSystemManager;
        this.indexShardingConfig = indexShardingConfig;
    }

    getShardDir(shardIndex: number): string {
        return `${this.baseDir}/shard-${shardIndex}`;
    }

    getShardFiles(shardIndex: number): ShardFiles {
        const shardDir = this.getShardDir(shardIndex);
        return {
            documents: `${shardDir}/documents.jsonl`,
            index: `${shardDir}/index.jsonl`,
            docLengths: `${shardDir}/docLengths.json`,
            metadata: `${shardDir}/metadata.json`,
        };
    }

    ensureShardDir(shardIndex: number): void {
        const shardDir = this.getShardDir(shardIndex);
        this.fileSystemManager.ensureDirectoryExists(shardDir);
    }

    loadShardMetadata(shardIndex: number): ShardMetadata {
        const files = this.getShardFiles(shardIndex);
        if (this.fileSystemManager.pathExists(files.metadata)) {
            const data = this.fileSystemManager.readFileSync(files.metadata);
            return JSON.parse(data);
        }
        return {
            shardIndex,
            documentCount: 0,
            indexCount: 0,
            lastUpdate: new Date().toISOString(),
        };
    }

    saveShardMetadata(shardIndex: number, metadata: ShardMetadata): void {
        const files = this.getShardFiles(shardIndex);
        this.fileSystemManager.writeFileSync(files.metadata, JSON.stringify(metadata, null, 2));
    }

    getShardForDoc(docId: string): number {
        const numShards = this.indexShardingConfig?.numShards ?? 1;
        // Simple hash-based sharding
        let hash = 0;
        for (let i = 0; i < docId.length; i++) {
            const char = docId.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash |= 0; // Convert to 32bit integer
        }
        return Math.abs(hash) % numShards;
    }

    getShardForTerm(term: string): number {
        const numShards = this.indexShardingConfig?.numShards ?? 1;
        // Simple hash-based sharding
        let hash = 0;
        for (let i = 0; i < term.length; i++) {
            const char = term.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash |= 0; // Convert to 32bit integer
        }
        return Math.abs(hash) % numShards;
    }
}