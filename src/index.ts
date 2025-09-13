// Main entry point for the Advanced Search Engine library (TypeScript version)

// Re-export all type definitions
export * from './types';

// Re-export migrated domain value objects
export { DocumentId, FieldName, FieldType, IndexName, QueryText, SearchScore } from './domain/valueObjects/index';

// Re-export migrated entities
export { Document } from './domain/entities/Document';
export type { DocumentJSON } from './domain/entities/Document';

// Re-export migrated domain events
export { DocumentAddedEvent } from './domain/events/DocumentAddedEvent';
export type { DocumentAddedEventJSON } from './domain/events/DocumentAddedEvent';

// Re-export migrated repository interfaces
export { DocumentRepository } from './domain/repositories/DocumentRepository';
export { SearchRepository } from './domain/repositories/SearchRepository';
export { SearchQuery } from './application/queries/SearchQuery';

// Re-export migrated infrastructure components
export { InMemoryDocumentRepository } from './infrastructure/repositories/InMemoryDocumentRepository';

// Migrated TypeScript components
import SearchEngineClass from './domain/SearchEngine.js';
import BM25ScorerClass from './domain/BM25Scorer.js';
import MappingsManagerClass from './domain/MappingsManager.js';
import QueryEngineClass from './domain/QueryEngine.js';
import RankingPipelineClass from './domain/RankingPipeline.js';
import TokenizerClass from './domain/Tokenizer.js';
import SynonymEngineClass from './domain/SynonymEngine.js';
import FacetEngineClass from './domain/FacetEngine.js';
import PersonalizationEngineClass from './domain/PersonalizationEngine.js';
import ShardedInvertedIndexClass from './domain/ShardedInvertedIndex.js';
import StreamingPersistenceClass from './infrastructure/StreamingPersistence.js';
import StopwordsManagerClass from './infrastructure/StopwordsManager.js';
import { getConfigManager } from './infrastructure/ConfigManager.js';

// Text analysis components
import { Stemmer } from './lib/Stemmer';
import { LanguageDetector } from './lib/LanguageDetector';
import { SnowballStemmer } from './lib/SnowballStemmer';

// Re-export all classes (legacy support)
export const SearchEngine = SearchEngineClass;
export const BM25Scorer = BM25ScorerClass;
export const MappingsManager = MappingsManagerClass;
export const QueryEngine = QueryEngineClass;
export const RankingPipeline = RankingPipelineClass;
export const Tokenizer = TokenizerClass;
export const SynonymEngine = SynonymEngineClass;
export const FacetEngine = FacetEngineClass;
export const PersonalizationEngine = PersonalizationEngineClass;
export const StopwordsManager = StopwordsManagerClass;
export const ShardedInvertedIndex = ShardedInvertedIndexClass;
export const StreamingPersistence = StreamingPersistenceClass;

// Text analysis components
export { LanguageDetector } from './lib/LanguageDetector.js';
export { SnowballStemmer } from './lib/SnowballStemmer.js';
export { Stemmer } from './lib/Stemmer.js';

// TypeScript interfaces for createSearchEngine options
export interface SearchEngineOptions {
    facetFields?: string[];
    mappings?: Record<string, any>;
    stopwords?: string[];
    autoSave?: boolean;
    useSharding?: boolean;
    numShards?: number;
    useMemoryOptimization?: boolean;
    useStreamingPersistence?: boolean;
    memoryOptimizationOptions?: Record<string, any>;
    shardingOptions?: Record<string, any>;
    streamingOptions?: Record<string, any>;
    stemming?: boolean;
    stemmingOptions?: Record<string, any>;
    autoPersistence?: boolean | Record<string, any>;
    enablePersistence?: boolean;
}

