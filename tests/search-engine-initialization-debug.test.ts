/**
 * Debug tests for SearchEngine initialization issues
 */

import { describe, it, expect, beforeEach } from 'vitest';

describe('SearchEngine Initialization Debug Tests', () => {
    let debugInfo: any[] = [];

    beforeEach(() => {
        debugInfo = [];
    });

    it('should test SearchEngine constructor without circular dependencies', async () => {
        try {
            // Test 1: Import SearchEngine
            const { default: SearchEngine } = await import('../src/domain/SearchEngine');
            debugInfo.push({ step: 'import', status: 'success' });

            // Test 2: Create basic instances
            const { MappingsManager } = await import('../src/domain/MappingsManager');
            const { Tokenizer } = await import('../src/domain/Tokenizer');
            const { StopwordsManager } = await import('../src/infrastructure/StopwordsManager');

            const mappingsManager = new MappingsManager();
            const stopwordsManager = new StopwordsManager();
            const tokenizer = new Tokenizer(stopwordsManager);

            debugInfo.push({ step: 'dependencies', status: 'success' });

            // Test 3: Create SearchEngine
            const searchEngine = new SearchEngine({
                mappingsManager,
                tokenizer,
                indexName: 'test'
            });

            debugInfo.push({
                step: 'creation',
                status: 'success',
                indices: Object.keys(searchEngine.indices || {}),
                hasDefaultIndex: !!searchEngine.indices['test']
            });

            expect(searchEngine).toBeDefined();
            expect(searchEngine.indices['test']).toBeDefined();

        } catch (error) {
            debugInfo.push({
                step: 'error',
                status: 'failed',
                error: error.message,
                stack: error.stack
            });
            console.log('Debug info:', debugInfo);
            throw error;
        }
    });

    it('should test SearchEngine index creation step by step', async () => {
        try {
            const { default: SearchEngine } = await import('../src/domain/SearchEngine');
            const { MappingsManager } = await import('../src/domain/MappingsManager');
            const { Tokenizer } = await import('../src/domain/Tokenizer');
            const { StopwordsManager } = await import('../src/infrastructure/StopwordsManager');

            const mappingsManager = new MappingsManager();
            const stopwordsManager = new StopwordsManager();
            const tokenizer = new Tokenizer(stopwordsManager);

            // Create SearchEngine
            const searchEngine = new SearchEngine({
                mappingsManager,
                tokenizer,
                indexName: 'test'
            });

            debugInfo.push({ step: 'search_engine_created', status: 'success' });

            // Check if index was created
            const index = searchEngine.indices['test'];
            if (index) {
                debugInfo.push({
                    step: 'index_exists',
                    status: 'success',
                    hasQueryEngine: !!index.queryEngine,
                    hasDocuments: !!index.documents,
                    hasInvertedIndex: !!index.invertedIndex,
                    hasTokenizer: !!index.tokenizer,
                    hasMappingsManager: !!index.mappingsManager
                });

                // Test QueryEngine
                if (index.queryEngine) {
                    const queryEngine = index.queryEngine;
                    debugInfo.push({
                        step: 'query_engine_check',
                        status: 'success',
                        hasDocuments: !!queryEngine.documents,
                        documentsSize: queryEngine.documents?.size || 0,
                        hasInvertedIndex: !!queryEngine.invertedIndex,
                        hasTokenizer: !!queryEngine.tokenizer,
                        hasMappingsManager: !!queryEngine.mappingsManager
                    });
                }
            } else {
                debugInfo.push({ step: 'index_exists', status: 'failed', error: 'Index not created' });
            }

            expect(index).toBeDefined();
            expect(index.queryEngine).toBeDefined();

        } catch (error) {
            debugInfo.push({
                step: 'error',
                status: 'failed',
                error: error.message,
                stack: error.stack
            });
            console.log('Debug info:', debugInfo);
            throw error;
        }
    });

    it('should test SearchEngine document addition and search', async () => {
        try {
            const { default: SearchEngine } = await import('../src/domain/SearchEngine');
            const { MappingsManager } = await import('../src/domain/MappingsManager');
            const { Tokenizer } = await import('../src/domain/Tokenizer');
            const { StopwordsManager } = await import('../src/infrastructure/StopwordsManager');

            const mappingsManager = new MappingsManager();
            const stopwordsManager = new StopwordsManager();
            const tokenizer = new Tokenizer(stopwordsManager);

            const searchEngine = new SearchEngine({
                mappingsManager,
                tokenizer,
                indexName: 'test'
            });

            debugInfo.push({ step: 'search_engine_created', status: 'success' });

            // Add test documents
            const testDocs = [
                { id: '1', name: 'Rick Sanchez', status: 'Alive', species: 'Human' },
                { id: '2', name: 'Morty Smith', status: 'Alive', species: 'Human' },
                { id: '3', name: 'Summer Smith', status: 'Alive', species: 'Human' }
            ];

            for (const doc of testDocs) {
                searchEngine.add(doc);
            }

            debugInfo.push({
                step: 'documents_added',
                status: 'success',
                count: testDocs.length
            });

            // Check stats
            const stats = searchEngine.getStats('test');
            debugInfo.push({
                step: 'stats_check',
                status: 'success',
                stats: stats
            });

            // Test match_all search
            const matchAllResult = searchEngine.search({ match_all: {} }, { size: 10 }, 'test');
            debugInfo.push({
                step: 'match_all_search',
                status: 'success',
                result: {
                    hits: matchAllResult.hits?.length || 0,
                    total: matchAllResult.total || 0
                }
            });

            // Test string search
            const stringResult = searchEngine.search('Rick', { size: 10 }, 'test');
            debugInfo.push({
                step: 'string_search',
                status: 'success',
                result: {
                    hits: stringResult.hits?.length || 0,
                    total: stringResult.total || 0
                }
            });

            expect(stats.totalDocs).toBe(3);
            expect(matchAllResult.hits).toBeDefined();
            expect(matchAllResult.total).toBe(3);
            expect(stringResult.hits).toBeDefined();
            expect(stringResult.total).toBeGreaterThan(0);

        } catch (error) {
            debugInfo.push({
                step: 'error',
                status: 'failed',
                error: error.message,
                stack: error.stack
            });
            console.log('Debug info:', debugInfo);
            throw error;
        }
    });

    it('should test SharedMemoryStore integration', async () => {
        try {
            const { default: SharedMemoryStore } = await import('../src/infrastructure/SharedMemoryStore');

            const sharedMemoryStore = new SharedMemoryStore({ indexName: 'test' });

            debugInfo.push({
                step: 'shared_memory_store_created',
                status: 'success',
                stats: sharedMemoryStore.getStats()
            });

            // Add test documents
            const testDocs = [
                { id: '1', name: 'Rick Sanchez', status: 'Alive', species: 'Human' },
                { id: '2', name: 'Morty Smith', status: 'Alive', species: 'Human' },
                { id: '3', name: 'Summer Smith', status: 'Alive', species: 'Human' }
            ];

            for (const doc of testDocs) {
                const result = sharedMemoryStore.addDocument(doc);
                debugInfo.push({
                    step: 'document_added',
                    docId: doc.id,
                    result: result
                });
            }

            // Check final stats
            const finalStats = sharedMemoryStore.getStats();
            debugInfo.push({
                step: 'final_stats',
                status: 'success',
                stats: finalStats
            });

            // Test match_all search
            const matchAllResult = sharedMemoryStore.search({ match_all: {} }, { size: 10 });
            debugInfo.push({
                step: 'shared_memory_match_all',
                status: 'success',
                result: {
                    hits: matchAllResult.hits?.length || 0,
                    total: matchAllResult.total || 0
                }
            });

            // Test string search
            const stringResult = sharedMemoryStore.search('Rick', { size: 10 });
            debugInfo.push({
                step: 'shared_memory_string',
                status: 'success',
                result: {
                    hits: stringResult.hits?.length || 0,
                    total: stringResult.total || 0
                }
            });

            expect(finalStats.totalDocs).toBe(3);
            expect(matchAllResult.hits).toBeDefined();
            expect(matchAllResult.total).toBe(3);
            expect(stringResult.hits).toBeDefined();
            expect(stringResult.total).toBeGreaterThan(0);

        } catch (error) {
            debugInfo.push({
                step: 'error',
                status: 'failed',
                error: error.message,
                stack: error.stack
            });
            console.log('Debug info:', debugInfo);
            throw error;
        }
    });

    it('should test QueryEngine direct functionality', async () => {
        try {
            const { QueryEngine } = await import('../src/domain/QueryEngine');
            const { ShardedInvertedIndex } = await import('../src/domain/ShardedInvertedIndex');
            const { MappingsManager } = await import('../src/domain/MappingsManager');
            const { Tokenizer } = await import('../src/domain/Tokenizer');
            const { StopwordsManager } = await import('../src/infrastructure/StopwordsManager');
            const { SynonymEngine } = await import('../src/domain/SynonymEngine');

            const invertedIndex = new ShardedInvertedIndex();
            const mappingsManager = new MappingsManager();
            const stopwordsManager = new StopwordsManager();
            const tokenizer = new Tokenizer(stopwordsManager);
            const synonymEngine = new SynonymEngine();
            const documents = new Map();

            debugInfo.push({ step: 'dependencies_created', status: 'success' });

            const queryEngine = new QueryEngine(invertedIndex, synonymEngine, tokenizer, documents, mappingsManager);

            debugInfo.push({ step: 'query_engine_created', status: 'success' });

            // Add test documents
            const testDocs = [
                { id: '1', name: 'Rick Sanchez', status: 'Alive', species: 'Human' },
                { id: '2', name: 'Morty Smith', status: 'Alive', species: 'Human' },
                { id: '3', name: 'Summer Smith', status: 'Alive', species: 'Human' }
            ];

            for (const doc of testDocs) {
                queryEngine.add(doc);
            }

            debugInfo.push({
                step: 'documents_added',
                status: 'success',
                documentCount: documents.size
            });

            // Test match_all search
            const matchAllResult = queryEngine.search({ match_all: {} }, { size: 10 });
            debugInfo.push({
                step: 'match_all_search',
                status: 'success',
                result: {
                    hits: matchAllResult.hits?.length || 0,
                    total: matchAllResult.total || 0
                }
            });

            // Test with __rawSet flag
            const rawSetResult = queryEngine.search({ match_all: {} }, { __rawSet: true });
            debugInfo.push({
                step: 'raw_set_search',
                status: 'success',
                result: {
                    isSet: rawSetResult instanceof Set,
                    size: rawSetResult instanceof Set ? rawSetResult.size : 0
                }
            });

            expect(documents.size).toBe(3);
            expect(matchAllResult.hits).toBeDefined();
            expect(matchAllResult.total).toBe(3);
            expect(rawSetResult instanceof Set).toBe(true);
            expect(rawSetResult.size).toBe(3);

        } catch (error) {
            debugInfo.push({
                step: 'error',
                status: 'failed',
                error: error.message,
                stack: error.stack
            });
            console.log('Debug info:', debugInfo);
            throw error;
        }
    });
});
