/**
 * Performance Optimizations Module
 *
 * This module provides immediate performance improvements that can be applied
 * to the existing search engine without major architectural changes.
 */

// Value Objects
export class SharedMemoryConfig {
    constructor(
        public readonly bufferSize: number,
        public readonly tokenCacheSize: number,
        public readonly queryCacheSize: number,
        public readonly stemming: boolean,
        public readonly stemmingOptions: StemmingOptions,
        public readonly defaultAnalyzer: string,
        public readonly fieldAnalyzerHints: FieldAnalyzerHints
    ) { }

    static createOptimized(): SharedMemoryConfig {
        return new SharedMemoryConfig(
            1024 * 1024 * 100, // 100MB vs 750MB (reduced to prevent allocation errors)
            20000, // vs 1000 default
            2000,  // vs 100 default
            true, // Enable stemming for better search relevance
            {
                language: 'en', // Use language code instead of full name
                aggressive: false // Conservative stemming for accuracy
            },
            'standard',
            {
                // Common patterns for field type detection
                text: ['title', 'name', 'description', 'content', 'summary', 'text', 'body'],
                keyword: ['id', 'status', 'type', 'category', 'classification'],
                url: ['url', 'website', 'link', 'href'],
                email: ['email', 'mail', 'contact'],
                phone: ['phone', 'telephone', 'mobile', 'cell']
            }
        );
    }

    toPlainObject(): SharedMemoryConfigData {
        return {
            bufferSize: this.bufferSize,
            tokenCacheSize: this.tokenCacheSize,
            queryCacheSize: this.queryCacheSize,
            stemming: this.stemming,
            stemmingOptions: this.stemmingOptions,
            defaultAnalyzer: this.defaultAnalyzer,
            fieldAnalyzerHints: this.fieldAnalyzerHints
        };
    }
}

export class QueryConfig {
    constructor(
        public readonly maxResultsBeforeEarlyTermination: number,
        public readonly enableEarlyTermination: boolean,
        public readonly queryResultCacheTTL: number,
        public readonly enableQueryCache: boolean,
        public readonly enableFastApproximateScoring: boolean,
        public readonly scoringBatchSize: number,
        public readonly enableParallelTokenProcessing: boolean,
        public readonly maxParallelTokens: number
    ) { }

    static createOptimized(): QueryConfig {
        return new QueryConfig(
            1000,
            true,
            300000, // 5 minutes
            true,
            true,
            100,
            true,
            8
        );
    }

    toPlainObject(): QueryConfigData {
        return {
            maxResultsBeforeEarlyTermination: this.maxResultsBeforeEarlyTermination,
            enableEarlyTermination: this.enableEarlyTermination,
            queryResultCacheTTL: this.queryResultCacheTTL,
            enableQueryCache: this.enableQueryCache,
            enableFastApproximateScoring: this.enableFastApproximateScoring,
            scoringBatchSize: this.scoringBatchSize,
            enableParallelTokenProcessing: this.enableParallelTokenProcessing,
            maxParallelTokens: this.maxParallelTokens
        };
    }
}

export class PerformanceMetrics {
    constructor(
        public queries: number = 0,
        public totalTime: number = 0,
        public avgTime: number = 0,
        public slowQueries: number = 0,
        public fastQueries: number = 0
    ) { }

    addQuery(duration: number): void {
        this.queries++;
        this.totalTime += duration;
        this.avgTime = this.totalTime / this.queries;

        if (duration > 1000) {
            this.slowQueries++;
        } else if (duration < 100) {
            this.fastQueries++;
        }
    }

    reset(): void {
        this.queries = 0;
        this.totalTime = 0;
        this.avgTime = 0;
        this.slowQueries = 0;
        this.fastQueries = 0;
    }

    clone(): PerformanceMetrics {
        return new PerformanceMetrics(
            this.queries,
            this.totalTime,
            this.avgTime,
            this.slowQueries,
            this.fastQueries
        );
    }
}

