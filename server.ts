import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import os from 'os';
import SharedMemoryWorkerPool from './src/infrastructure/SharedMemoryWorkerPool.ts';
import WorkerMonitor from './src/infrastructure/WorkerMonitor.ts';
import StreamingPersistence from './src/infrastructure/StreamingPersistence.ts';
import PerformanceOptimizations, { IMMEDIATE_PERFORMANCE_CONFIG } from './src/infrastructure/PerformanceOptimizations.ts';
import { getConfigManager } from './src/infrastructure/ConfigManager.ts';

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

// Enhanced CORS and security headers for performance
app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
});

app.use(cors({
    origin: true,
    credentials: true,
    maxAge: 86400
}));
app.use(express.json({
    limit: '10mb',
    strict: true
}));

const performanceMonitor = PerformanceOptimizations.createPerformanceMonitor();

let sharedMemoryWorkerPool: SharedMemoryWorkerPool | null = null;
let workerMonitor: WorkerMonitor | null = null;

async function initializeOptimizedServer(): Promise<void> {
    console.log('🚀 Starting OPTIMIZED Search Engine API Server...');
    const optimizedConfig = {
        ...PerformanceOptimizations.getOptimizedSharedMemoryConfig(),
        ...IMMEDIATE_PERFORMANCE_CONFIG,
        workerThreads: Math.min(16, os.cpus().length),
        taskTimeout: 15000,
    };
    console.log('🔧 Enhanced SharedMemory Worker configuration:', optimizedConfig);
    sharedMemoryWorkerPool = new SharedMemoryWorkerPool(optimizedConfig);
    await sharedMemoryWorkerPool.initialize();
    PerformanceOptimizations.applyOptimizations(sharedMemoryWorkerPool);
    console.log(`✅ Optimized SharedMemoryWorkerPool initialized with ${sharedMemoryWorkerPool.workers?.length || 0} workers`);
    workerMonitor = new WorkerMonitor(sharedMemoryWorkerPool);
    workerMonitor.start();
    await autoDiscoverIndicesOptimized();
}

type RestoredData = {
    config: any;
    snapshot: {
        documents?: Map<string, any>;
        mappings?: any;
    };
};

async function autoDiscoverIndicesOptimized(): Promise<void> {
    console.log('🔄 Auto-discovering indices with configuration-based restoration...');
    try {
        // Load configuration first
        const configManager = getConfigManager();
        await configManager.loadConfig();

        // Debug: Log all available configuration keys
        console.log('🔍 Available configuration keys:', Object.keys(configManager['config'] || {}));

        // Get persistence configuration
        const persistenceConfig = configManager.get('persistence');
        const searchEngineConfig = configManager.get('searchEngine') || {
            enableShardedStorage: true,
            numShards: 8,
            autoPersistence: {
                enabled: true,
                interval: 30000,
                saveOnAdd: true,
                saveOnShutdown: true,
                batchSize: 100
            },
            facetFields: []
        };

        console.log('📋 Using persistence configuration:', {
            enabled: persistenceConfig.enabled,
            baseDir: persistenceConfig.baseDir,
            enableShardedStorage: searchEngineConfig.enableShardedStorage,
            numShards: searchEngineConfig.numShards
        });

        // Only restore if persistence is enabled in configuration
        if (!persistenceConfig.enabled) {
            console.log('⚠️  Persistence is disabled in configuration, skipping restoration');
            return;
        }

        const restoredIndices: Map<string, RestoredData> = await StreamingPersistence.restoreAllIndices();
        const initPromises: Promise<void>[] = [];
        for (const [indexName, restoredData] of restoredIndices.entries()) {
            initPromises.push(initializeIndexOptimized(indexName, restoredData, searchEngineConfig));
        }
        const results = await Promise.allSettled(initPromises);
        let successCount = 0;
        results.forEach((result, index) => {
            const indexName = Array.from(restoredIndices.keys())[index];
            if (result.status === 'fulfilled') {
                successCount++;
                console.log(`✅ Successfully initialized optimized index '${indexName}'`);
            } else {
                console.error(`❌ Failed to initialize index '${indexName}':`, result.reason);
            }
        });
        console.log(`✅ Successfully initialized ${successCount}/${restoredIndices.size} indices with configuration-based restoration`);
    } catch (error) {
        console.error('Error during configuration-based index auto-discovery:', error);
    }
}

