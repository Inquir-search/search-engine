import { cpus } from 'os';
import SearchWorker from './SearchWorker';
import EventEmitter from 'events';
import { getConfigManager } from './ConfigManager';
import { getErrorMessage, createErrorResult, logError } from '../lib/utils/ErrorUtils';
import { logOperationStart, logOperationComplete, logOperationFailed, logWorkerTask } from '../lib/utils/LoggingUtils';

// Domain value objects and types
export interface WorkerPoolConfiguration {
    totalWorkers?: number;
    minWriteWorkers?: number;
    maxWriteWorkers?: number;
    readPriority?: number;
    queueTimeout?: number;
    workerTimeout?: number;
    historySize?: number;
    healthCheckInterval?: number;
    performanceInterval?: number;
    alertThresholds?: AlertThresholds;
}

export interface AlertThresholds {
    maxQueueSize?: number;
    maxResponseTime?: number;
    maxErrorRate?: number;
}

export interface WorkerPoolStatistics {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    readTasks: number;
    writeTasks: number;
    avgResponseTime: number;
    queuedReads: number;
    queuedWrites: number;
}

export interface TaskDefinition {
    id: string;
    operation: WorkerOperation;
    priority: TaskPriority;
    createdAt: number;
    resolve: (result: any) => void;
    reject: (error: Error) => void;
}

export interface WorkerOperation {
    type: OperationType;
    indexName?: string;
    data?: any;
}

export type OperationType =
    | 'SEARCH'
    | 'ADD_DOCUMENTS'
    | 'DELETE_DOCUMENT'
    | 'GET_FACETS'
    | 'GET_STATS'
    | 'LIST_INDICES'
    | 'INIT_ENGINE'
    | 'INIT_FROM_RESTORED'
    | 'DELETE_INDEX'
    | 'FLUSH';

export type TaskPriority = 'low' | 'normal' | 'high';

export interface SearchContext {
    from?: number;
    size?: number;
    useOr?: boolean;
    facets?: string[];
}

export interface EngineInitializationConfig {
    indexName: string;
    mappings?: Record<string, any>;
    stopwords?: string[];
    facetFields?: string[];
    autoSave?: boolean;
}

export interface WorkerStats {
    id: string;
    isAvailable: boolean;
    currentLoad: number;
    totalTasks: number;
    avgResponseTime: number;
}

export interface PoolStats extends WorkerPoolStatistics {
    config: WorkerPoolConfiguration;
    workers: WorkerStats[];
    queues: {
        readQueue: number;
        writeQueue: number;
        pendingTasks: number;
    };
}

// Domain events
export interface TaskSubmittedEvent {
    taskId: string;
    operationType: OperationType;
    timestamp: number;
}

export interface TaskCompletedEvent {
    taskId: string;
    operationType: OperationType;
    responseTime: number;
    timestamp: number;
}

export interface TaskFailedEvent {
    taskId: string;
    operationType: OperationType;
    error: string;
    timestamp: number;
}

// Main WorkerPool domain service
export default class WorkerPool extends EventEmitter {
    private readonly config: WorkerPoolConfiguration;

    // Worker pools organized by specialization
    private readonly readWorkers: SearchWorker[] = [];
    private readonly writeWorkers: SearchWorker[] = [];
    private readonly mixedWorkers: SearchWorker[] = [];
    private readonly allWorkers: SearchWorker[] = [];

    // Task queues with proper typing
    private readonly readQueue: TaskDefinition[] = [];
    private readonly writeQueue: TaskDefinition[] = [];
    private readonly pendingTasks: Map<string, TaskDefinition> = new Map();

    // Load balancing and performance tracking
    private lastWorkerIndex: number = 0;
    private readonly workerLoads: Map<string, number> = new Map();
    private readonly stats: WorkerPoolStatistics;

