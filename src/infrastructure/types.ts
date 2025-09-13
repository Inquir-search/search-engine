export interface WorkerData {
    workerId: string;
    sharedBuffer: SharedArrayBuffer;
}

export interface BaseMessage {
    type: string;
    workerId?: string;
}

export interface InitMessage extends BaseMessage {
    type: 'INIT';
    workerId: string;
}

export interface ExecuteTaskMessage extends BaseMessage {
    type: 'EXECUTE_TASK';
    taskId: number;
    operation: WorkerOperation;
}

export interface HealthCheckMessage extends BaseMessage {
    type: 'HEALTH_CHECK';
}

export interface ShutdownMessage extends BaseMessage {
    type: 'SHUTDOWN';
}

export type IncomingMessage = InitMessage | ExecuteTaskMessage | HealthCheckMessage | ShutdownMessage;

export interface BaseResponse {
    type: string;
    workerId?: string;
}

export interface ReadyResponse extends BaseResponse {
    type: 'READY';
    workerId: string;
}

export interface TaskCompleteResponse extends BaseResponse {
    type: 'TASK_COMPLETE';
    taskId: number;
    result: any;
}

export interface TaskErrorResponse extends BaseResponse {
    type: 'TASK_ERROR';
    taskId: number;
    error: string;
}

export interface HealthCheckResponse extends BaseResponse {
    type: 'HEALTH_CHECK';
    workerId: string;
    status: 'healthy' | 'unhealthy';
    currentTask: number | null;
    memoryUsage?: NodeJS.MemoryUsage;
    timestamp?: number;
}

export type OutgoingMessage = ReadyResponse | TaskCompleteResponse | TaskErrorResponse | HealthCheckResponse;

export interface BaseOperation {
    type: string;
    indexName?: string;
}

export interface AddDocumentsOperation extends BaseOperation {
    type: 'ADD_DOCUMENTS';
    indexName: string;
    documents?: any[];
    data?: { documents: any[] };
}

export interface DeleteDocumentOperation extends BaseOperation {
    type: 'DELETE_DOCUMENT';
    indexName: string;
    docId: string;
}

export interface ProcessTokensOperation extends BaseOperation {
    type: 'PROCESS_TOKENS';
    tokens: string[];
    document: any;
}

export interface CalculateScoresOperation extends BaseOperation {
    type: 'CALCULATE_SCORES';
    documents: any[];
    query: string;
}

export interface SearchOperation extends BaseOperation {
    type: 'SEARCH';
    indexName: string;
    data: {
        query: string;
        context: any;
    };
}

export interface BatchProcessOperation extends BaseOperation {
    type: 'BATCH_PROCESS';
    batch: BatchItem[];
}

export interface FlushOperation extends BaseOperation {
    type: 'FLUSH';
    indexName: string;
}

export interface InitFromRestoredOperation extends BaseOperation {
    type: 'INIT_FROM_RESTORED';
    indexName: string;
    data: {
        restoredData: any;
        facetFields: string[];
    };
}

export interface InitEngineOperation extends BaseOperation {
    type: 'INIT_ENGINE';
    indexName: string;
    data: {
        config: {
            indexName: string;
            enableShardedStorage: boolean;
            numShards: number;
            facetFields: string[];
        };
    };
}

export interface SyncOperationsOperation {
    type: 'SYNC_OPERATIONS';
    data: any;
}

export type WorkerOperation =
    | AddDocumentsOperation
    | DeleteDocumentOperation
    | ProcessTokensOperation
    | CalculateScoresOperation
    | SearchOperation
    | BatchProcessOperation
    | FlushOperation
    | InitFromRestoredOperation
    | InitEngineOperation
    | SyncOperationsOperation;

// Batch processing types
export interface BatchItem {
    id: string;
    type: 'tokenize' | 'score' | 'index';
    tokens?: string[];
    document?: any;
    query?: string;
    indexName?: string;
}

// Result types
export interface AddDocumentsResult {
    success: boolean;
    addedCount: number;
    totalDocs: number;
    results: Array<{ id: string; docId: string }>;
    indexName: string;
}

export interface DeleteDocumentResult {
    deletedId: string;
    totalDocs: number;
    indexName: string;
}

export interface ProcessTokensResult {
    tokens: ProcessedToken[];
    documentId: string;
    processing: {
        tokenCount: number;
        uniqueTokens: number;
    };
}

export interface ProcessedToken {
    original: string;
    normalized: string;
    stemmed: string;
    position: number;
    frequency: number;
}

export interface CalculateScoresResult {
    scores: DocumentScore[];
    query: string;
    totalProcessed: number;
}

export interface DocumentScore {
    documentId: string;
    score: ScoreDetails;
    matches: ScoreDetails['matches'];
}

export interface ScoreDetails {
    total: number;
    matches: Array<{
        token: string;
        matches: number;
        score: number;
    }>;
    relevance: number;
}

export interface BatchProcessResult {
    results: Array<{
        success: boolean;
        item: string;
        result?: any;
        error?: string;
    }>;
    totalProcessed: number;
    successful: number;
    failed: number;
}

