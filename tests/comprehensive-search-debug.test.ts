/**
 * Comprehensive unit tests to debug search functionality
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('Search Functionality Debug Tests', () => {
    let testResults: any[] = [];

    beforeEach(() => {
        testResults = [];
    });

    afterEach(() => {
        // Log test results for debugging
        if (testResults.length > 0) {
            console.log('Test Results:', testResults);
        }
    });

    it('should test basic module imports', async () => {
        try {
            const { QueryEngine } = await import('../src/domain/QueryEngine');
            const { ShardedInvertedIndex } = await import('../src/domain/ShardedInvertedIndex');
            const { MappingsManager } = await import('../src/domain/MappingsManager');
            const { Tokenizer } = await import('../src/domain/Tokenizer');
            const { StopwordsManager } = await import('../src/infrastructure/StopwordsManager');
            const { SynonymEngine } = await import('../src/domain/SynonymEngine');

            testResults.push({
                test: 'module_imports',
                status: 'success',
                modules: ['QueryEngine', 'ShardedInvertedIndex', 'MappingsManager', 'Tokenizer', 'StopwordsManager', 'SynonymEngine']
            });

            expect(QueryEngine).toBeDefined();
            expect(ShardedInvertedIndex).toBeDefined();
            expect(MappingsManager).toBeDefined();
            expect(Tokenizer).toBeDefined();
            expect(StopwordsManager).toBeDefined();
            expect(SynonymEngine).toBeDefined();
        } catch (error) {
            testResults.push({
                test: 'module_imports',
                status: 'failed',
                error: error.message
            });
            throw error;
        }
    });

    it('should create basic instances without errors', async () => {
        try {
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

            testResults.push({
                test: 'instance_creation',
                status: 'success',
                instances: {
                    invertedIndex: !!invertedIndex,
                    mappingsManager: !!mappingsManager,
                    stopwordsManager: !!stopwordsManager,
                    tokenizer: !!tokenizer,
                    synonymEngine: !!synonymEngine,
                    documents: documents instanceof Map
                }
            });

            expect(invertedIndex).toBeDefined();
            expect(mappingsManager).toBeDefined();
            expect(stopwordsManager).toBeDefined();
            expect(tokenizer).toBeDefined();
            expect(synonymEngine).toBeDefined();
            expect(documents).toBeDefined();
        } catch (error) {
            testResults.push({
                test: 'instance_creation',
                status: 'failed',
                error: error.message
            });
            throw error;
        }
    });

    it('should create QueryEngine without errors', async () => {
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

            const queryEngine = new QueryEngine(invertedIndex, synonymEngine, tokenizer, documents, mappingsManager);

            testResults.push({
                test: 'query_engine_creation',
                status: 'success',
                queryEngine: !!queryEngine
            });

            expect(queryEngine).toBeDefined();
        } catch (error) {
            testResults.push({
                test: 'query_engine_creation',
                status: 'failed',
                error: error.message
            });
            throw error;
        }
    });

    it('should add documents to QueryEngine', async () => {
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

            const queryEngine = new QueryEngine(invertedIndex, synonymEngine, tokenizer, documents, mappingsManager);

            const testDoc = { id: '1', name: 'Rick Sanchez', status: 'Alive', species: 'Human' };
            queryEngine.add(testDoc);

            testResults.push({
                test: 'document_addition',
                status: 'success',
                documentCount: documents.size,
                hasDocument: documents.has('1')
            });

            expect(documents.size).toBe(1);
            expect(documents.has('1')).toBe(true);
        } catch (error) {
            testResults.push({
                test: 'document_addition',
                status: 'failed',
                error: error.message
            });
            throw error;
        }
    });

    it('should search documents with match_all query', async () => {
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

            const queryEngine = new QueryEngine(invertedIndex, synonymEngine, tokenizer, documents, mappingsManager);

            // Add test documents
            const testDocs = [
                { id: '1', name: 'Rick Sanchez', status: 'Alive', species: 'Human' },
                { id: '2', name: 'Morty Smith', status: 'Alive', species: 'Human' },
                { id: '3', name: 'Summer Smith', status: 'Alive', species: 'Human' }
            ];

            for (const doc of testDocs) {
                queryEngine.add(doc);
            }

            const result = queryEngine.search({ match_all: {} }, { size: 10 });

            testResults.push({
                test: 'match_all_search',
                status: 'success',
                result: {
                    hits: result.hits?.length || 0,
                    total: result.total || 0,
                    from: result.from || 0,
                    size: result.size || 0
                }
            });

            expect(result.hits).toBeDefined();
            expect(result.total).toBe(3);
            expect(result.hits.length).toBe(3);
        } catch (error) {
            testResults.push({
                test: 'match_all_search',
                status: 'failed',
                error: error.message
            });
            throw error;
        }
    });

    it('should search documents with string query', async () => {
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

            const queryEngine = new QueryEngine(invertedIndex, synonymEngine, tokenizer, documents, mappingsManager);

            // Add test documents
            const testDocs = [
                { id: '1', name: 'Rick Sanchez', status: 'Alive', species: 'Human' },
                { id: '2', name: 'Morty Smith', status: 'Alive', species: 'Human' },
                { id: '3', name: 'Summer Smith', status: 'Alive', species: 'Human' }
            ];

            for (const doc of testDocs) {
                queryEngine.add(doc);
            }

            const result = queryEngine.search('Rick', { size: 10 });

            testResults.push({
                test: 'string_search',
                status: 'success',
                result: {
                    hits: result.hits?.length || 0,
                    total: result.total || 0,
                    from: result.from || 0,
                    size: result.size || 0
                }
            });

            expect(result.hits).toBeDefined();
            expect(result.total).toBeGreaterThan(0);
            expect(result.hits.length).toBeGreaterThan(0);
        } catch (error) {
            testResults.push({
                test: 'string_search',
                status: 'failed',
                error: error.message
            });
            throw error;
        }
    });

    it('should test QueryEngine with __rawSet flag', async () => {
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

            const queryEngine = new QueryEngine(invertedIndex, synonymEngine, tokenizer, documents, mappingsManager);

            // Add test documents
            const testDocs = [
                { id: '1', name: 'Rick Sanchez', status: 'Alive', species: 'Human' },
                { id: '2', name: 'Morty Smith', status: 'Alive', species: 'Human' }
            ];

            for (const doc of testDocs) {
                queryEngine.add(doc);
            }

            const rawSetResult = queryEngine.search({ match_all: {} }, { __rawSet: true });

            testResults.push({
                test: 'raw_set_search',
                status: 'success',
                result: {
                    isSet: rawSetResult instanceof Set,
                    size: rawSetResult instanceof Set ? rawSetResult.size : 0
                }
            });

            expect(rawSetResult instanceof Set).toBe(true);
            expect(rawSetResult.size).toBe(2);
        } catch (error) {
            testResults.push({
                test: 'raw_set_search',
                status: 'failed',
                error: error.message
            });
            throw error;
        }
    });

    it('should test naive scan fallback', async () => {
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

            const queryEngine = new QueryEngine(invertedIndex, synonymEngine, tokenizer, documents, mappingsManager);

            // Add test documents
            const testDocs = [
                { id: '1', name: 'Rick Sanchez', status: 'Alive', species: 'Human' },
                { id: '2', name: 'Morty Smith', status: 'Alive', species: 'Human' }
            ];

            for (const doc of testDocs) {
                queryEngine.add(doc);
            }

            const naiveScanResult = (queryEngine as any)._naiveScan({ match_all: {} }, {});

            testResults.push({
                test: 'naive_scan',
                status: 'success',
                result: {
                    isSet: naiveScanResult instanceof Set,
                    size: naiveScanResult instanceof Set ? naiveScanResult.size : 0
                }
            });

            expect(naiveScanResult instanceof Set).toBe(true);
            expect(naiveScanResult.size).toBe(2);
        } catch (error) {
            testResults.push({
                test: 'naive_scan',
                status: 'failed',
                error: error.message
            });
            throw error;
        }
    });

    it('should test SearchEngine creation', async () => {
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

            testResults.push({
                test: 'search_engine_creation',
                status: 'success',
                indices: Object.keys(searchEngine.indices || {}),
                hasIndex: !!searchEngine.indices['test']
            });

            expect(searchEngine).toBeDefined();
            expect(searchEngine.indices['test']).toBeDefined();
        } catch (error) {
            testResults.push({
                test: 'search_engine_creation',
                status: 'failed',
                error: error.message
            });
            throw error;
        }
    });

    it('should test SearchEngine search functionality', async () => {
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

            // Add test documents
            const testDocs = [
                { id: '1', name: 'Rick Sanchez', status: 'Alive', species: 'Human' },
                { id: '2', name: 'Morty Smith', status: 'Alive', species: 'Human' },
                { id: '3', name: 'Summer Smith', status: 'Alive', species: 'Human' }
            ];

            for (const doc of testDocs) {
                searchEngine.add(doc);
            }

            const matchAllResult = searchEngine.search({ match_all: {} }, { size: 10 }, 'test');

            testResults.push({
                test: 'search_engine_match_all',
                status: 'success',
                result: {
                    hits: matchAllResult.hits?.length || 0,
                    total: matchAllResult.total || 0,
                    from: matchAllResult.from || 0,
                    size: matchAllResult.size || 0
                }
            });

            expect(matchAllResult.hits).toBeDefined();
            expect(matchAllResult.total).toBe(3);
            expect(matchAllResult.hits.length).toBe(3);
        } catch (error) {
            testResults.push({
                test: 'search_engine_match_all',
                status: 'failed',
                error: error.message
            });
            throw error;
        }
    });

    it('should test SharedMemoryStore creation', async () => {
        try {
            const { default: SharedMemoryStore } = await import('../src/infrastructure/SharedMemoryStore');

            const sharedMemoryStore = new SharedMemoryStore({ indexName: 'test' });

            testResults.push({
                test: 'shared_memory_store_creation',
                status: 'success',
                stats: sharedMemoryStore.getStats()
            });

            expect(sharedMemoryStore).toBeDefined();
            expect(sharedMemoryStore.getStats()).toBeDefined();
        } catch (error) {
            testResults.push({
                test: 'shared_memory_store_creation',
                status: 'failed',
                error: error.message
            });
            throw error;
        }
    });

    it('should test SharedMemoryStore search functionality', async () => {
        try {
            const { default: SharedMemoryStore } = await import('../src/infrastructure/SharedMemoryStore');

            const sharedMemoryStore = new SharedMemoryStore({ indexName: 'test' });

            // Add test documents
            const testDocs = [
                { id: '1', name: 'Rick Sanchez', status: 'Alive', species: 'Human' },
                { id: '2', name: 'Morty Smith', status: 'Alive', species: 'Human' },
                { id: '3', name: 'Summer Smith', status: 'Alive', species: 'Human' }
            ];

            for (const doc of testDocs) {
                sharedMemoryStore.addDocument(doc);
            }

            const matchAllResult = sharedMemoryStore.search({ match_all: {} }, { size: 10 });

            testResults.push({
                test: 'shared_memory_store_match_all',
                status: 'success',
                result: {
                    hits: matchAllResult.hits?.length || 0,
                    total: matchAllResult.total || 0,
                    from: matchAllResult.from || 0,
                    size: matchAllResult.size || 0
                }
            });

            expect(matchAllResult.hits).toBeDefined();
            expect(matchAllResult.total).toBe(3);
            expect(matchAllResult.hits.length).toBe(3);
        } catch (error) {
            testResults.push({
                test: 'shared_memory_store_match_all',
                status: 'failed',
                error: error.message
            });
            throw error;
        }
    });
});