async function initializeIndexOptimized(indexName: string, restoredData: RestoredData, searchEngineConfig?: any): Promise<void> {
    console.log(`🔄 Initializing optimized index '${indexName}' with configuration...`);
    const facetFields = determineOptimizedFacetFields(indexName, restoredData);
    if (!sharedMemoryWorkerPool) return;

    // Use configuration-based restoration
    const result = await sharedMemoryWorkerPool.initializeFromRestored(indexName, restoredData, facetFields.slice(0, 8));

    if (result.success) {
        console.log(`✅ Successfully restored index '${indexName}' with ${result.documentsLoaded} documents`);
        console.log(`📊 Configuration applied:`, {
            enableShardedStorage: searchEngineConfig?.enableShardedStorage || false,
            numShards: searchEngineConfig?.numShards || 1,
            facetFields: facetFields.slice(0, 8)
        });
    } else {
        console.error(`❌ Failed to restore index '${indexName}': ${result.error}`);
    }
}

function determineOptimizedFacetFields(indexName: string, restoredData: RestoredData): string[] {
    // First priority: Check if facet fields are explicitly stored in metadata
    if (restoredData.snapshot?.facetFields && Array.isArray(restoredData.snapshot.facetFields) && restoredData.snapshot.facetFields.length > 0) {
        console.log(`🏷️  Found explicit facet fields for '${indexName}': ${restoredData.snapshot.facetFields.join(', ')}`);
        return restoredData.snapshot.facetFields.slice(0, 8);
    }

    // Second priority: Check sharding config facet fields
    if (restoredData.snapshot?.shardingConfig?.facetFields && Array.isArray(restoredData.snapshot.shardingConfig.facetFields) && restoredData.snapshot.shardingConfig.facetFields.length > 0) {
        console.log(`🏷️  Found sharding config facet fields for '${indexName}': ${restoredData.snapshot.shardingConfig.facetFields.join(', ')}`);
        return restoredData.snapshot.shardingConfig.facetFields.slice(0, 8);
    }

    // Third priority: Check if there are keyword fields in mappings
    if (restoredData.snapshot?.mappings) {
        const mappings = restoredData.snapshot.mappings.properties || restoredData.snapshot.mappings;
        const keywordFields: string[] = [];
        for (const [field, mapping] of Object.entries(mappings)) {
            if ((mapping as any).type === 'keyword') {
                keywordFields.push(field);
            }
        }
        if (keywordFields.length > 0) {
            console.log(`🏷️  Found keyword fields for faceting in '${indexName}': ${keywordFields.join(', ')}`);
            return keywordFields.slice(0, 8);
        }
    }

    // Last resort: Auto-detect keyword fields from document structure
    console.log(`⚠️  No explicit facet fields or mappings found for '${indexName}' - auto-detecting keyword fields`);
    return autoDetectKeywordFields(indexName, restoredData);
}

function autoDetectKeywordFields(indexName: string, restoredData: RestoredData): string[] {
    const documents = restoredData.snapshot.documents;
    if (!documents || documents.size === 0) return [];
    console.log(`🔍 Auto-detecting keyword fields for '${indexName}'...`);
    const sampleDoc = documents.values().next().value;
    if (!sampleDoc) return [];
    const keywordFields: string[] = [];
    const sampleSize = Math.min(20, documents.size);
    let count = 0;
    for (const doc of documents.values()) {
        if (count >= sampleSize) break;
        for (const [field, value] of Object.entries(doc)) {
            if (field === 'id' || field.startsWith('_')) continue;
            if (typeof value === 'string') {
                if (detectKeywordType(value) === 'keyword' && !keywordFields.includes(field)) {
                    keywordFields.push(field);
                }
            } else if (typeof value === 'number' || typeof value === 'boolean') {
                if (!keywordFields.includes(field)) {
                    keywordFields.push(field);
                }
            }
        }
        count++;
    }
    const selectedFields = keywordFields.slice(0, 6);
    if (selectedFields.length > 0) {
        console.log(`🏷️  Auto-detected keyword fields for '${indexName}': ${selectedFields.join(', ')}`);
    } else {
        console.log(`⚠️  No suitable keyword fields auto-detected for '${indexName}'`);
    }
    return selectedFields;
}