export interface FlushResult {
    success: boolean;
    indexName: string;
    message: string;
}

export interface SharedMemoryWorkerPoolConfiguration {
    workerThreads?: number;
    sharedMemorySize?: number;
    maxDocuments?: number;
    maxTerms?: number;
    taskTimeout?: number;
    healthCheckInterval?: number;
    enablePersistence?: boolean;
    persistenceConfig?: any;
}

export interface WorkerThread {
    workerId: string;
    isAvailable: boolean;
    currentTask: string | null;
    worker: any;
}

export interface TaskDefinition {
    id: number;
    operation: WorkerOperation;
    resolve: (result: any) => void;
    reject: (error: Error) => void;
    startTime: number;
}

export type OperationType =
    | 'EXECUTE_TASK'
    | 'ADD_DOCUMENTS'
    | 'DELETE_DOCUMENT'
    | 'INIT'
    | 'HEALTH_CHECK'
    | 'FLUSH';

export interface PoolStatistics {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    avgResponseTime: number;
    activeWorkers: number;
    queuedTasks: number;
    memoryUsage: number;
}

export interface SearchContext {
    from?: number;
    size?: number;
    aggregations?: Record<string, any>;
    aggs?: Record<string, any>;
}

export interface AggregationConfiguration {
    [key: string]: {
        terms?: { field: string; size?: number };
        range?: { field: string; ranges: Array<{ from?: number; to?: number }> };
    };
}

export interface FieldCounts {
    [key: string]: number;
}

export interface Aggregations {
    [key: string]: {
        buckets: Array<{
            key: string;
            doc_count: number;
            from?: number;
            to?: number;
        }>;
    };
}

export interface Facets {
    [field: string]: FieldCounts;
}

export interface SearchResult {
    success: boolean;
    results?: any[];
    hits?: any[];
    total?: number;
    from?: number;
    size?: number;
    aggregations?: Aggregations;
    facets?: Facets;
    error?: string;
}

export interface AddDocumentsResultExtended {
    success: boolean;
    addedCount?: number;
    duplicateCount?: number;
    totalDocs?: number;
    message?: string;
    persistedWorkers?: number;
    totalWorkers?: number;
    error?: string;
}

export interface WorkerMessage {
    type: 'READY' | 'TASK_COMPLETE' | 'TASK_ERROR' | 'HEALTH_CHECK';
    taskId?: number;
    result?: any;
    error?: string;
    workerId?: string;
    status?: string;
    currentTask?: string | null;
    memoryUsage?: NodeJS.MemoryUsage;
    timestamp?: number;
}

export interface PersistenceConfiguration {
    baseDir?: string;
    documentsFile?: string;
    indexFile?: string;
    metadataFile?: string;
    globalMetadataFile?: string;
    mappingsFile?: string;
    batchSize?: number;
    compression?: boolean;
    enableShardedStorage?: boolean;
    maxParallelShards?: number;
    indexName?: string;
    indexShardingConfig?: IndexShardingConfig;
}

export interface IndexShardingConfig {
    enableShardedStorage: boolean;
    numShards: number;
    facetFields: string[];
    shardingStrategy?: 'hash' | 'range' | 'custom';
}

export interface ShardFiles {
    documents: string;
    index: string;
    docLengths: string;
    metadata: string;
}

export interface ShardMetadata {
    shardIndex: number;
    documentCount: number;
    indexCount: number;
    lastUpdate: string;
}

export interface GlobalMetadata {
    totalDocs: number;
    avgDocLength: number;
    lastFlush: string | null;
    documentCount: number;
    indexCount: number;
    indexName?: string;
    shardingConfig?: IndexShardingConfig;
    shardMetadata: Record<string, ShardMetadata>;
    facetEngine?: any;
    isSharded?: boolean;
    numShards?: number;
    enableShardedStorage?: boolean;
    facetFields?: string[];
}

export interface IndexDiscoveryResult {
    indexName: string;
    baseDir: string;
    metadata: GlobalMetadata;
    enableShardedStorage: boolean;
    numShards: number;
    facetFields: string[];
}

export interface RestoredIndexInfo {
    persistence: any;
    config: IndexDiscoveryResult;
    snapshot: PersistenceSnapshot | null;
}

export interface PersistenceSnapshot {
    documents: Map<string, any>;
    invertedIndex: { index: Map<string, any> };
    docLengths: Map<string, number>;
    totalDocs: number;
    avgDocLength: number;
    mappings?: any;
    facetEngine?: any;
    shards?: any[];
    metadata?: GlobalMetadata;
}

export interface ShardedStateInput {
    shards: any[][];
    documents: any[][];
    docLengths: any[][];
    metadata: GlobalMetadata;
    mappings?: any;
    facetFields?: string[];
    facetEngine?: any;
}

export interface ShardIncrementalUpdates {
    newDocuments?: any[];
    newIndexTerms?: any[];
    newDocLengths?: any[];
}

export interface PersistenceStats {
    baseDir: string;
    metadata: GlobalMetadata;
    fileSizes: Record<string, number>;
}