    constructor(options: WorkerPoolConfiguration = {}) {
        super();

        // Get configuration from ConfigManager
        const configManager = getConfigManager();
        const workerPoolConfig = configManager.get('workerPool');

        // Allow options to override configuration
        this.config = {
            totalWorkers: options.totalWorkers ?? workerPoolConfig.totalWorkers,
            minWriteWorkers: options.minWriteWorkers ?? workerPoolConfig.minWriteWorkers,
            maxWriteWorkers: options.maxWriteWorkers ?? workerPoolConfig.maxWriteWorkers,
            readPriority: options.readPriority ?? workerPoolConfig.readPriority,
            queueTimeout: options.queueTimeout ?? workerPoolConfig.queueTimeout,
            workerTimeout: options.workerTimeout ?? workerPoolConfig.workerTimeout,
            historySize: options.historySize ?? workerPoolConfig.historySize,
            healthCheckInterval: options.healthCheckInterval ?? workerPoolConfig.healthCheckInterval,
            performanceInterval: options.performanceInterval ?? workerPoolConfig.performanceInterval,
            alertThresholds: options.alertThresholds ?? {
                maxQueueSize: workerPoolConfig.alertThresholds?.memoryUsage ? Math.round(workerPoolConfig.alertThresholds.memoryUsage * 1000) : 1000,
                maxResponseTime: workerPoolConfig.alertThresholds?.avgQueryTime || 5000,
                maxErrorRate: workerPoolConfig.alertThresholds?.errorRate || 0.1
            }
        };

        console.log(`WorkerPool initialized with ${this.config.totalWorkers} total workers`);

        // Initialize statistics
        this.stats = {
            totalTasks: 0,
            completedTasks: 0,
            failedTasks: 0,
            readTasks: 0,
            writeTasks: 0,
            avgResponseTime: 0,
            queuedReads: 0,
            queuedWrites: 0
        };

    }

    async initialize(): Promise<WorkerPool> {
        // Calculate worker distribution
        const writeWorkers = Math.max(
            this.config.minWriteWorkers!,
            Math.min(this.config.maxWriteWorkers!, Math.floor(this.config.totalWorkers! * 0.3))
        );
        const readWorkers = Math.max(1, this.config.totalWorkers! - writeWorkers);

        // Create workers
        const workerPromises: Promise<void>[] = [];

        // Create read-optimized workers
        for (let i = 0; i < readWorkers; i++) {
            const worker = new SearchWorker(`read-${i}`, 'read');
            this.readWorkers.push(worker);
            this.allWorkers.push(worker);
            this.workerLoads.set(worker.workerId, 0);
            workerPromises.push(this.waitForWorkerReady(worker));
        }

        // Create write-optimized workers
        for (let i = 0; i < writeWorkers; i++) {
            const worker = new SearchWorker(`write-${i}`, 'write');
            this.writeWorkers.push(worker);
            this.allWorkers.push(worker);
            this.workerLoads.set(worker.workerId, 0);
            workerPromises.push(this.waitForWorkerReady(worker));
        }

        // Wait for all workers to be ready
        await Promise.all(workerPromises);

        // Start task processor
        this.startTaskProcessor();

        // Start monitoring
        this.startMonitoring();

        return this;
    }

    private waitForWorkerReady(worker: SearchWorker): Promise<void> {
        return new Promise((resolve) => {
            if (worker.isAvailable) {
                resolve();
            } else {
                const checkReady = () => {
                    if (worker.isAvailable) {
                        resolve();
                    } else {
                        setTimeout(checkReady, 100);
                    }
                };
                checkReady();
            }
        });
    }

    private startTaskProcessor(): void {
        // Process tasks every 10ms
        const timer = setInterval(() => {
            this.processTasks();
        }, 10);
        // Allow Node.js process to exit even if timer is still pending
        if (typeof (timer as any).unref === 'function') {
            (timer as any).unref();
        }
    }

    private processTasks(): void {
        // Process read tasks with priority
        for (let i = 0; i < this.config.readPriority!; i++) {
            if (this.readQueue.length > 0) {
                this.processReadTask();
            }
        }

        // Process write tasks
        if (this.writeQueue.length > 0) {
            this.processWriteTask();
        }

        // Update queue statistics
        this.stats.queuedReads = this.readQueue.length;
        this.stats.queuedWrites = this.writeQueue.length;
    }

    private processReadTask(): void {
        if (this.readQueue.length === 0) return;

        const task = this.readQueue.shift()!;
        const worker = this.findBestWorker(task.operation.type, task.operation.indexName);

        if (worker) {
            this.stats.queuedReads = this.readQueue.length;
            this.executeTask(worker, task);
        } else {
            // Put task back in queue if no worker available
            this.readQueue.unshift(task);
        }
    }

