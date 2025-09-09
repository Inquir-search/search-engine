import { DocumentStore, StorageOptions } from './DocumentStore.js';
import InMemoryDocumentStore from './InMemoryDocumentStore.js';
import FileSystemDocumentStore from './FileSystemDocumentStore.js';
import ShardedDocumentStore from './ShardedDocumentStore.js';
import RedisDocumentStore from './RedisDocumentStore.js';

export type StoreType = 'memory' | 'filesystem' | 'sharded' | 'redis';

export interface DocumentStoreConfig {
    type: StoreType;
    baseDir?: string;

    // Memory store options
    // (no specific options for in-memory)

    // File system options
    syncWrites?: boolean;
    autoBackup?: boolean;
    backupInterval?: number;

    // Sharded store options
    numShards?: number;
    shardingStrategy?: 'hash' | 'round-robin' | 'range' | 'custom';
    customShardFunction?: (document: any) => number;
    replicationFactor?: number;
    autoRebalance?: boolean;
    rebalanceThreshold?: number;

    // Redis options
    redis?: {
        host?: string;
        port?: number;
        password?: string;
        database?: number;
        keyPrefix?: string;
        ttl?: number;
        maxRetries?: number;
        retryDelay?: number;
        cluster?: boolean;
        clusterNodes?: Array<{ host: string; port: number }>;
    };

    // Common options
    consistency?: 'eventual' | 'strong';
    durability?: 'memory' | 'disk' | 'replicated';
    compression?: boolean;
    encryption?: boolean;
}

/**
 * Factory for creating document stores with different backends
 */
export class DocumentStoreFactory {
    private static instances: Map<string, DocumentStore> = new Map();

    /**
     * Create a document store instance
     */
    static async create(config: DocumentStoreConfig): Promise<DocumentStore> {
        const instanceKey = this.generateInstanceKey(config);

        // Return existing instance if available (singleton pattern)
        if (this.instances.has(instanceKey)) {
            return this.instances.get(instanceKey)!;
        }

        let store: DocumentStore;

        switch (config.type) {
            case 'memory':
                store = this.createInMemoryStore(config);
                break;

            case 'filesystem':
                store = this.createFileSystemStore(config);
                break;

            case 'sharded':
                store = this.createShardedStore(config);
                break;

            case 'redis':
                store = await this.createRedisStore(config);
                break;

            default:
                throw new Error(`Unsupported store type: ${config.type}`);
        }

        // Initialize the store
        await store.initialize();

        // Cache the instance
        this.instances.set(instanceKey, store);

        return store;
    }

    /**
     * Get an existing store instance
     */
    static get(instanceKey: string): DocumentStore | null {
        return this.instances.get(instanceKey) || null;
    }

    /**
     * Close and remove a store instance
     */
    static async close(instanceKey: string): Promise<boolean> {
        const store = this.instances.get(instanceKey);
        if (store) {
            await store.shutdown();
            this.instances.delete(instanceKey);
            return true;
        }
        return false;
    }

    /**
     * Close all store instances
     */
    static async closeAll(): Promise<void> {
        const closePromises = Array.from(this.instances.entries()).map(
            async ([key, store]) => {
                try {
                    await store.shutdown();
                } catch (error) {
                    console.error(`❌ Error closing store ${key}:`, error);
                }
            }
        );

        await Promise.all(closePromises);
        this.instances.clear();
    }

    /**
     * List all active store instances
     */
    static listInstances(): Array<{ key: string; type: string; healthy: boolean }> {
        return Array.from(this.instances.entries()).map(([key, store]) => ({
            key,
            type: this.extractTypeFromKey(key),
            healthy: false // Would need to call isHealthy() async
        }));
    }

    /**
     * Create configuration for different common scenarios
     */
    static getPresetConfig(preset: 'development' | 'testing' | 'production-single' | 'production-sharded' | 'production-redis'): DocumentStoreConfig {
        switch (preset) {
            case 'development':
                return {
                    type: 'memory',
                    consistency: 'strong',
                    durability: 'memory'
                };

            case 'testing':
                return {
                    type: 'memory',
                    consistency: 'strong',
                    durability: 'memory'
                };

            case 'production-single':
                return {
                    type: 'filesystem',
                    baseDir: './data/production',
                    syncWrites: true,
                    autoBackup: true,
                    backupInterval: 3600000, // 1 hour
                    consistency: 'strong',
                    durability: 'disk',
                    compression: true
                };

            case 'production-sharded':
                return {
                    type: 'sharded',
                    baseDir: './data/sharded',
                    numShards: 8,
                    shardingStrategy: 'hash',
                    replicationFactor: 2,
                    autoRebalance: true,
                    rebalanceThreshold: 0.3,
                    consistency: 'eventual',
                    durability: 'disk',
                    compression: true
                };

            case 'production-redis':
                return {
                    type: 'redis',
                    redis: {
                        host: 'localhost',
                        port: 6379,
                        keyPrefix: 'docs:',
                        maxRetries: 5,
                        retryDelay: 1000
                    },
                    consistency: 'strong',
                    durability: 'replicated'
                };

            default:
                throw new Error(`Unknown preset: ${preset}`);
        }
    }