// Convenience function to create a search engine with default configuration
export async function createSearchEngine(options: SearchEngineOptions = {}): Promise<any> {
    const {
        facetFields = [],
        mappings = {},
        stopwords = [],
        autoSave = true,
        useSharding = false,
        numShards = 1,
        useMemoryOptimization = true,
        useStreamingPersistence = false,
        memoryOptimizationOptions = {},
        shardingOptions = {},
        streamingOptions = {},
        stemming = false,
        stemmingOptions = {},
        autoPersistence = false,
        enablePersistence = false
    } = options;

    const stopwordsManager = new StopwordsManagerClass({
        autoSave: false
    });

    // Add stopwords programmatically if provided
    if (stopwords && stopwords.length > 0) {
        stopwords.forEach(word => stopwordsManager.add(word));
    }

    // When using persistence, mappings are saved as part of the snapshot, not in root directory
    let persistence: any = null;
    let mappingsFilePath: string | null = null;
    if (useStreamingPersistence) {
        const persistenceOptions: any = {
            enableShardedStorage: useSharding && numShards > 1,
            ...streamingOptions
        };

        // Add index sharding config if sharding is enabled
        if (useSharding && numShards > 1) {
            persistenceOptions.indexShardingConfig = {
                enableShardedStorage: true,
                numShards: numShards,
                shardingStrategy: 'hash'
            };
        }

        const baseDir = persistenceOptions.baseDir;
        mappingsFilePath = baseDir ? `${baseDir}/${persistenceOptions.mappingsFile || 'mappings.json'}` : null;
        if (mappingsFilePath) {
            persistenceOptions.mappingsFile = mappingsFilePath;
        }
        persistence = new StreamingPersistenceClass(persistenceOptions);
    } else if (enablePersistence) {
        const persistenceOptions: any = {
            baseDir: './.data',
            enableShardedStorage: useSharding && numShards > 1,
            ...streamingOptions
        };
        persistence = new StreamingPersistenceClass(persistenceOptions);
        mappingsFilePath = `${persistenceOptions.baseDir || './.data'}/${persistenceOptions.mappingsFile || 'mappings.json'}`;
    } else if (!autoSave) {
        mappingsFilePath = null;
    } else {
        mappingsFilePath = './mappings.json';
    }

    const mappingsManager = new MappingsManagerClass(mappingsFilePath || undefined);

    // Set up initial mappings if provided
    for (const [field, mapping] of Object.entries(mappings)) {
        mappingsManager.setMapping(field, mapping);
    }

    const scorerFactory = (totalDocs: number, avgDocLength: number, docLengths: any, invertedIndex: any) =>
        new BM25ScorerClass(totalDocs, avgDocLength, docLengths, invertedIndex);

    // Choose appropriate inverted index implementation
    let invertedIndex;
    if (useSharding) {
        if (numShards === 1) {
            invertedIndex = new ShardedInvertedIndexClass({
                numShards: 1,
                ...shardingOptions
            });
        } else {
            invertedIndex = new ShardedInvertedIndexClass({
                numShards,
                ...shardingOptions
            });
        }
    } else {
        invertedIndex = new ShardedInvertedIndexClass({
            numShards: 1,
            ...shardingOptions
        });
    }

    const tokenizer = new TokenizerClass(stopwordsManager, {
        stemming,
        stemmingOptions
    });
    const scorer = new BM25ScorerClass(0, 0, new Map(), invertedIndex);
    const rankingPipeline = new RankingPipelineClass(scorer, tokenizer);

    // Configure auto-persistence
    let autoPersistenceConfig = typeof autoPersistence === 'object' ? { ...autoPersistence } : {};

    if (typeof options.autoPersistence === 'object') {
        autoPersistenceConfig = options.autoPersistence;
    } else if (enablePersistence || useStreamingPersistence) {
        autoPersistenceConfig = {
            enabled: true,
            interval: 30000,
            saveOnAdd: true,
            saveOnShutdown: true,
            batchSize: 1
        };
    }

    const engine = await SearchEngineClass.create({
        tokenizer,
        scorerFactory,
        invertedIndex,
        rankingPipeline,
        stopwordsManager,
        synonymEngine: new SynonymEngineClass(),
        facetFields,
        mappingsManager,
        persistence,
        enableShardedStorage: useSharding && numShards > 1,
        autoPersistence: autoPersistenceConfig
    });

    await engine.initialize();

    // Expose persistence on engine instance for test assertions
    if (!('persistence' in engine)) {
        (engine as any).persistence = persistence;
    }

    return engine;
}

// Export the default SearchEngine class for backward compatibility
export default SearchEngineClass;