    private processWriteTask(): void {
        if (this.writeQueue.length === 0) return;

        const task = this.writeQueue.shift()!;
        const worker = this.findBestWorker(task.operation.type, task.operation.indexName);

        if (worker) {
            this.stats.queuedWrites = this.writeQueue.length;
            this.executeTask(worker, task);
        } else {
            // Put task back in queue if no worker available
            this.writeQueue.unshift(task);
        }
    }

    private findBestWorker(operationType: OperationType, indexName?: string): SearchWorker | null {
        // First, get appropriate worker pools based on operation type
        let candidateWorkers: SearchWorker[] = [];

        if (this.isReadOperation(operationType)) {
            // Prefer read workers, fallback to mixed
            candidateWorkers = [
                ...this.readWorkers.filter(w => w.isAvailable),
                ...this.mixedWorkers.filter(w => w.isAvailable)
            ];
        } else {
            // Prefer write workers, fallback to mixed
            candidateWorkers = [
                ...this.writeWorkers.filter(w => w.isAvailable),
                ...this.mixedWorkers.filter(w => w.isAvailable)
            ];
        }

        if (candidateWorkers.length === 0) {
            return null;
        }

        // For index-specific operations, use consistent hashing for better caching
        if (indexName && ['ADD_DOCUMENTS', 'DELETE_DOCUMENT', 'SEARCH', 'GET_FACETS', 'GET_STATS', 'FLUSH'].includes(operationType)) {
            // Simple hash function based on index name
            const hash = indexName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
            const workerIndex = hash % candidateWorkers.length; // Use available workers, not all workers
            const targetWorker = candidateWorkers[workerIndex];

            // Return the target worker if it's available
            if (targetWorker && targetWorker.isAvailable) {
                return targetWorker;
            }
        }

        // Use round-robin with load balancing for general operations
        // Find worker with lowest load among candidates
        return candidateWorkers.reduce((best, current) => {
            const bestLoad = this.workerLoads.get(best.workerId) || 0;
            const currentLoad = this.workerLoads.get(current.workerId) || 0;

            // If loads are equal, prefer the one that comes next in round-robin order
            if (currentLoad === bestLoad) {
                const bestIndex = this.allWorkers.indexOf(best);
                const currentIndex = this.allWorkers.indexOf(current);
                return (currentIndex - this.lastWorkerIndex) > (bestIndex - this.lastWorkerIndex) ? current : best;
            }

            return currentLoad < bestLoad ? current : best;
        });
    }

    private async executeTask(worker: SearchWorker, task: TaskDefinition): Promise<void> {
        const startTime = Date.now();

        try {
            // Update worker load
            this.workerLoads.set(worker.workerId, this.workerLoads.get(worker.workerId)! + 1);

            // Execute operation
            const result = await worker.executeOperation(task.operation as any);

            // Calculate response time
            const responseTime = Date.now() - startTime;
            this.updateResponseTime(responseTime);

            // Update statistics
            this.stats.completedTasks++;
            if (this.isReadOperation(task.operation.type)) {
                this.stats.readTasks++;
            } else {
                this.stats.writeTasks++;
            }

            // Emit completion event
            this.emit('taskCompleted', {
                taskId: task.id,
                operationType: task.operation.type,
                responseTime,
                timestamp: Date.now()
            } as TaskCompletedEvent);

            // Resolve the task
            task.resolve(result);

        } catch (error) {
            logError(`Task execution error on worker ${worker.workerId}`, error);
            this.stats.failedTasks++;

            // Emit failure event
            this.emit('taskFailed', {
                taskId: task.id,
                operationType: task.operation.type,
                error: getErrorMessage(error),
                timestamp: Date.now()
            } as TaskFailedEvent);

            task.reject(error instanceof Error ? error : new Error(getErrorMessage(error)));
        } finally {
            // Update worker load
            this.workerLoads.set(worker.workerId, Math.max(0, this.workerLoads.get(worker.workerId)! - 1));

            // Remove from pending tasks
            this.pendingTasks.delete(task.id);
        }
    }

    private isReadOperation(operationType: OperationType): boolean {
        return ['SEARCH', 'GET_FACETS', 'GET_STATS', 'LIST_INDICES'].includes(operationType);
    }

