import { parentPort, workerData } from 'worker_threads';
import SharedMemoryStore from './SharedMemoryStore';
import SearchEngine from '../domain/SearchEngine.js';
import { Stemmer } from '../lib/Stemmer.js';
import {
    WorkerData,
    IncomingMessage,
    OutgoingMessage,
    WorkerOperation,
    AddDocumentsResult,
    DeleteDocumentResult,
    ProcessTokensResult,
    CalculateScoresResult,
    FlushResult,
    BatchProcessResult,
    BatchItem,
    ScoreDetails,
    ProcessedToken,
    DocumentScore
} from './types';

// Worker class implementation
class SharedMemoryWorkerService {
    private readonly workerId: string;
    private sharedMemoryStore: SharedMemoryStore;
    private readonly searchEngines: Map<string, any> = new Map(); // Store SearchEngine instances
    private readonly stemmer: Stemmer;
    private isInitialized: boolean = false;
    private currentTask: number | null = null;

    constructor(workerData: { workerId: string }) {
        this.workerId = workerData.workerId;

        // Create SharedMemoryStore instance
        this.sharedMemoryStore = new SharedMemoryStore({
            indexName: 'default'
        });

        // Initialize stemmer with language detection and caching
        this.stemmer = new Stemmer({
            enabled: true,
            autoDetectLanguage: true,
            defaultLanguage: 'en',
            cacheSize: 10000
        });

    }

    async initialize(): Promise<void> {
        try {
            this.isInitialized = true;

            // Notify parent that worker is ready
            this.sendMessage({
                type: 'READY',
                workerId: this.workerId
            });

        } catch (error) {
            console.error(`❌ SharedMemoryWorker ${this.workerId} initialization failed:`, error);
            process.exit(1);
        }
    }

    async handleTask(taskId: number, operation: WorkerOperation): Promise<any> {
        this.currentTask = taskId;

        try {
            // Additional validation - operation should already be validated, but double-check
            if (!operation || !operation.type) {
                throw new Error(`Invalid operation: missing type. Operation: ${JSON.stringify(operation)}`);
            }

            switch (operation.type) {
                case 'INIT_ENGINE':
                    const initEngineOp = operation as any;
                    if (!initEngineOp.indexName) {
                        throw new Error('INIT_ENGINE operation missing indexName');
                    }

                    // Initialize SearchEngine for the specific index
                    const config = initEngineOp.data?.config || {};
                    const searchEngine = new SearchEngine({
                        indexName: initEngineOp.indexName,
                        enableShardedStorage: config.enableShardedStorage || false,
                        numShards: config.numShards || 4,
                        facetFields: config.facetFields || []
                    });

                    this.searchEngines.set(initEngineOp.indexName, searchEngine);

                    return {
                        success: true,
                        indexName: initEngineOp.indexName,
                        message: `SearchEngine initialized for index '${initEngineOp.indexName}'`
                    };

                case 'ADD_DOCUMENTS':
                    if (!operation.indexName) {
                        throw new Error('ADD_DOCUMENTS operation missing indexName');
                    }
                    const addDocsOp = operation as any;
                    const documentsArray = addDocsOp.documents || addDocsOp.data?.documents;
                    const indexMetadata = addDocsOp.data?.indexMetadata;
                    return await this.handleAddDocuments(operation.indexName, documentsArray || [], indexMetadata);

                case 'DELETE_DOCUMENT':
                    if (!operation.indexName || !operation.docId) {
                        throw new Error('DELETE_DOCUMENT operation missing indexName or docId');
                    }
                    return await this.handleDeleteDocument(operation.indexName, operation.docId);

                case 'PROCESS_TOKENS':
                    if (!operation.tokens || !operation.document) {
                        throw new Error('PROCESS_TOKENS operation missing tokens or document');
                    }
                    return await this.handleProcessTokens(operation.tokens, operation.document);

                case 'CALCULATE_SCORES':
                    if (!operation.documents || !operation.query) {
                        throw new Error('CALCULATE_SCORES operation missing documents or query');
                    }
                    return await this.handleCalculateScores(operation.documents, operation.query);

                case 'SEARCH':
                    const searchOp = operation as any;
                    if (!searchOp.indexName || !searchOp.data || !searchOp.data.query) {
                        throw new Error('SEARCH operation missing indexName, data, or query');
                    }
                    return await this.handleSearch(searchOp.indexName, searchOp.data.query, searchOp.data.context);

                case 'BATCH_PROCESS':
                    if (!operation.batch) {
                        throw new Error('BATCH_PROCESS operation missing batch data');
                    }
                    return await this.handleBatchProcess(operation.batch);

                case 'FLUSH':
                    if (!operation.indexName) {
                        throw new Error('FLUSH operation missing indexName');
                    }
                    return await this.handleFlush(operation.indexName);

                case 'INIT_FROM_RESTORED':
                    if (!operation.indexName || !operation.data) {
                        throw new Error('INIT_FROM_RESTORED operation missing indexName or data');
                    }
                    return await this.handleInitFromRestored(operation.indexName, operation.data);

                case 'SYNC_OPERATIONS':
                    if (!operation.data) {
                        throw new Error('SYNC_OPERATIONS operation missing data');
                    }
                    return await this.handleSyncOperations(operation.data);

                default:
                    throw new Error(`Unknown task type: ${(operation as any).type}. Available types: INIT_ENGINE, ADD_DOCUMENTS, DELETE_DOCUMENT, PROCESS_TOKENS, CALCULATE_SCORES, SEARCH, BATCH_PROCESS, FLUSH, INIT_FROM_RESTORED, SYNC_OPERATIONS`);
            }
        } catch (error) {
            console.error(`❌ SharedMemoryWorker ${this.workerId} task ${taskId} failed:`, error);
            console.error(`❌ Operation details:`, JSON.stringify(operation, null, 2));
            throw error;
        } finally {
            this.currentTask = null;
        }
    }


