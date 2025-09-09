import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import SearchEngine from '../domain/SearchEngine.js';
import StreamingPersistence from './StreamingPersistence.js';
import MappingsManager from '../domain/MappingsManager.js';
import RankingPipeline from '../domain/RankingPipeline.js';
import BM25Scorer from '../domain/BM25Scorer.js';
import { getConfigManager } from './ConfigManager.js';

// Value Objects
export class WorkerConfiguration {
    constructor(
        public readonly workerId: string,
        public readonly workerType: WorkerType
    ) { }
}

export class OperationResult {
    constructor(
        public readonly success: boolean,
        public readonly data?: any,
        public readonly error?: string
    ) { }

    static success(data?: any): OperationResult {
        return new OperationResult(true, data);
    }

    static failure(error: string): OperationResult {
        return new OperationResult(false, undefined, error);
    }
}

export class SearchEngineConfig {
    constructor(
        public readonly indexName: string,
        public readonly baseDir?: string,
        public readonly enableShardedStorage?: boolean,
        public readonly numShards?: number,
        public readonly autoPersistence?: any,
        public readonly facetFields?: string[]
    ) { }
}

// Domain Services
export class SearchEngineFactory {
    static async createSearchEngine(config: SearchEngineConfig): Promise<SearchEngine> {
        // Get configuration from ConfigManager
        const configManager = getConfigManager();
        const searchEngineConfig = configManager.get('searchEngine');

        // DISABLE auto-persistence in worker-level SearchEngines to prevent memory leaks
        // The main SharedMemoryWorkerPool handles persistence coordination
        const autoPersistenceConfig = {
            enabled: false,      // Disabled in workers to prevent duplicate saves
            interval: 60000,
            saveOnAdd: false,
            saveOnShutdown: false, // Let the main pool handle shutdown saves
            batchSize: 500
        };

        const persistence = new StreamingPersistence({
            baseDir: config.baseDir || StreamingPersistence.getIndexBaseDir(config.indexName),
            enableShardedStorage: config.enableShardedStorage ?? searchEngineConfig.enableShardedStorage
        });

        const mappingsManager = new MappingsManager(
            `${config.baseDir || StreamingPersistence.getIndexBaseDir(config.indexName)}/mappings.json`
        );

        const rankingPipeline = new RankingPipeline();
        const scorerFactory = (totalDocs: number, avgDocLength: number, docLengths: Map<string, number>, invertedIndex: any) =>
            new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex);

        const engine = await SearchEngine.create({
            enableShardedStorage: config.enableShardedStorage ?? searchEngineConfig.enableShardedStorage,
            numShards: config.numShards ?? searchEngineConfig.numShards,
            autoPersistence: autoPersistenceConfig,
            persistence,
            mappingsManager,
            rankingPipeline,
            scorerFactory,
            facetFields: config.facetFields ?? searchEngineConfig.facetFields
        });

        await engine.initialize();
        return engine;
    }

    static async createFromRestored(indexName: string, restoredData: RestoredData, facetFields: string[] = []): Promise<SearchEngine> {
        const { config, snapshot } = restoredData;

        // Create a fresh persistence instance for this worker
        const persistence = new StreamingPersistence({
            baseDir: config.baseDir,
            enableShardedStorage: config.enableShardedStorage
        });

        const mappingsManager = new MappingsManager(
            `${config.baseDir}/mappings.json`
        );

        const rankingPipeline = new RankingPipeline();
        const scorerFactory = (totalDocs: number, avgDocLength: number, docLengths: Map<string, number>, invertedIndex: any) =>
            new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex);

        // Get configuration from ConfigManager
        const configManager = getConfigManager();
        const searchEngineConfig = configManager.get('searchEngine');

        // DISABLE auto-persistence for restored engines to prevent memory leaks
        const autoPersistenceConfig = {
            enabled: false,      // Disabled in workers to prevent duplicate saves
            interval: 60000,
            saveOnAdd: false,
            saveOnShutdown: false,
            batchSize: 500
        };

        const engine = await SearchEngine.create({
            enableShardedStorage: config.enableShardedStorage ?? searchEngineConfig.enableShardedStorage,
            numShards: config.numShards ?? searchEngineConfig.numShards,
            autoPersistence: autoPersistenceConfig,
            persistence,
            mappingsManager,
            rankingPipeline,
            scorerFactory,
            facetFields: facetFields.length > 0 ? facetFields : (config.facetFields ?? searchEngineConfig.facetFields)
        });

        await engine.initialize();
        // The search engine will automatically load from persistence during initialization
        return engine;
    }
}

export class SearchOperationHandler {
    constructor(private readonly searchEngines: Map<string, SearchEngine>) { }