    private updateResponseTime(responseTime: number): void {
        const totalResponseTime = this.stats.avgResponseTime * this.stats.completedTasks;
        this.stats.avgResponseTime = (totalResponseTime + responseTime) / (this.stats.completedTasks + 1);
    }

    async submitTask(operation: WorkerOperation, priority: TaskPriority = 'normal'): Promise<any> {
        return new Promise((resolve, reject) => {
            const task: TaskDefinition = {
                id: `task-${Date.now()}-${Math.random()}`,
                operation,
                priority,
                createdAt: Date.now(),
                resolve,
                reject
            };

            // Add timeout
            const timeout = setTimeout(() => {
                this.pendingTasks.delete(task.id);
                reject(new Error('Task timeout'));
            }, this.config.queueTimeout);

            // Clear timeout when task completes
            const originalResolve = task.resolve;
            const originalReject = task.reject;

            task.resolve = (result) => {
                clearTimeout(timeout);
                originalResolve(result);
            };

            task.reject = (error) => {
                clearTimeout(timeout);
                originalReject(error);
            };

            // Add to appropriate queue
            if (this.isReadOperation(operation.type)) {
                this.readQueue.push(task);
            } else {
                this.writeQueue.push(task);
            }

            // Track task
            this.pendingTasks.set(task.id, task);
            this.stats.totalTasks++;

            // Emit event
            this.emit('taskSubmitted', {
                taskId: task.id,
                operationType: operation.type,
                timestamp: Date.now()
            } as TaskSubmittedEvent);
        });
    }

    // Helper methods for common operations
    async search(indexName: string, query: any, context: SearchContext): Promise<any> {
        return this.submitTask({
            type: 'SEARCH',
            indexName,
            data: { query, context }
        });
    }

    async addDocuments(indexName: string, documents: any[]): Promise<any> {
        // Broadcast the add operation to ALL workers for synchronization
        try {
            const results = await Promise.all(
                this.allWorkers.map(worker => {
                    return worker.executeOperation({
                        type: 'ADD_DOCUMENTS',
                        indexName,
                        data: { documents }
                    }).catch(error => {
                        return createErrorResult(error, 'addDocuments');
                    });
                })
            );

            // Check if majority of workers succeeded
            const successful = results.filter(r => r.success);
            if (successful.length >= Math.ceil(this.allWorkers.length / 2)) {
                const firstSuccess = successful[0];
                return {
                    success: true,
                    addedCount: firstSuccess.addedCount,
                    totalDocs: firstSuccess.totalDocs,
                    synchronizedWorkers: successful.length,
                    totalWorkers: this.allWorkers.length
                };
            } else {
                return {
                    success: false,
                    error: `Failed to synchronize documents across workers. Only ${successful.length}/${this.allWorkers.length} workers succeeded.`
                };
            }
        } catch (error) {
            logError('Error broadcasting document addition', error);
            return createErrorResult(error, 'broadcastDocumentAddition');
        }
    }

    async deleteDocument(indexName: string, docId: string): Promise<any> {
        // Broadcast the delete operation to ALL workers for synchronization
        try {
            const results = await Promise.all(
                this.allWorkers.map(worker => {
                    return worker.executeOperation({
                        type: 'DELETE_DOCUMENT',
                        indexName,
                        data: { docId }
                    }).catch(error => {
                        return createErrorResult(error, 'addDocuments');
                    });
                })
            );

            // Check if majority of workers succeeded
            const successful = results.filter(r => r.success);
            if (successful.length >= Math.ceil(this.allWorkers.length / 2)) {
                const firstSuccess = successful[0];
                return {
                    success: true,
                    deletedId: firstSuccess.deletedId,
                    totalDocs: firstSuccess.totalDocs,
                    synchronizedWorkers: successful.length,
                    totalWorkers: this.allWorkers.length
                };
            } else {
                return {
                    success: false,
                    error: `Failed to synchronize document deletion across workers. Only ${successful.length}/${this.allWorkers.length} workers succeeded.`
                };
            }
        } catch (error) {
            logError('Error broadcasting document deletion', error);
            return createErrorResult(error, 'broadcastDocumentDeletion');
        }
    }