    private async handleAddDocuments(indexName: string, documents: any[], indexMetadata?: any): Promise<AddDocumentsResult> {
        if (!documents || !Array.isArray(documents)) {
            throw new Error('Invalid documents array');
        }

        let addedCount = 0;
        const results: Array<{ id: string; docId: string }> = [];

        // If sharding is enabled and we have a SearchEngine instance, use it instead of SharedMemoryStore
        const enableShardedStorage = indexMetadata?.enableShardedStorage || false;
        const searchEngine = this.searchEngines.get(indexName);

        if (enableShardedStorage && searchEngine) {
            try {
                // Use SearchEngine.add() method for each document AND sync to SharedMemoryStore
                for (const doc of documents) {
                    if (!doc.id) {
                        continue;
                    }

                    // Tag document with indexName before adding to SearchEngine
                    const docWithIndex = { ...doc, indexName };
                    await searchEngine.add(docWithIndex);

                    // Also add to SharedMemoryStore for unified search across indices
                    try {
                        this.sharedMemoryStore.addDocument(docWithIndex);
                    } catch (syncError) {
                        console.warn(`❌ Worker ${this.workerId}: Failed to sync document ${doc.id} to SharedMemoryStore:`, (syncError as Error).message);
                    }

                    results.push({ id: doc.id, docId: doc.id });
                    addedCount++;
                }

                return {
                    success: true,
                    addedCount,
                    totalDocs: addedCount,
                    results,
                    indexName
                };
            } catch (error) {
                console.error(`❌ Worker ${this.workerId}: SearchEngine failed to add documents:`, error);
                throw error;
            }
        }

        for (const doc of documents) {
            if (!doc.id) {
                continue;
            }

            try {
                // Process document through shared memory store
                const docToAdd = {
                    ...doc,
                    indexName // Add index name to document metadata
                };

                const result = this.sharedMemoryStore.addDocument(docToAdd);

                // Check if document was actually added (not a duplicate)
                if (result && result.wasAdded) {
                    results.push({ id: doc.id, docId: result.docId.toString() });
                    addedCount++;
                } else if (result && !result.wasAdded) {
                    // Document already exists
                }
            } catch (error) {
                // Skip invalid documents
            }
        }

        const stats = this.sharedMemoryStore.getStats();
        return {
            success: true,
            addedCount,
            totalDocs: stats.totalDocs,
            results,
            indexName
        };
    }

