/**
 * Inquir Search Engine - System Configuration
 * 
 * This file contains system-level configuration settings for the Inquir search engine.
 * Only includes settings that are actually implemented and used by the engine.
 * 
 * CUSTOMIZATION EXAMPLES:
 * 
 * // Increase shared memory for large datasets
 * sharedMemoryStore: {
 *   bufferSize: 1024 * 1024 * 1000, // 1GB
 *   maxDocuments: 5000000,
 *   tokenCacheSize: 20000
 * }
 * 
 * // Optimize for high-performance queries
 * performance: {
 *   queryOptimization: {
 *     enableEarlyTermination: true,
 *     enableQueryCache: true,
 *     maxParallelTokens: 16
 *   }
 * }
 * 
 * // Adjust worker pool for different hardware
 * workerPool: {
 *   totalWorkers: 8,
 *   maxWriteWorkers: 3
 * }
 */

export default {

    // ============================================================================
    // WORKER POOL CONFIGURATION
    // ============================================================================

    workerPool: {
        // Regular worker pool settings
        totalWorkers: undefined,              // Default: CPU count - 1
        minWriteWorkers: 1,                   // Minimum write workers
        maxWriteWorkers: undefined,           // Default: 30% of total workers
        readPriority: 2,                      // Read operation priority
        queueTimeout: 60000,                  // Queue timeout in ms
        workerTimeout: 30000,                 // Worker timeout in ms
        historySize: 100,                     // History size for monitoring
        healthCheckInterval: 10000,           // Health check interval in ms
        performanceInterval: 30000,           // Performance monitoring interval
        alertThresholds: {}                   // Alert thresholds (empty by default)
    },

    // Shared memory worker pool settings
    sharedMemoryWorkerPool: {
        workerThreads: undefined,             // Default: CPU count - 1
        sharedMemorySize: 1024 * 1024 * 500, // 500MB shared memory
        maxDocuments: 1000000,                // Maximum documents in shared memory
        maxTerms: 10000000,                   // Maximum terms in shared memory
        taskTimeout: 30000,                   // Task timeout in ms
        healthCheckInterval: 10000            // Health check interval in ms
    },

    // ============================================================================
    // SHARED MEMORY STORE CONFIGURATION
    // ============================================================================

    sharedMemoryStore: {
        // Basic memory settings
        bufferSize: 1024 * 1024 * 500,       // 500MB default buffer size
        maxDocuments: 1000000,                // Maximum documents
        maxTerms: 10000000,                   // Maximum terms

        // Tokenization settings
        stemming: false,                      // Enable stemming
        stemmingOptions: {},                  // Stemming options
        tokenCacheSize: 1000,                 // Token cache size
        queryCacheSize: 100,                  // Query cache size
        defaultAnalyzer: 'standard',          // Default analyzer
        fieldAnalyzers: {},                   // Field-specific analyzers

        // Advanced settings (for AdvancedSharedMemoryStore)
        advanced: {
            tokenCacheSize: 10000,              // Larger token cache
            queryCacheSize: 1000,               // Larger query cache
            maxLocalCacheSize: 10000            // Local cache size
        }
    },

    // ============================================================================
    // PERSISTENCE CONFIGURATION
    // ============================================================================

    persistence: {
        // Base directory for data storage
        baseDir: './.data',

        // Batch processing settings
        batchSize: 1000,                      // Batch size for operations

        // Compression settings
        compression: true,                    // Enable compression

        // Sharded storage settings
        enableShardedStorage: true,           // Enable sharded storage
        maxParallelShards: 4,                 // Maximum parallel shards

        // File paths (relative to baseDir)
        documentsFile: 'documents.jsonl',     // Documents file
        indexFile: 'index.jsonl',             // Index file
        metadataFile: 'metadata.json',        // Metadata file
        globalMetadataFile: 'global-metadata.json', // Global metadata
        mappingsFile: 'mappings.json'         // Mappings file
    },

    // ============================================================================
    // STOPWORDS CONFIGURATION
    // ============================================================================

    stopwords: {
        filePath: './stopwords.json',         // Stopwords file path
        autoSave: true,                       // Auto-save functionality
        threshold: 1000                       // Auto-detection threshold
    },

    // ============================================================================
    // PERFORMANCE OPTIMIZATIONS
    // ============================================================================

    performance: {
        // Query optimization settings
        queryOptimization: {
            maxResultsBeforeEarlyTermination: 1000,
            enableEarlyTermination: true,
            queryResultCacheTTL: 300000,        // 5 minutes
            enableQueryCache: true,
            enableFastApproximateScoring: true,
            scoringBatchSize: 100,
            enableParallelTokenProcessing: true,
            maxParallelTokens: 8
        },

        // Search result optimization
        searchOptimization: {
            maxResultSize: 100,                 // Maximum results per query
            maxOffsetSize: 10000,               // Maximum offset for pagination
            maxAggregationSize: 50              // Maximum aggregation results
        },

        // Cache settings
        cacheOptimization: {
            queryCacheTTL: 300000,              // 5 minutes
            cleanupInterval: 60000              // 1 minute
        }
    },

    // ============================================================================
    // SEARCH ENGINE CONFIGURATION
    // ============================================================================

    searchEngine: {
        // Default search settings
        enableShardedStorage: true,           // Enable sharded storage
        numShards: 8,                         // Number of shards

        // Auto-persistence settings
        autoPersistence: {
            enabled: true,                      // Enable auto-persistence
            interval: 30000,                    // Persistence interval (30 seconds)
            saveOnAdd: true,                    // Save on document add
            saveOnShutdown: true,               // Save on shutdown
            batchSize: 100                      // Batch size for persistence
        },

        // Facet settings
        facetFields: []                       // Default facet fields (empty)
    },

    // ============================================================================
    // LOGGING CONFIGURATION
    // ============================================================================

    logging: {
        level: 'info',                        // Log level: debug, info, warn, error
        enableConsole: true,                  // Enable console logging
        enableFile: false,                    // Enable file logging
        filePath: './logs/inquir.log'         // Log file path
    },

    // ============================================================================
    // MONITORING CONFIGURATION
    // ============================================================================

    monitoring: {
        enabled: true,                        // Enable monitoring
        healthCheckInterval: 10000,           // Health check interval (10 seconds)
        performanceInterval: 30000,           // Performance monitoring interval (30 seconds)

        // Alert thresholds
        alertThresholds: {
            memoryUsage: 0.85,                  // 85% memory usage
            avgQueryTime: 1000,                 // 1 second average query time
            errorRate: 0.05                     // 5% error rate
        }
    }
}; 