    async getFacets(indexName: string): Promise<any> {
        return this.submitTask({
            type: 'GET_FACETS',
            indexName
        });
    }

    async getIndexStats(indexName: string): Promise<any> {
        return this.submitTask({
            type: 'GET_STATS',
            indexName
        });
    }

    async flush(indexName: string): Promise<any> {
        return this.submitTask({
            type: 'FLUSH',
            indexName
        });
    }

    async initializeEngine(config: EngineInitializationConfig): Promise<any> {
        try {
            // Initialize the engine on all workers, not just one
            const results = await Promise.all(
                this.allWorkers.map(worker => {
                    return worker.executeOperation({
                        type: 'INIT_ENGINE',
                        data: config,
                        indexName: 'default'
                    } as any).catch(error => {
                        return createErrorResult(error, 'addDocuments');
                    });
                })
            );

            // Check if at least one worker succeeded
            const successful = results.filter(r => r.success);
            if (successful.length > 0) {
                return {
                    success: true,
                    indexName: config.indexName,
                    initializedWorkers: successful.length,
                    totalWorkers: this.allWorkers.length
                };
            } else {
                return {
                    success: false,
                    error: 'Failed to initialize engine on any worker'
                };
            }
        } catch (error) {
            logError('Error initializing engine across workers', error);
            return createErrorResult(error, 'initializeEngine');
        }
    }

    async initializeFromRestored(indexName: string, restoredData: any, facetFields: string[]): Promise<any> {
        return this.submitTask({
            type: 'INIT_FROM_RESTORED',
            indexName,
            data: { restoredData, facetFields }
        });
    }

    async deleteIndex(indexName: string): Promise<any> {
        return this.submitTask({
            type: 'DELETE_INDEX',
            indexName
        });
    }

    async listIndices(): Promise<any> {
        try {
            // Collect results from all workers
            const workerResults = await Promise.all(
                this.allWorkers.map(worker => {
                    return worker.executeOperation({
                        type: 'LIST_INDICES',
                        indexName: 'default',
                        data: {}
                    } as any).catch(error => {
                        return createErrorResult(error, 'addDocuments');
                    });
                })
            );

            // Aggregate successful results
            const allIndices: any[] = [];
            for (const result of workerResults) {
                if (result.success && result.indices) {
                    allIndices.push(...result.indices);
                }
            }

            // Remove duplicates based on indexName
            const uniqueIndices = allIndices.filter((index, i, arr) =>
                arr.findIndex(idx => idx.indexName === index.indexName) === i
            );

            return {
                success: true,
                indices: uniqueIndices,
                totalWorkers: this.allWorkers.length,
                respondedWorkers: workerResults.filter(r => r.success).length
            };
        } catch (error) {
            logError('Error listing indices across workers', error);
            return createErrorResult(error, 'listIndices');
        }
    }

    private startMonitoring(): void {
        // Log statistics every 30 seconds
        const timer = setInterval(() => {
            this.logStats();
        }, 30000);
        if (typeof (timer as any).unref === 'function') {
            (timer as any).unref();
        }
    }

    private logStats(): void {
        console.log(`Pool stats: ${this.stats.totalTasks} tasks, ${this.allWorkers.length} active workers`);
        console.log(`Worker loads: ${Array.from(this.workerLoads.entries()).map(([id, load]) => `${id}:${load}`).join(', ')}`);
    }

    getStats(): PoolStats {
        return {
            ...this.stats,
            config: this.config,
            workers: this.allWorkers.map(w => ({
                id: w.workerId,
                currentLoad: 0,
                totalTasks: 0,
                avgResponseTime: 0,
                ...w.getStats()
            })),
            queues: {
                readQueue: this.readQueue.length,
                writeQueue: this.writeQueue.length,
                pendingTasks: this.pendingTasks.size
            }
        };
    }

    async shutdown(): Promise<void> {
        // Stop accepting new tasks
        this.readQueue.length = 0;
        this.writeQueue.length = 0;

        // Wait for pending tasks to complete (with timeout)
        const shutdownTimeout = setTimeout(() => {
        }, 10000);

        while (this.pendingTasks.size > 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        clearTimeout(shutdownTimeout);

        // Terminate all workers
        await Promise.all(this.allWorkers.map(worker => worker.terminate()));

    }
}