// Domain Services
export class QueryOptimizationService {
    /**
     * Apply immediate query optimizations
     */
    static optimizeQuery(query: QueryInput, options: QueryOptimizationOptions = {}): OptimizedQuery {
        if (!query) return query;

        // Handle simple string queries
        if (typeof query === 'string') {
            // Check if it's a keyword-like term
            if (this.isKeywordTerm(query)) {
                return {
                    term: {
                        field: options.defaultField || '_all',
                        value: query
                    }
                };
            }

            // Default to match query
            return {
                match: {
                    field: options.defaultField || '_all',
                    value: query
                }
            };
        }

        // Return complex queries as-is (they're already optimized)
        return query;
    }

    /**
     * Check if a term should be treated as a keyword
     */
    static isKeywordTerm(term: string): boolean {
        if (!term || typeof term !== 'string') return false;

        // Short terms are often keywords
        if (term.length <= 3) return true;

        // Single words with no spaces are often keywords
        return !term.includes(' ') && term.length <= 20;
    }

    /**
     * Optimize search options for better performance
     */
    static optimizeSearchOptions(options: SearchOptionsInput): SearchOptionsOptimized {
        const optimized: SearchOptionsOptimized = { ...options };

        // Optimize result size
        if (!optimized.size || optimized.size > 100) {
            optimized.size = Math.min(optimized.size || 10, 100);
        }

        // Optimize from parameter
        if (optimized.from && optimized.from > 10000) {
            optimized.from = Math.min(optimized.from, 10000);
        }

        // Optimize aggregations
        if (optimized.aggregations) {
            for (const [aggName, aggConfig] of Object.entries(optimized.aggregations)) {
                if ((aggConfig as any).terms && (aggConfig as any).terms.size > 50) {
                    optimized.aggregations[aggName] = {
                        ...aggConfig,
                        terms: { ...(aggConfig as any).terms, size: 50 }
                    };
                }
            }
        }

        return optimized;
    }
}

export class DocumentOptimizationService {
    /**
     * Optimize document serialization for better performance
     */
    static optimizeDocument(doc: DocumentInput): OptimizedDocument {
        if (!doc || typeof doc !== 'object') return doc;

        const optimized: OptimizedDocument = {};

        // Only include necessary fields and avoid deep cloning
        for (const [key, value] of Object.entries(doc)) {
            if (value !== null && value !== undefined) {
                if (typeof value === 'string') {
                    // Trim whitespace and limit length for performance
                    optimized[key] = value.trim().substring(0, 10000);
                } else if (Array.isArray(value)) {
                    // Limit array size for performance
                    optimized[key] = value.slice(0, 1000);
                } else if (typeof value === 'object') {
                    // Shallow copy for objects
                    optimized[key] = { ...value };
                } else {
                    optimized[key] = value;
                }
            }
        }

        return optimized;
    }
}

export class HashingService {
    /**
     * Fast hash function for caching
     */
    static fastHash(str: string): number {
        if (!str) return 0;

        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash);
    }
}

export class SetOperationsService {
    /**
     * Fast set intersection
     */
    static fastIntersection<T>(sets: Set<T>[]): Set<T> {
        if (!sets || sets.length === 0) return new Set<T>();
        if (sets.length === 1) return new Set(sets[0]);

        // Sort sets by size (smallest first) for better performance
        const sortedSets = sets.sort((a, b) => a.size - b.size);
        let result = new Set(sortedSets[0]);

        for (let i = 1; i < sortedSets.length; i++) {
            const currentSet = sortedSets[i];
            result = new Set([...result].filter(x => currentSet.has(x)));

            // Early termination if result is empty
            if (result.size === 0) break;
        }

        return result;
    }

    /**
     * Fast set union
     */
    static fastUnion<T>(sets: Set<T>[]): Set<T> {
        if (!sets || sets.length === 0) return new Set<T>();
        if (sets.length === 1) return new Set(sets[0]);

        const result = new Set<T>();
        for (const set of sets) {
            for (const item of set) {
                result.add(item);
            }
        }

        return result;
    }
}