    private async handleDeleteDocument(indexName: string, docId: string): Promise<DeleteDocumentResult> {
        if (!docId) {
            throw new Error('Document ID is required for deletion');
        }

        try {
            const success = await this.sharedMemoryStore.deleteDocument(docId);

            if (!success) {
                throw new Error(`Document ${docId} not found`);
            }

            const stats = this.sharedMemoryStore.getStats();

            return {
                deletedId: docId,
                totalDocs: stats.totalDocs,
                indexName
            };
        } catch (error) {
            console.error(`SharedMemoryWorker ${this.workerId}: Failed to delete document ${docId}:`, error);
            throw error;
        }
    }

    private async handleFlush(indexName: string): Promise<FlushResult> {
        try {
            // SharedMemoryStore uses SharedArrayBuffer which doesn't need flushing
            // All data is immediately available to all workers
            return {
                success: true,
                indexName,
                message: 'SharedMemoryStore flushed successfully'
            };
        } catch (error) {
            console.error(`SharedMemoryWorker ${this.workerId}: Failed to flush index ${indexName}:`, error);
            throw error;
        }
    }

    private async handleProcessTokens(tokens: string[], document: any): Promise<ProcessTokensResult> {
        // CPU-intensive token processing
        const processedTokens: ProcessedToken[] = [];

        for (const token of tokens) {
            // Perform stemming, normalization, etc.
            const processed: ProcessedToken = {
                original: token,
                normalized: token.toLowerCase(),
                stemmed: await this.stemToken(token),
                position: processedTokens.length,
                frequency: 1
            };

            processedTokens.push(processed);
        }

        return {
            tokens: processedTokens,
            documentId: document.id,
            processing: {
                tokenCount: processedTokens.length,
                uniqueTokens: new Set(processedTokens.map(t => t.normalized)).size
            }
        };
    }

    private async handleCalculateScores(documents: any[], query: string): Promise<CalculateScoresResult> {
        const scores: DocumentScore[] = [];
        const queryTokens = query.toLowerCase().split(/\s+/);

        for (const doc of documents) {
            const score = await this.calculateDocumentScore(doc, queryTokens);
            scores.push({
                documentId: doc.id,
                score,
                matches: score.matches
            });
        }

        // Sort by score descending
        scores.sort((a, b) => b.score.total - a.score.total);

        return {
            scores,
            query,
            totalProcessed: documents.length
        };
    }

    private async handleSearch(indexName: string, query: string, context: any = {}): Promise<any> {
        console.log(`🔍 Worker ${this.workerId}: Searching index '${indexName}' for query:`, query);
        try {
            // Check if we have a SearchEngine instance for this index (when sharding is enabled)
            const searchEngine = this.searchEngines.get(indexName);

            // Temporarily disable SearchEngine path to force SharedMemoryStore filtering
            if (false && searchEngine) {
                // Use SearchEngine for search when available (sharding enabled)
                const results = await searchEngine.search(query, {
                    from: context.from || 0,
                    size: context.size || 10,
                    aggregations: context.aggregations || context.aggs
                });

                return {
                    success: true,
                    hits: results.hits || [],
                    total: results.total || 0,
                    from: results.from || 0,
                    size: results.size || 10,
                    aggregations: results.aggregations || {},
                    facets: results.facets || {}
                };
            } else {
                // Fallback to SharedMemoryStore when SearchEngine is not available
                console.log(`🔍 Worker ${this.workerId}: Using SharedMemoryStore for index '${indexName}'`);
                const stats = this.sharedMemoryStore.getStats();
                console.log(`🔍 Worker ${this.workerId}: SharedMemoryStore stats:`, stats);

                // Check if index exists by looking for documents with this indexName
                const results = this.sharedMemoryStore.search(query, {
                    from: 0,
                    size: 10000, // Get all results to check if index exists
                    indexName
                });

                console.log(`🔍 Worker ${this.workerId}: Index '${indexName}' search results:`, {
                    total: results.total,
                    hitsCount: results.hits?.length
                });

                // Check if index exists by looking for any documents with this indexName
                // We need to do a separate check to see if the index exists at all
                const indexCheck = this.sharedMemoryStore.search('*', {
                    from: 0,
                    size: 1,
                    indexName
                });

                // Also check if we have in-memory docs for this index (fallback mechanism)
                const inMemoryMap: Map<string, any[]> = (this as any)['__inMemoryDocs'] || new Map();
                const inMemoryDocs = inMemoryMap.get(indexName) || [];

                // If no documents exist for this index at all, return error
                if (indexCheck.total === 0 && inMemoryDocs.length === 0) {
                    console.log(`🔍 Worker ${this.workerId}: Index '${indexName}' not found, returning error`);
                    return {
                        success: false,
                        error: `Index '${indexName}' not found`,
                        hits: [],
                        total: 0,
                        from: 0,
                        size: 10,
                        aggregations: {},
                        facets: {}
                    };
                }

                // Apply pagination to results
                const from = context.from || 0;
                const size = context.size || 10;
                const paginatedHits = results.hits?.slice(from, from + size) || [];

                console.log(`🔍 Worker ${this.workerId}: SharedMemoryStore search results:`, {
                    total: results.total,
                    hitsCount: paginatedHits.length
                });

                // Calculate aggregations if requested - use filtered results
                let calculatedAggregations = {};
                if (context.aggregations || context.aggs) {
                    calculatedAggregations = this.calculateAggregations(
                        context.aggregations || context.aggs,
                        results.hits || [], // results.hits are already filtered by indexName
                        indexName
                    );
                }

                return {
                    success: true,
                    hits: paginatedHits,
                    total: results.total,
                    from: from,
                    size: size,
                    aggregations: calculatedAggregations,
                    facets: {} // Facets are typically derived from aggregations in the UI
                };
            }

        } catch (error) {
            console.error(`❌ Worker ${this.workerId}: Search failed for index '${indexName}':`, error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Search failed',
                hits: [],
                total: 0,
                from: 0,
                size: 10,
                aggregations: {},
                facets: {}
            };
        }
    }