function detectKeywordType(value: string): 'keyword' | 'text' {
    if (!value || typeof value !== 'string') return 'text';
    const trimmedValue = value.trim();
    if (trimmedValue.length > 50) return 'text';
    if (trimmedValue.length <= 2) return 'keyword';
    if (/[.!?]+/.test(trimmedValue)) return 'text';
    if (/[()[\]{}",;:|\\\/]/.test(trimmedValue)) return 'text';
    const words = trimmedValue.split(/\s+/);
    if (words.length > 4) return 'text';
    const hasLongWords = words.some(word => word.length > 15);
    if (hasLongWords) return 'text';
    if (trimmedValue.length <= 30 && words.length <= 3) return 'keyword';
    return 'text';
}

// Enhanced search endpoint with optimizations
app.post('/search/:indexName', async (req: Request, res: Response) => {
    const queryTimer = performanceMonitor.startQuery();
    try {
        const { indexName } = req.params;
        const requestBody = req.body || {};
        const query = PerformanceOptimizations.optimizeQuery(requestBody.query);
        const optimizedContext = PerformanceOptimizations.optimizeSearchOptions({
            from: requestBody.from || 0,
            size: requestBody.size || 10,
            aggregations: requestBody.aggregations || requestBody.aggs
        });
        if (!sharedMemoryWorkerPool) throw new Error('Worker pool not initialized');

        // Pass the query object directly to preserve query types
        const result = await sharedMemoryWorkerPool.search(indexName, query, optimizedContext);
        if (result.success) {
            const queryTime = queryTimer.end();
            res.json({
                hits: result.hits || result.results,
                total: result.total,
                from: result.from,
                size: result.size,
                aggregations: result.aggregations || {},
                facets: result.facets || {},
                _performance: {
                    queryTime: `${queryTime}ms`,
                    cached: queryTime < 10
                }
            });
        } else {
            if (result.error && result.error.includes('not found')) {
                res.status(404).json({ error: `Index '${indexName}' not found` });
            } else {
                res.status(500).json({ error: result.error || 'Search failed' });
            }
        }
    } catch (error: any) {
        queryTimer.end();
        console.error('Optimized search error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/performance', (req: Request, res: Response) => {
    const metrics = performanceMonitor.getMetrics();
    const workerMetrics = sharedMemoryWorkerPool?.getPerformanceMetrics?.() || {};
    res.json({
        query: metrics,
        worker: workerMetrics,
        memory: process.memoryUsage(),
        uptime: process.uptime()
    });
});

// Root endpoint for health check
app.get('/', async (req: Request, res: Response) => {
    try {
        let indices: string[] = [];

        // Try to get indices, but don't fail if worker pool isn't ready
        if (sharedMemoryWorkerPool) {
            try {
                const indicesResult = await sharedMemoryWorkerPool.listIndices();
                if (indicesResult.success) {
                    indices = Array.isArray(indicesResult.indices)
                        ? indicesResult.indices.map((idx: any) => idx.indexName || idx)
                        : Object.keys(indicesResult.indices || {});
                }
            } catch (workerError) {
                console.warn('Worker pool not ready for listing indices:', workerError.message);
                // Continue without indices list - server is still healthy
            }
        }

        res.json({
            status: 'ok',
            message: 'OPTIMIZED Search Engine API Server',
            indices: indices,
            version: '1.0.1',
            workerPoolReady: !!sharedMemoryWorkerPool
        });
    } catch (error) {
        console.error('Health check error:', error);
        res.status(500).json({ error: 'Failed to get server status' });
    }
});

// Create index endpoint
app.post('/index', async (req: Request, res: Response) => {
    try {
        const { indexName, enableShardedStorage, numShards, facetFields } = req.body;

        if (!indexName) {
            return res.status(400).json({ error: 'indexName is required' });
        }

        if (!sharedMemoryWorkerPool) {
            return res.status(500).json({ error: 'Worker pool not initialized' });
        }

        const result = await sharedMemoryWorkerPool.initializeEngine({
            indexName,
            enableShardedStorage: enableShardedStorage || false,
            numShards: numShards || 4,
            facetFields: facetFields || []
        });

        if (result.success) {
            res.status(201).json({
                message: `Index '${indexName}' created successfully`,
                indexName: result.indexName,
                sharding: {
                    enabled: enableShardedStorage || false,
                    numShards: numShards || 1,
                    facetFields: facetFields || []
                }
            });
        } else {
            res.status(500).json({ error: result.error || 'Failed to create index' });
        }
    } catch (error: any) {
        console.error('Create index error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Add documents endpoint
app.post('/index/:indexName/documents', async (req: Request, res: Response) => {
    try {
        const { indexName } = req.params;
        const { documents } = req.body;

        if (!documents || !Array.isArray(documents)) {
            return res.status(400).json({ error: 'documents array is required' });
        }

        if (!sharedMemoryWorkerPool) {
            return res.status(500).json({ error: 'Worker pool not initialized' });
        }

        const result = await sharedMemoryWorkerPool.addDocuments(indexName, documents);

        if (result.success) {
            res.json({
                message: `Added ${result.addedCount} documents to index '${indexName}'`,
                addedCount: result.addedCount,
                duplicateCount: result.duplicateCount,
                totalDocs: result.totalDocs,
                persistence: {
                    enabled: true,
                    triggered: result.addedCount > 0
                }
            });
        } else {
            res.status(500).json({ error: result.error || 'Failed to add documents' });
        }
    } catch (error: any) {
        console.error('Add documents error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Manual snapshot endpoint
app.post('/index/:indexName/snapshot', async (req: Request, res: Response) => {
    try {
        const { indexName } = req.params;

        if (!sharedMemoryWorkerPool) {
            return res.status(500).json({ error: 'Worker pool not initialized' });
        }

        const result = await sharedMemoryWorkerPool.saveSnapshotManually(indexName);

        if (result.success) {
            res.json({
                message: result.message,
                timestamp: result.timestamp,
                indexName
            });
        } else {
            res.status(400).json({ error: result.error });
        }
    } catch (error: any) {
        console.error('Manual snapshot error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Flush endpoint
app.post('/index/:indexName/flush', async (req: Request, res: Response) => {
    try {
        const { indexName } = req.params;

        if (!sharedMemoryWorkerPool) {
            return res.status(500).json({ error: 'Worker pool not initialized' });
        }

        const result = await sharedMemoryWorkerPool.flush(indexName);

        if (result.success) {
            res.json({
                message: `Flushed index '${indexName}' successfully`,
                flushedWorkers: result.flushedWorkers,
                totalWorkers: result.totalWorkers,
                persistenceSaved: result.persistenceSaved || false
            });
        } else {
            res.status(500).json({ error: result.error || 'Failed to flush index' });
        }
    } catch (error: any) {
        console.error('Flush error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

async function startOptimizedServer() {
    try {
        await initializeOptimizedServer();
        app.listen(port, () => {
            console.log(`🚀 OPTIMIZED Search Engine API Server running on http://localhost:${port}`);
            console.log(`📊 Performance monitoring: http://localhost:${port}/performance`);
            console.log(`🧵 Enhanced SharedMemory Worker Pool with optimizations enabled`);
            console.log('⚡ Performance optimizations enabled:');
            console.log(`  - Enhanced caching (Query: ${IMMEDIATE_PERFORMANCE_CONFIG.queryCacheSize}, Token: ${IMMEDIATE_PERFORMANCE_CONFIG.tokenCacheSize})`);
            console.log(`  - Early termination: ${IMMEDIATE_PERFORMANCE_CONFIG.enableEarlyTermination}`);
            console.log(`  - Query optimization: ${IMMEDIATE_PERFORMANCE_CONFIG.enableQueryOptimization}`);
            console.log(`  - Parallel processing: ${IMMEDIATE_PERFORMANCE_CONFIG.enableParallelProcessing}`);
        });
    } catch (error) {
        console.error('Failed to start optimized server:', error);
        process.exit(1);
    }
}

process.on('SIGINT', async () => {
    console.log('\n🔄 Gracefully shutting down optimized server...');
    if (workerMonitor) {
        workerMonitor.stop();
    }
    if (sharedMemoryWorkerPool) {
        await sharedMemoryWorkerPool.shutdown();
    }
    console.log('✅ Optimized server shutdown complete');
    process.exit(0);
});

startOptimizedServer(); 