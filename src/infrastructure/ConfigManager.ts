import fs from 'fs';
import path from 'path';
import { cpus } from 'os';

// Type definitions
export interface AppConfig {
    env: 'development' | 'production' | 'test';
    logLevel: 'error' | 'warn' | 'info' | 'http' | 'verbose' | 'debug' | 'silly';
    workerPool: WorkerPoolConfig;
    persistence: PersistenceConfig;
    query: QueryConfig;
    performance: PerformanceConfig;
    sharding: ShardingConfig;
    faceting: FacetingConfig;
    logging: LoggingConfig;
    advanced: AdvancedConfig;
    [key: string]: any;
}

export interface WorkerPoolConfig {
    totalWorkers: number;
    minWriteWorkers: number;
    maxWriteWorkers: number;
    readPriority: number;
    queueTimeout: number;
    workerTimeout: number;
    historySize: number;
    healthCheckInterval: number;
    performanceInterval: number;
    alertThresholds: {
        memoryUsage: number;
        avgQueryTime: number;
        errorRate: number;
    };
}

export interface PersistenceConfig {
    enabled: boolean;
    interval: number;
    saveOnAdd: boolean;
    saveOnShutdown: boolean;
    batchSize: number;
    baseDir: string;
    documentsFile: string;
    indexFile: string;
    metadataFile: string;
    globalMetadataFile: string;
    mappingsFile: string;
    compression: boolean;
    maxParallelShards: number;
    enableShardedStorage?: boolean;
}

export interface QueryConfig {
    maxResultSize: number;
    maxOffsetSize: number;
    maxAggregationSize: number;
    queryCacheTTL: number;
    cleanupInterval: number;
}

export interface PerformanceConfig {
    enableQueryCache: boolean;
    enableFastApproximateScoring: boolean;
    scoringBatchSize: number;
    enableParallelTokenProcessing: boolean;
    maxParallelTokens: number;
}

export interface ShardingConfig {
    enableShardedStorage: boolean;
    numShards: number;
    shardingStrategy: 'hash' | 'range' | 'custom';
}

export interface FacetingConfig {
    maxFacetValues: number;
    defaultFacetSize: number;
}

export interface LoggingConfig {
    format: 'json' | 'pretty';
    enableFileLogging: boolean;
    logDir: string;
}

export interface AdvancedConfig {
    useSharedMemory: boolean;
    sharedMemorySize: number;
    maxDocuments: number;
    maxTerms: number;
    taskTimeout: number;
    enableAsyncShutdown: boolean;
    shutdownTimeout: number;
}

interface ValidationRule {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    allowedValues?: any[];
    properties?: ValidationRules;
}

interface ValidationRules {
    [key: string]: ValidationRule;
}

const defaultConfig: AppConfig = {
    env: 'development',
    logLevel: 'info',
    workerPool: {
        totalWorkers: cpus().length,
        minWriteWorkers: 1,
        maxWriteWorkers: Math.max(2, Math.floor(cpus().length / 2)),
        readPriority: 5,
        queueTimeout: 10000,
        workerTimeout: 60000,
        historySize: 1000,
        healthCheckInterval: 15000,
        performanceInterval: 30000,
        alertThresholds: {
            memoryUsage: 0.85,
            avgQueryTime: 5000,
            errorRate: 0.1
        }
    },
    persistence: {
        enabled: true,
        interval: 300000,
        saveOnAdd: true,
        saveOnShutdown: true,
        batchSize: 100,
        baseDir: './.data',
        documentsFile: 'documents.jsonl',
        indexFile: 'index.jsonl',
        metadataFile: 'metadata.json',
        globalMetadataFile: 'global-metadata.json',
        mappingsFile: 'mappings.json',
        compression: false,
        maxParallelShards: 4
    },
    query: {
        maxResultSize: 1000,
        maxOffsetSize: 10000,
        maxAggregationSize: 100,
        queryCacheTTL: 60000,
        cleanupInterval: 30000
    },
    performance: {
        enableQueryCache: true,
        enableFastApproximateScoring: true,
        scoringBatchSize: 100,
        enableParallelTokenProcessing: true,
        maxParallelTokens: cpus().length
    },
    sharding: {
        enableShardedStorage: true,
        numShards: 8,
        shardingStrategy: 'hash'
    },
    faceting: {
        maxFacetValues: 100,
        defaultFacetSize: 10
    },
    logging: {
        format: 'pretty',
        enableFileLogging: false,
        logDir: './logs'
    },
    advanced: {
        useSharedMemory: true,
        sharedMemorySize: 1024 * 1024 * 256, // 256MB
        maxDocuments: 1000000,
        maxTerms: 5000000,
        taskTimeout: 30000,
        enableAsyncShutdown: true,
        shutdownTimeout: 10000
    }
};