    private calculateAggregations(aggregationsConfig: any, documents: any[], indexName: string): any {
        const aggregations: any = {};

        // Calculate real aggregations based on the search results
        for (const [aggName, aggConfig] of Object.entries(aggregationsConfig)) {
            if (aggConfig && typeof aggConfig === 'object' && 'terms' in aggConfig && aggConfig.terms) {
                const termsConfig = aggConfig.terms as any;
                const field = termsConfig.field;
                const size = termsConfig.size || 10;

                // Count field values across all documents
                const fieldCounts: Map<string, number> = new Map();

                for (const doc of documents) {
                    let fieldValues: any[] = [];

                    if (doc[field]) {
                        if (Array.isArray(doc[field])) {
                            fieldValues = doc[field];
                        } else {
                            fieldValues = [doc[field]];
                        }
                    }

                    for (const value of fieldValues) {
                        if (value && value.toString().trim()) {
                            const key = value.toString();
                            fieldCounts.set(key, (fieldCounts.get(key) || 0) + 1);
                        }
                    }
                }

                // Sort by count descending and take top N
                const buckets = Array.from(fieldCounts.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, size)
                    .map(([key, count]) => ({
                        key: key,
                        doc_count: count
                    }));

                aggregations[aggName] = { buckets };

            } else if (aggConfig && typeof aggConfig === 'object' && 'range' in aggConfig && aggConfig.range) {
                // Handle range aggregations if needed
                const rangeConfig = aggConfig.range as any;
                const field = rangeConfig.field;
                const ranges = rangeConfig.ranges || [];

                const buckets = ranges.map((range: any) => {
                    let count = 0;
                    for (const doc of documents) {
                        const value = parseFloat(doc[field]);
                        if (!isNaN(value)) {
                            const inRange = (!range.from || value >= range.from) &&
                                (!range.to || value < range.to);
                            if (inRange) count++;
                        }
                    }
                    return {
                        key: `${range.from || '*'}-${range.to || '*'}`,
                        from: range.from,
                        to: range.to,
                        doc_count: count
                    };
                });

                aggregations[aggName] = { buckets };
            }
        }

        return aggregations;
    }

    private async handleBatchProcess(batch: BatchItem[]): Promise<BatchProcessResult> {
        const results: Array<{
            success: boolean;
            item: string;
            result?: any;
            error?: string;
        }> = [];

        for (const item of batch) {
            try {
                const result = await this.processBatchItem(item);
                results.push({ success: true, item: item.id, result });
            } catch (error) {
                results.push({ success: false, item: item.id, error: (error as Error).message });
            }
        }

        return {
            results,
            totalProcessed: batch.length,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length
        };
    }