export class FieldAnalyzerService {
    /**
     * Get suggested field analyzer based on field name and value
     */
    static suggestFieldAnalyzer(fieldName: string, sampleValue?: any): string {
        const config = SharedMemoryConfig.createOptimized();
        const hints = config.fieldAnalyzerHints;

        // Check field name patterns
        for (const [analyzer, patterns] of Object.entries(hints)) {
            if (patterns.some(pattern => fieldName.toLowerCase().includes(pattern.toLowerCase()))) {
                return analyzer;
            }
        }

        // Check value patterns
        if (sampleValue && typeof sampleValue === 'string') {
            if (sampleValue.includes('@')) return 'email';
            if (sampleValue.startsWith('http')) return 'url';
            if (/^\+?[\d\s\-\(\)]+$/.test(sampleValue)) return 'phone';
        }

        return config.defaultAnalyzer;
    }
}

// Factory
export class PerformanceMonitorFactory {
    /**
     * Create performance monitor
     */
    static createPerformanceMonitor(): PerformanceMonitor {
        const metrics = new PerformanceMetrics();

        return {
            startQuery(): QueryTimer {
                const start = performance.now();
                return {
                    end(): number {
                        const duration = performance.now() - start;
                        metrics.addQuery(duration);
                        return duration;
                    }
                };
            },

            getMetrics(): PerformanceMetrics {
                return metrics.clone();
            },

            reset(): void {
                metrics.reset();
            }
        };
    }
}

export class WorkerPoolOptimizationService {
    /**
     * Apply optimizations to worker pool
     */
    static applyOptimizations(workerPool: WorkerPoolLike): void {
        if (!workerPool) return;

        // Apply query caching with proper cache invalidation
        const originalSearch = workerPool.search;
        const originalAddDocuments = workerPool.addDocuments;
        const queryCache = new Map<string, CachedResult>();

        // Override search with caching
        workerPool.search = function (indexName: string, query: any, options: any = {}) {
            const cacheKey = `${indexName}:${JSON.stringify(query)}:${JSON.stringify(options)}`;

            if (queryCache.has(cacheKey)) {
                const cached = queryCache.get(cacheKey)!;
                if (Date.now() - cached.timestamp < 300000) { // 5 minutes
                    return Promise.resolve(cached.result);
                }
            }

            return originalSearch.call(this, indexName, query, options)
                .then(result => {
                    queryCache.set(cacheKey, {
                        result,
                        timestamp: Date.now()
                    });
                    return result;
                });
        };

        // Override addDocuments to invalidate cache
        workerPool.addDocuments = function (indexName: string, documents: any[]) {
            // Invalidate all cached search results for this index
            const keysToDelete: string[] = [];
            for (const key of queryCache.keys()) {
                if (key.startsWith(`${indexName}:`)) {
                    keysToDelete.push(key);
                }
            }
            keysToDelete.forEach(key => queryCache.delete(key));

            // Call original addDocuments
            return originalAddDocuments.call(this, indexName, documents);
        };

        // Clean up cache periodically
        setInterval(() => {
            const now = Date.now();
            for (const [key, value] of queryCache.entries()) {
                if (now - value.timestamp > 300000) {
                    queryCache.delete(key);
                }
            }
        }, 60000); // Clean every minute
    }
}

// Main Service Class
export class PerformanceOptimizations {
    /**
     * Get optimized SharedMemoryStore configuration
     */
    static getOptimizedSharedMemoryConfig(): SharedMemoryConfigData {
        return SharedMemoryConfig.createOptimized().toPlainObject();
    }

    /**
     * Get optimized query processing settings
     */
    static getOptimizedQueryConfig(): QueryConfigData {
        return QueryConfig.createOptimized().toPlainObject();
    }

    /**
     * Apply immediate query optimizations
     */
    static optimizeQuery(query: QueryInput, options: QueryOptimizationOptions = {}): OptimizedQuery {
        return QueryOptimizationService.optimizeQuery(query, options);
    }