class ConfigManager {
    private config: AppConfig;
    private readonly schema: ValidationRules = {
        env: { type: 'string', required: true, allowedValues: ['development', 'production', 'test'] },
        logLevel: { type: 'string', allowedValues: ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'] },
        workerPool: {
            type: 'object',
            properties: {
                totalWorkers: { type: 'number', min: 1, max: 32 },
                minWriteWorkers: { type: 'number', min: 1, max: 16 },
                maxWriteWorkers: { type: 'number', min: 1, max: 32 },
                readPriority: { type: 'number', min: 1, max: 10 },
                queueTimeout: { type: 'number', min: 1000, max: 60000 },
                workerTimeout: { type: 'number', min: 10000, max: 300000 },
                historySize: { type: 'number', min: 100, max: 10000 },
                healthCheckInterval: { type: 'number', min: 5000, max: 60000 },
                performanceInterval: { type: 'number', min: 10000, max: 600000 },
                alertThresholds: {
                    type: 'object',
                    properties: {
                        memoryUsage: { type: 'number', min: 0.1, max: 0.95 },
                        avgQueryTime: { type: 'number', min: 100, max: 10000 },
                        errorRate: { type: 'number', min: 0.01, max: 0.5 }
                    }
                }
            }
        },
        persistence: {
            type: 'object',
            properties: {
                enabled: { type: 'boolean' },
                interval: { type: 'number', min: 1000, max: 600000 },
                saveOnAdd: { type: 'boolean' },
                saveOnShutdown: { type: 'boolean' },
                batchSize: { type: 'number', min: 1, max: 1000 }
            }
        },
        query: {
            type: 'object',
            properties: {
                maxResultSize: { type: 'number', min: 10, max: 10000 },
                maxOffsetSize: { type: 'number', min: 1000, max: 100000 },
                maxAggregationSize: { type: 'number', min: 10, max: 1000 },
                queryCacheTTL: { type: 'number', min: 1000, max: 3600000 },
                cleanupInterval: { type: 'number', min: 1000, max: 300000 }
            }
        },
        performance: {
            type: 'object',
            properties: {
                enableQueryCache: { type: 'boolean' },
                enableFastApproximateScoring: { type: 'boolean' },
                scoringBatchSize: { type: 'number', min: 10, max: 1000 },
                enableParallelTokenProcessing: { type: 'boolean' },
                maxParallelTokens: { type: 'number', min: 1, max: 32 }
            }
        }
    };
    private configLoaded: boolean = false;

    constructor() {
        this.config = defaultConfig;
    }

    async loadConfig(configPath?: string): Promise<void> {
        if (this.configLoaded) {
            return;
        }

        const resolvedPath = this.resolveConfigPath(configPath);
        if (resolvedPath && fs.existsSync(resolvedPath)) {
            try {
                // Handle both JSON and JavaScript config files
                if (resolvedPath.endsWith('.json')) {
                    const fileContent = fs.readFileSync(resolvedPath, 'utf-8');
                    const userConfig = JSON.parse(fileContent);
                    this.config = this._mergeConfigs(this.config, userConfig);
                } else if (resolvedPath.endsWith('.js')) {
                    // For JavaScript files, use require (works better on Windows)
                    delete require.cache[resolvedPath]; // Clear cache to ensure fresh load
                    const configModule = require(resolvedPath);
                    const userConfig = configModule.default || configModule;
                    this.config = this._mergeConfigs(this.config, userConfig);
                } else {
                    // Try JSON first, then fall back to require for JS files
                    try {
                        const fileContent = fs.readFileSync(resolvedPath, 'utf-8');
                        const userConfig = JSON.parse(fileContent);
                        this.config = this._mergeConfigs(this.config, userConfig);
                    } catch (jsonError) {
                        // If JSON parsing fails, try as JavaScript module
                        try {
                            delete require.cache[resolvedPath]; // Clear cache to ensure fresh load
                            const configModule = require(resolvedPath);
                            const userConfig = configModule.default || configModule;
                            this.config = this._mergeConfigs(this.config, userConfig);
                        } catch (requireError) {
                        }
                    }
                }
            } catch (error: any) {
            }
        }

        this.validateConfig(this.config);
        this.configLoaded = true;
    }

    private resolveConfigPath(configPath?: string): string | null {
        if (configPath) {
            return path.resolve(configPath);
        }
        const defaultPath = path.resolve(process.cwd(), 'inquir.config.js');
        if (fs.existsSync(defaultPath)) {
            return defaultPath;
        }
        return null;
    }

    get<K extends keyof AppConfig>(key: K): AppConfig[K] {
        if (!this.configLoaded) {
        }
        return this.config[key];
    }

    set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void {
        this.config[key] = value;
        this.validateConfig(this.config);
    }

    private _mergeConfigs(baseConfig: any, userConfig: any): any {
        const result = { ...baseConfig };
        for (const key in userConfig) {
            if (Object.prototype.hasOwnProperty.call(userConfig, key)) {
                if (typeof result[key] === 'object' && result[key] !== null && !Array.isArray(result[key]) &&
                    typeof userConfig[key] === 'object' && userConfig[key] !== null && !Array.isArray(userConfig[key])) {
                    result[key] = this._mergeConfigs(result[key], userConfig[key]);
                } else {
                    result[key] = userConfig[key];
                }
            }
        }
        return result;
    }

    private validateConfig(config: AppConfig): void {
        this._validate(config, this.schema);
    }

    private _validate(data: any, schema: ValidationRules, path: string = ''): void {
        for (const key in schema) {
            if (Object.prototype.hasOwnProperty.call(schema, key)) {
                const rule = schema[key];
                const value = data[key];
                const currentPath = path ? `${path}.${key}` : key;

                if (rule.required && (value === undefined || value === null)) {
                    throw new Error(`Config validation error: '${currentPath}' is required.`);
                }

                if (value !== undefined && value !== null) {
                    if (typeof value !== rule.type && rule.type !== 'array') {
                        throw new Error(`Config validation error: '${currentPath}' should be of type ${rule.type}.`);
                    }

                    if (rule.type === 'string') {
                        if (rule.minLength && value.length < rule.minLength) {
                            throw new Error(`Config validation error: '${currentPath}' should have a minimum length of ${rule.minLength}.`);
                        }
                        if (rule.maxLength && value.length > rule.maxLength) {
                            throw new Error(`Config validation error: '${currentPath}' should have a maximum length of ${rule.maxLength}.`);
                        }
                    }

                    if (rule.type === 'number') {
                        if (rule.min !== undefined && value < rule.min) {
                            throw new Error(`Config validation error: '${currentPath}' should be at least ${rule.min}.`);
                        }
                        if (rule.max !== undefined && value > rule.max) {
                            throw new Error(`Config validation error: '${currentPath}' should be at most ${rule.max}.`);
                        }
                    }

                    if (rule.allowedValues && !rule.allowedValues.includes(value)) {
                        throw new Error(`Config validation error: '${currentPath}' has an invalid value. Allowed values are: ${rule.allowedValues.join(', ')}.`);
                    }

                    if (rule.type === 'object' && rule.properties && typeof value === 'object') {
                        this._validate(value, rule.properties, currentPath);
                    }
                }
            }
        }
    }
}

let configManagerInstance: ConfigManager;

export const getConfigManager = (): ConfigManager => {
    if (!configManagerInstance) {
        configManagerInstance = new ConfigManager();
        configManagerInstance.loadConfig().catch(error => {
        });
    }
    return configManagerInstance;
};

export const __TEST_ONLY__ = {
    reset: () => {
        configManagerInstance = new ConfigManager();
    }
};