    private async handleInitFromRestored(indexName: string, data: { restoredData: any; facetFields: string[] }): Promise<any> {
        try {
            const { restoredData, facetFields } = data;
            const { snapshot } = restoredData;

            if (!snapshot || !snapshot.documents) {
                return { success: true, message: `No documents to restore for index '${indexName}'` };
            }

            // Convert documents Map to array if needed
            let documents: any[] = [];
            if (snapshot.documents instanceof Map) {
                documents = Array.from(snapshot.documents.values());
            } else if (typeof snapshot.documents === 'object') {
                documents = Object.values(snapshot.documents);
            }

            console.log(`🔄 Worker ${this.workerId}: Restoring ${documents.length} documents for index '${indexName}'`);

            // Update SharedMemoryStore with the correct index name
            this.sharedMemoryStore = new SharedMemoryStore({
                indexName: indexName
            });

            // Add documents to SharedMemoryStore with proper indexing
            let addedCount = 0;
            for (const doc of documents) {
                try {
                    // Ensure document has proper structure for indexing
                    const docToAdd = {
                        ...doc,
                        indexName: indexName
                    };

                    const result = this.sharedMemoryStore.addDocument(docToAdd);
                    if (result && result.wasAdded) {
                        addedCount++;
                    }
                } catch (docError) {
                    console.warn(`Failed to add document ${doc.id}:`, docError);
                }
            }

            // Verify documents were properly indexed
            const stats = this.sharedMemoryStore.getStats();
            console.log(`📊 Worker ${this.workerId}: Index stats after restoration:`, {
                totalDocs: stats.totalDocs,
                addedCount,
                indexName
            });

            return {
                success: true,
                message: `Worker loaded ${addedCount} documents for index '${indexName}'`,
                documentCount: addedCount,
                totalDocs: stats.totalDocs
            };
        } catch (error) {
            console.error(`SharedMemoryWorker ${this.workerId}: Failed to initialize for restored index '${indexName}':`, error);
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    }

    private async stemToken(token: string): Promise<string> {
        // Use the built-in stemmer with language detection
        return await this.stemmer.stem(token);
    }

    private extractDocumentText(doc: any): string {
        const textParts: string[] = [];

        if (!doc || typeof doc !== 'object') {
            return '';
        }

        // Extract text from all string fields
        for (const [key, value] of Object.entries(doc)) {
            if (key === 'id') continue; // Skip ID field

            if (typeof value === 'string' && value.trim().length > 0) {
                textParts.push(value.trim());
            } else if (Array.isArray(value)) {
                // Handle array fields by joining string values
                const arrayText = value
                    .filter(item => typeof item === 'string' && item.trim().length > 0)
                    .join(' ');
                if (arrayText.length > 0) {
                    textParts.push(arrayText);
                }
            }
        }

        return textParts.join(' ');
    }

    private async calculateDocumentScore(doc: any, queryTokens: string[]): Promise<ScoreDetails> {
        const matches: Array<{
            token: string;
            matches: number;
            score: number;
        }> = [];
        let totalScore = 0;

        const docText = this.extractDocumentText(doc);
        const docTokens = docText.toLowerCase().split(/\s+/).filter(token => token.length > 0);

        for (const queryToken of queryTokens) {
            const tokenMatches = docTokens.filter(docToken =>
                docToken.includes(queryToken) || queryToken.includes(docToken)
            );

            if (tokenMatches.length > 0) {
                const score = tokenMatches.length / Math.max(docTokens.length, 1);
                matches.push({
                    token: queryToken,
                    matches: tokenMatches.length,
                    score
                });
                totalScore += score;
            }
        }

        return {
            total: totalScore,
            matches,
            relevance: queryTokens.length > 0 ? totalScore / queryTokens.length : 0
        };
    }

    private async processBatchItem(item: BatchItem): Promise<any> {
        // Generic batch processing
        switch (item.type) {
            case 'tokenize':
                return await this.handleProcessTokens(item.tokens!, item.document);

            case 'score':
                return await this.handleCalculateScores([item.document!], item.query!);

            case 'index':
                return await this.handleAddDocuments(item.indexName!, [item.document!]);

            default:
                throw new Error(`Unknown batch item type: ${item.type}`);
        }
    }

    private sendMessage(message: OutgoingMessage): void {
        if (parentPort) {
            parentPort.postMessage(message);
        }
    }

    handleMessage(message: IncomingMessage): void {
        try {
            switch (message.type) {
                case 'INIT':
                    this.initialize();
                    break;

                case 'EXECUTE_TASK':
                    // Validate that message has required properties
                    if (!message.operation) {
                        console.error(`❌ Worker ${this.workerId}: Missing operation in EXECUTE_TASK message:`, message);
                        this.sendMessage({
                            type: 'TASK_ERROR',
                            taskId: message.taskId,
                            error: 'Missing operation in EXECUTE_TASK message'
                        });
                        return;
                    }

                    if (!message.operation.type) {
                        console.error(`❌ Worker ${this.workerId}: Received operation without type:`, message.operation);
                        this.sendMessage({
                            type: 'TASK_ERROR',
                            taskId: message.taskId,
                            error: 'Operation missing type property'
                        });
                        return;
                    }

                    this.handleTask(message.taskId, message.operation)
                        .then(result => {
                            console.log(`🔍 Worker ${this.workerId}: Sending result:`, result);
                            this.sendMessage({
                                type: 'TASK_COMPLETE',
                                taskId: message.taskId,
                                result
                            });
                        })
                        .catch(error => {
                            console.error(`❌ Worker ${this.workerId} task failed:`, error);
                            this.sendMessage({
                                type: 'TASK_ERROR',
                                taskId: message.taskId,
                                error: error.message
                            });
                        });
                    break;

                case 'HEALTH_CHECK':
                    this.sendMessage({
                        type: 'HEALTH_CHECK',
                        workerId: this.workerId,
                        status: 'healthy',
                        currentTask: this.currentTask,
                        memoryUsage: process.memoryUsage(),
                        timestamp: Date.now()
                    });
                    break;

                case 'SHUTDOWN':
                    process.exit(0);
                    break;

                default:
                    console.log(`Unknown message type from worker ${this.workerId}: ${(message as any).type}`);
            }
        } catch (error) {
            console.error(`❌ Worker ${this.workerId} unhandled error in handleMessage:`, error);
            console.error(`❌ Message that caused error:`, JSON.stringify(message, null, 2));
        }
    }

    /**
     * Handle CRDT synchronization operations
     */
    private async handleSyncOperations(data: any): Promise<any> {
        console.log(`🔄 Worker ${this.workerId}: Handling sync operations`);

        try {
            // For now, return empty operations list
            // In a full CRDT implementation, this would:
            // 1. Compare vector clocks
            // 2. Return operations that the worker has that the main pool doesn't
            // 3. Apply operations from the main pool that the worker doesn't have

            return {
                success: true,
                operations: [],
                vectorClocks: {},
                lastSyncTime: Date.now()
            };
        } catch (error) {
            console.error(`❌ Worker ${this.workerId} sync operations failed:`, error);
            throw error;
        }
    }
}

// Initialize worker
const { workerId } = workerData as { workerId: string };
const worker = new SharedMemoryWorkerService({ workerId });

// Message handler
if (parentPort) {
    parentPort.on('message', (message: IncomingMessage) => {
        try {
            console.log(`🔍 Worker ${workerId} received raw message:`, JSON.stringify(message, null, 2));
            worker.handleMessage(message);
        } catch (error) {
            console.error(`❌ Worker ${workerId} error in message handler:`, error);
            console.error(`❌ Message that caused error:`, JSON.stringify(message, null, 2));

            // Send error response
            if (parentPort) {
                parentPort.postMessage({
                    type: 'TASK_ERROR',
                    taskId: (message as any).taskId,
                    error: (error as Error).message
                });
            }
        }
    });
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error(`💥 SharedMemoryWorker ${workerId} uncaught exception:`, error);

    if (parentPort) {
        parentPort.postMessage({
            type: 'TASK_ERROR',
            taskId: worker['currentTask'],
            error: error.message
        });
    }

    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error(`💥 SharedMemoryWorker ${workerId} unhandled rejection:`, reason);

    if (parentPort) {
        parentPort.postMessage({
            type: 'TASK_ERROR',
            taskId: worker['currentTask'],
            error: (reason as Error)?.message || 'Unhandled promise rejection'
        });
    }
});

// Send heartbeat every 30 seconds
setInterval(() => {
    if (parentPort) {
        parentPort.postMessage({
            type: 'HEALTH_CHECK',
            workerId,
            status: 'healthy' as const,
            currentTask: worker['currentTask'],
            timestamp: Date.now()
        });
    }
}, 30000);