    /**
     * Create a configuration for a specific environment
     */
    static createEnvironmentConfig(env: string = process.env.NODE_ENV || 'development'): DocumentStoreConfig {
        switch (env.toLowerCase()) {
            case 'test':
            case 'testing':
                return this.getPresetConfig('testing');

            case 'development':
            case 'dev':
                return this.getPresetConfig('development');

            case 'production':
            case 'prod':
                // Choose based on environment variables
                if (process.env.REDIS_URL || process.env.REDIS_HOST) {
                    return {
                        ...this.getPresetConfig('production-redis'),
                        redis: {
                            host: process.env.REDIS_HOST || 'localhost',
                            port: parseInt(process.env.REDIS_PORT || '6379'),
                            password: process.env.REDIS_PASSWORD,
                            database: parseInt(process.env.REDIS_DB || '0'),
                            keyPrefix: process.env.REDIS_KEY_PREFIX || 'docs:'
                        }
                    };
                } else if (process.env.ENABLE_SHARDING === 'true') {
                    return {
                        ...this.getPresetConfig('production-sharded'),
                        numShards: parseInt(process.env.NUM_SHARDS || '8'),
                        baseDir: process.env.DATA_DIR || './data/sharded'
                    };
                } else {
                    return {
                        ...this.getPresetConfig('production-single'),
                        baseDir: process.env.DATA_DIR || './data/production'
                    };
                }

            default:
                return this.getPresetConfig('development');
        }
    }

    // Private factory methods

    private static createInMemoryStore(config: DocumentStoreConfig): InMemoryDocumentStore {
        return new InMemoryDocumentStore({
            consistency: config.consistency,
            durability: config.durability,
            compression: config.compression,
            encryption: config.encryption
        });
    }

    private static createFileSystemStore(config: DocumentStoreConfig): FileSystemDocumentStore {
        return new FileSystemDocumentStore({
            baseDir: config.baseDir,
            syncWrites: config.syncWrites,
            autoBackup: config.autoBackup,
            backupInterval: config.backupInterval,
            consistency: config.consistency,
            durability: config.durability,
            compression: config.compression,
            encryption: config.encryption
        });
    }

    private static createShardedStore(config: DocumentStoreConfig): ShardedDocumentStore {
        return new ShardedDocumentStore({
            baseDir: config.baseDir,
            numShards: config.numShards,
            shardingStrategy: config.shardingStrategy,
            customShardFunction: config.customShardFunction,
            replicationFactor: config.replicationFactor,
            autoRebalance: config.autoRebalance,
            rebalanceThreshold: config.rebalanceThreshold,
            consistency: config.consistency,
            durability: config.durability,
            compression: config.compression,
            encryption: config.encryption
        });
    }

    private static async createRedisStore(config: DocumentStoreConfig): Promise<RedisDocumentStore> {
        // Create Redis client based on configuration
        const redisClient = await this.createRedisClient(config.redis || {});

        return new RedisDocumentStore(redisClient, {
            ...config.redis,
            consistency: config.consistency,
            durability: config.durability,
            compression: config.compression,
            encryption: config.encryption
        });
    }

    private static async createRedisClient(redisConfig: NonNullable<DocumentStoreConfig['redis']>): Promise<any> {
        // This is a placeholder implementation
        // In a real application, you would import and configure a Redis client library

        throw new Error('Redis client not implemented - please install and configure a Redis client library');

        // Mock Redis client for demonstration
        return {
            connect: async () => { },
            disconnect: async () => { },
            ping: async () => 'PONG',
            set: async (key: string, value: string) => 'OK',
            get: async (key: string) => null,
            del: async (key: string | string[]) => 0,
            exists: async (key: string | string[]) => 0,
            keys: async (pattern: string) => [],
            mset: async (keyValues: Record<string, string>) => 'OK',
            mget: async (keys: string[]) => keys.map(() => null),
            hset: async (key: string, field: string, value: string) => 1,
            hget: async (key: string, field: string) => null,
            hgetall: async (key: string) => ({}),
            hdel: async (key: string, field: string | string[]) => 0,
            sadd: async (key: string, member: string | string[]) => 1,
            smembers: async (key: string) => [],
            srem: async (key: string, member: string | string[]) => 1,
            flushdb: async () => 'OK',
            expire: async (key: string, seconds: number) => 1,
            ttl: async (key: string) => -1
        };
    }

    private static generateInstanceKey(config: DocumentStoreConfig): string {
        const parts = [config.type];

        if (config.baseDir) {
            parts.push(config.baseDir.replace(/[/\\]/g, '_'));
        }

        if (config.redis?.host) {
            parts.push(`${config.redis.host}:${config.redis.port || 6379}`);
        }

        if (config.numShards) {
            parts.push(`shards-${config.numShards}`);
        }

        return parts.join('-');
    }

    private static extractTypeFromKey(key: string): string {
        return key.split('-')[0];
    }
}

export default DocumentStoreFactory;