    /**
     * Check if a term should be treated as a keyword
     */
    static isKeywordTerm(term: string): boolean {
        return QueryOptimizationService.isKeywordTerm(term);
    }

    /**
     * Optimize search options for better performance
     */
    static optimizeSearchOptions(options: SearchOptionsInput): SearchOptionsOptimized {
        return QueryOptimizationService.optimizeSearchOptions(options);
    }

    /**
     * Optimize document serialization for better performance
     */
    static optimizedSerializeDocument(doc: DocumentInput): OptimizedDocument {
        return DocumentOptimizationService.optimizeDocument(doc);
    }

    /**
     * Fast hash function for caching
     */
    static fastHash(str: string): number {
        return HashingService.fastHash(str);
    }

    /**
     * Fast set intersection
     */
    static fastIntersection<T>(sets: Set<T>[]): Set<T> {
        return SetOperationsService.fastIntersection(sets);
    }

    /**
     * Fast set union
     */
    static fastUnion<T>(sets: Set<T>[]): Set<T> {
        return SetOperationsService.fastUnion(sets);
    }

    /**
     * Create performance monitor
     */
    static createPerformanceMonitor(): PerformanceMonitor {
        return PerformanceMonitorFactory.createPerformanceMonitor();
    }

    /**
     * Apply optimizations to worker pool
     */
    static applyOptimizations(workerPool: WorkerPoolLike): void {
        WorkerPoolOptimizationService.applyOptimizations(workerPool);
    }

    /**
     * Get suggested field analyzer based on field name and value
     */
    static suggestFieldAnalyzer(fieldName: string, sampleValue?: any): string {
        return FieldAnalyzerService.suggestFieldAnalyzer(fieldName, sampleValue);
    }
}

// Type Definitions
export interface StemmingOptions {
    language: string;
    aggressive: boolean;
}

export interface FieldAnalyzerHints {
    text: string[];
    keyword: string[];
    url: string[];
    email: string[];
    phone: string[];
    [key: string]: string[];
}

export interface SharedMemoryConfigData {
    bufferSize: number;
    tokenCacheSize: number;
    queryCacheSize: number;
    stemming: boolean;
    stemmingOptions: StemmingOptions;
    defaultAnalyzer: string;
    fieldAnalyzerHints: FieldAnalyzerHints;
}

export interface QueryConfigData {
    maxResultsBeforeEarlyTermination: number;
    enableEarlyTermination: boolean;
    queryResultCacheTTL: number;
    enableQueryCache: boolean;
    enableFastApproximateScoring: boolean;
    scoringBatchSize: number;
    enableParallelTokenProcessing: boolean;
    maxParallelTokens: number;
}

export type QueryInput = string | Record<string, any> | null | undefined;
export type OptimizedQuery = QueryInput;

export interface QueryOptimizationOptions {
    defaultField?: string;
}

export interface SearchOptionsInput {
    size?: number;
    from?: number;
    aggregations?: Record<string, any>;
    [key: string]: any;
}

export interface SearchOptionsOptimized extends SearchOptionsInput {
    size: number;
    from?: number;
}

export type DocumentInput = Record<string, any> | null | undefined;
export type OptimizedDocument = Record<string, any>;

export interface QueryTimer {
    end(): number;
}

export interface PerformanceMonitor {
    startQuery(): QueryTimer;
    getMetrics(): PerformanceMetrics;
    reset(): void;
}

export interface CachedResult {
    result: any;
    timestamp: number;
}

export interface WorkerPoolLike {
    search: (indexName: string, query: any, options?: any) => Promise<any>;
    addDocuments: (indexName: string, documents: any[]) => Promise<any>;
}

// Export immediate performance config for backward compatibility
export const IMMEDIATE_PERFORMANCE_CONFIG = {
    enableEarlyTermination: true,
    enableQueryOptimization: true,
    enableParallelProcessing: true,
    queryCacheSize: 2000,
    tokenCacheSize: 20000,
    maxResultsBeforeEarlyTermination: 1000
};

export default PerformanceOptimizations;