    async handleOperation(operation: SearchOperation): Promise<OperationResult> {
        const { type, indexName, data, taskId } = operation;

        try {
            switch (type) {
                case 'INIT_ENGINE':
                    return await this.initializeEngine(data);

                case 'INIT_FROM_RESTORED':
                    return await this.initializeFromRestored(indexName, data.restoredData, data.facetFields);

                case 'SEARCH':
                    return await this.search(indexName, data);

                case 'ADD_DOCUMENTS':
                    return await this.addDocuments(indexName, data);

                case 'DELETE_DOCUMENT':
                    return await this.deleteDocument(indexName, data);

                case 'GET_FACETS':
                    return await this.getFacets(indexName);

                case 'GET_STATS':
                    return await this.getStats(indexName);

                case 'FLUSH':
                    return await this.flush(indexName);

                case 'DELETE_INDEX':
                    return await this.deleteIndex(indexName);

                case 'LIST_INDICES':
                    return await this.listIndices();

                default:
                    return OperationResult.failure(`Unknown operation type: ${type}`);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return OperationResult.failure(errorMessage);
        }
    }

    private async initializeEngine(config: SearchEngineConfig): Promise<OperationResult> {
        try {
            const engine = await SearchEngineFactory.createSearchEngine(config);
            this.searchEngines.set(config.indexName, engine);
            return OperationResult.success({ indexName: config.indexName });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return OperationResult.failure(errorMessage);
        }
    }

    private async initializeFromRestored(indexName: string, restoredData: RestoredData, facetFields: string[] = []): Promise<OperationResult> {
        try {
            const engine = await SearchEngineFactory.createFromRestored(indexName, restoredData, facetFields);
            this.searchEngines.set(indexName, engine);
            return OperationResult.success({ indexName });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return OperationResult.failure(errorMessage);
        }
    }

    private async search(indexName: string, data: SearchData): Promise<OperationResult> {
        const engine = this.searchEngines.get(indexName);
        if (!engine) {
            return OperationResult.failure(`Index '${indexName}' not found in this worker`);
        }

        const results = engine.search(data.query, data.context);
        return OperationResult.success({ results });
    }

    private async addDocuments(indexName: string, data: AddDocumentsData): Promise<OperationResult> {
        const engine = this.searchEngines.get(indexName);
        if (!engine) {
            return OperationResult.failure(`Index '${indexName}' not found in this worker`);
        }

        let addedCount = 0;
        for (const doc of data.documents) {
            if (!doc.id) {
                continue;
            }
            engine.add(doc);
            addedCount++;
        }

        // No automatic flushing in workers - let the main pool handle persistence coordination
        // This prevents memory leaks from multiple persistence layers

        return OperationResult.success({
            addedCount,
            totalDocs: engine.totalDocs,
            autoFlushed: true
        });
    }

    private async deleteDocument(indexName: string, data: DeleteDocumentData): Promise<OperationResult> {
        const engine = this.searchEngines.get(indexName);
        if (!engine) {
            return OperationResult.failure(`Index '${indexName}' not found in this worker`);
        }

        try {
            engine.delete(data.docId);

            // Enhanced automatic flushing for deletions (quiet logging)
            await engine.flush();

            return OperationResult.success({
                deletedId: data.docId,
                totalDocs: engine.totalDocs,
                autoFlushed: true
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return OperationResult.failure(errorMessage);
        }
    }

    private async getFacets(indexName: string): Promise<OperationResult> {
        const engine = this.searchEngines.get(indexName);
        if (!engine) {
            return OperationResult.failure(`Index '${indexName}' not found in this worker`);
        }

        try {
            const facets = engine.getFacets();
            return OperationResult.success({ facets });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to get facets';
            return OperationResult.failure(errorMessage);
        }
    }

    private async getStats(indexName: string): Promise<OperationResult> {
        const engine = this.searchEngines.get(indexName);
        if (!engine) {
            return OperationResult.failure(`Index '${indexName}' not found in this worker`);
        }

        try {
            const stats = engine.getStats();
            return OperationResult.success({ stats });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to get stats';
            return OperationResult.failure(errorMessage);
        }
    }

    private async flush(indexName: string): Promise<OperationResult> {
        const engine = this.searchEngines.get(indexName);
        if (!engine) {
            return OperationResult.failure(`Index '${indexName}' not found in this worker`);
        }

        await engine.flush();
        return OperationResult.success();
    }

    private async deleteIndex(indexName: string): Promise<OperationResult> {
        const engine = this.searchEngines.get(indexName);
        if (!engine) {
            return OperationResult.failure(`Index '${indexName}' not found in this worker`);
        }

        await engine.shutdown();
        this.searchEngines.delete(indexName);
        return OperationResult.success();
    }

    private async listIndices(): Promise<OperationResult> {
        const indices = Array.from(this.searchEngines.keys()).map(name => {
            const engine = this.searchEngines.get(name)!;
            return {
                indexName: name,
                totalDocs: engine.totalDocs,
                numTerms: engine.invertedIndex.getAllTokens().length,
                facetFields: engine.facetFields
            };
        });
        return OperationResult.success({ indices });
    }
}

// Worker Thread Code
if (!isMainThread) {
    // Worker thread code
    const { workerId, workerType }: WorkerData = workerData;

    console.log(`Worker ${workerId} started`);

    // Store for search engines in this worker
    const searchEngines = new Map<string, SearchEngine>();
    const operationHandler = new SearchOperationHandler(searchEngines);

    // Listen for messages from the main thread
    parentPort?.on('message', async (message: WorkerMessage) => {
        const { operation, responseId } = message;

        try {
            const result = await operationHandler.handleOperation(operation);

            // Send response back to main thread
            parentPort?.postMessage({
                responseId,
                result: result.success ? { success: true, ...result.data } : { success: false, error: result.error }
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`❌ Worker ${workerId}: Unhandled error:`, errorMessage);
            parentPort?.postMessage({
                responseId,
                result: { success: false, error: errorMessage }
            });
        }
    });

    // Handle shutdown
    parentPort?.on('close', async () => {
        // Shutdown all search engines
        for (const [indexName, engine] of searchEngines.entries()) {
            try {
                await engine.shutdown();
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                console.error(`❌ Worker ${workerId}: Error shutting down ${indexName}:`, errorMessage);
            }
        }

        process.exit(0);
    });

    // Signal that worker is ready
    parentPort?.postMessage({ type: 'WORKER_READY', workerId });
}

// Main SearchWorker Class
export default class SearchWorker {
    public readonly workerId: string;
    public readonly workerType: WorkerType;
    public isAvailable: boolean = false;
    public currentTask: SearchOperation | null = null;
    public taskCount: number = 0;

    private readonly worker: Worker;
    private readonly responseHandlers: Map<number, (result: any) => void> = new Map();
    private nextResponseId: number = 0;

    constructor(workerId: string, workerType: WorkerType = 'mixed') {
        this.workerId = workerId;
        this.workerType = workerType;

        this.worker = new Worker(new URL(import.meta.url), {
            workerData: { workerId, workerType }
        });

        this.worker.on('message', (message: WorkerResponseMessage | WorkerReadyMessage) => {
            if ('type' in message && message.type === 'WORKER_READY') {
                this.isAvailable = true;
                console.log(`Worker ${workerId} is ready`);
            } else if ('responseId' in message && message.responseId !== undefined) {
                // Handle operation response
                const handler = this.responseHandlers.get(message.responseId);
                if (handler) {
                    handler(message.result);
                    this.responseHandlers.delete(message.responseId);
                    this.currentTask = null;
                    this.isAvailable = true;
                }
            }
        });

        this.worker.on('error', (error) => {
            console.error(`❌ Worker ${workerId} error:`, error);
        });

        this.worker.on('exit', (code) => {
            console.log(`Worker ${workerId} exited with code ${code}`);
        });
    }

    async executeOperation(operation: SearchOperation): Promise<any> {
        return new Promise((resolve, reject) => {
            if (!this.isAvailable) {
                reject(new Error(`Worker ${this.workerId} is not available`));
                return;
            }

            const responseId = this.nextResponseId++;
            this.currentTask = operation;
            this.isAvailable = false;
            this.taskCount++;

            // Set timeout for operation
            const timeout = setTimeout(() => {
                this.responseHandlers.delete(responseId);
                this.currentTask = null;
                this.isAvailable = true;
                reject(new Error(`Worker ${this.workerId} operation timeout`));
            }, 30000); // 30 second timeout

            // Set response handler with timeout clearing
            this.responseHandlers.set(responseId, (result) => {
                clearTimeout(timeout);
                resolve(result);
            });

            this.worker.postMessage({ operation, responseId });
        });
    }

    async terminate(): Promise<number> {
        return await this.worker.terminate();
    }

    getStats(): WorkerStats {
        return {
            workerId: this.workerId,
            workerType: this.workerType,
            isAvailable: this.isAvailable,
            taskCount: this.taskCount,
            currentTask: this.currentTask?.type || null
        };
    }
}

// Type Definitions
export type WorkerType = 'read' | 'write' | 'mixed';

export type OperationType =
    | 'INIT_ENGINE'
    | 'INIT_FROM_RESTORED'
    | 'SEARCH'
    | 'ADD_DOCUMENTS'
    | 'DELETE_DOCUMENT'
    | 'GET_FACETS'
    | 'GET_STATS'
    | 'FLUSH'
    | 'DELETE_INDEX'
    | 'LIST_INDICES';

export interface WorkerData {
    workerId: string;
    workerType: WorkerType;
}

export interface SearchOperation {
    type: OperationType;
    indexName: string;
    data: any;
    taskId?: string;
}

export interface WorkerMessage {
    operation: SearchOperation;
    responseId: number;
}

export interface WorkerResponseMessage {
    responseId: number;
    result: any;
}

export interface WorkerReadyMessage {
    type: 'WORKER_READY';
    workerId: string;
}

export interface RestoredData {
    config: {
        baseDir: string;
        enableShardedStorage: boolean;
        numShards?: number;
        facetFields?: string[];
    };
    snapshot: any;
}

export interface SearchData {
    query: any;
    context: any;
}

export interface AddDocumentsData {
    documents: Array<{ id: string;[key: string]: any }>;
}

export interface DeleteDocumentData {
    docId: string;
}

export interface WorkerStats {
    workerId: string;
    workerType: WorkerType;
    isAvailable: boolean;
    taskCount: number;
    currentTask: string | null;
}