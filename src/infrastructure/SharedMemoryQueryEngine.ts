import { QueryEngine } from '../domain/QueryEngine';
import { QueryParser } from '../domain/query/QueryParser';
import { Query } from '../domain/query/BoolQuery';
import { MappingsManager } from '../domain/MappingsManager';
import { Tokenizer } from '../domain/Tokenizer';
import { StopwordsManager } from './StopwordsManager';

// Type definitions for query engine
export interface QueryEngineOptions {
    sharedMemoryStore?: any;
    tokenizer?: any;
    maxCacheSize?: number;
}

export interface QueryEngineStats {
    totalQueries: number;
    avgQueryTime: number;
    cacheHits: number;
    cacheMisses: number;
}

export interface SearchOptions {
    operator?: 'and' | 'or';
    from?: number;
    size?: number;
    indexName?: string;
}

/**
 * SharedMemoryQueryEngine - Wrapper around the domain QueryEngine
 * that provides a simplified interface for SharedMemoryStore operations
 */
export default class SharedMemoryQueryEngine {
    private readonly queryEngine: QueryEngine;
    private readonly sharedMemoryStore: any;
    private readonly stats: QueryEngineStats;

    constructor(options: QueryEngineOptions = {}) {
        this.sharedMemoryStore = options.sharedMemoryStore;

        // Initialize the domain QueryEngine with proper dependencies
        const mappingsManager = new MappingsManager();
        const stopwordsManager = new StopwordsManager();
        const tokenizer = new Tokenizer(stopwordsManager, {
            stemming: true,
            stemmingOptions: { language: 'en', aggressive: false }
        });

        // Create a simple inverted index and synonym engine
        const invertedIndex: any = {};
        const synonymEngine: any = {
            add: () => { },
            get: () => [],
            getSynonyms: () => [],
            isEnabled: () => false,
            enable: () => { },
            disable: () => { }
        };
        const documents: Map<string, any> = new Map();

        this.queryEngine = new QueryEngine(
            invertedIndex,
            synonymEngine,
            tokenizer,
            documents,
            mappingsManager
        );

        // Initialize stats
        this.stats = {
            totalQueries: 0,
            avgQueryTime: 0,
            cacheHits: 0,
            cacheMisses: 0
        };
    }

    /**
     * Execute a query using the domain QueryEngine
     */
    search(query: string | Query, options: SearchOptions = {}): Set<number> {
        const startTime = Date.now();
        this.stats.totalQueries++;

        try {
            // Execute using the domain QueryEngine directly
            const resultSet = this.queryEngine.search(query, options);

            return resultSet;

        } finally {
            // Update performance stats
            const queryTime = Date.now() - startTime;
            this.stats.avgQueryTime = ((this.stats.avgQueryTime * (this.stats.totalQueries - 1)) + queryTime) / this.stats.totalQueries;
        }
    }


    /**
     * Get query engine statistics
     */
    getStats(): QueryEngineStats {
        return { ...this.stats };
    }

    /**
     * Clear query cache
     */
    clearCache(): void {
        // QueryEngine doesn't have clearCache method, so we just reset stats
        this.stats.cacheHits = 0;
        this.stats.cacheMisses = 0;
    }
}