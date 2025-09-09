/**
 * Debug tests for circular dependency issues
 */

import { describe, it, expect } from 'vitest';

describe('Circular Dependency Debug Tests', () => {
    it('should test individual module imports without circular dependencies', async () => {
        const importResults: any[] = [];

        try {
            // Test 1: Core domain modules
            const { QueryEngine } = await import('../src/domain/QueryEngine');
            importResults.push({ module: 'QueryEngine', status: 'success' });

            const { ShardedInvertedIndex } = await import('../src/domain/ShardedInvertedIndex');
            importResults.push({ module: 'ShardedInvertedIndex', status: 'success' });

            const { MappingsManager } = await import('../src/domain/MappingsManager');
            importResults.push({ module: 'MappingsManager', status: 'success' });

            const { Tokenizer } = await import('../src/domain/Tokenizer');
            importResults.push({ module: 'Tokenizer', status: 'success' });

            const { SynonymEngine } = await import('../src/domain/SynonymEngine');
            importResults.push({ module: 'SynonymEngine', status: 'success' });

            // Test 2: Infrastructure modules
            const { StopwordsManager } = await import('../src/infrastructure/StopwordsManager');
            importResults.push({ module: 'StopwordsManager', status: 'success' });

            // Test 3: SearchEngine (this might cause circular dependency)
            try {
                const { default: SearchEngine } = await import('../src/domain/SearchEngine');
                importResults.push({ module: 'SearchEngine', status: 'success' });
            } catch (error) {
                importResults.push({
                    module: 'SearchEngine',
                    status: 'failed',
                    error: error.message
                });
            }

            // Test 4: AutoPersistenceManager (this might cause circular dependency)
            try {
                const { AutoPersistenceManager } = await import('../src/domain/AutoPersistenceManager');
                importResults.push({ module: 'AutoPersistenceManager', status: 'success' });
            } catch (error) {
                importResults.push({
                    module: 'AutoPersistenceManager',
                    status: 'failed',
                    error: error.message
                });
            }

            // Test 5: SharedMemoryStore
            try {
                const { default: SharedMemoryStore } = await import('../src/infrastructure/SharedMemoryStore');
                importResults.push({ module: 'SharedMemoryStore', status: 'success' });
            } catch (error) {
                importResults.push({
                    module: 'SharedMemoryStore',
                    status: 'failed',
                    error: error.message
                });
            }

            console.log('Import results:', importResults);

            // Check if any critical modules failed
            const failedModules = importResults.filter(r => r.status === 'failed');
            if (failedModules.length > 0) {
                console.log('Failed modules:', failedModules);
            }

            expect(importResults.filter(r => r.module === 'QueryEngine')[0].status).toBe('success');
            expect(importResults.filter(r => r.module === 'ShardedInvertedIndex')[0].status).toBe('success');
            expect(importResults.filter(r => r.module === 'MappingsManager')[0].status).toBe('success');
            expect(importResults.filter(r => r.module === 'Tokenizer')[0].status).toBe('success');
            expect(importResults.filter(r => r.module === 'SynonymEngine')[0].status).toBe('success');
            expect(importResults.filter(r => r.module === 'StopwordsManager')[0].status).toBe('success');

        } catch (error) {
            console.log('Import results:', importResults);
            throw error;
        }
    });

    it('should test SearchEngine creation with minimal dependencies', async () => {
        try {
            // Create minimal SearchEngine without AutoPersistenceManager
            const { default: SearchEngine } = await import('../src/domain/SearchEngine');
            const { MappingsManager } = await import('../src/domain/MappingsManager');
            const { Tokenizer } = await import('../src/domain/Tokenizer');
            const { StopwordsManager } = await import('../src/infrastructure/StopwordsManager');

            const mappingsManager = new MappingsManager();
            const stopwordsManager = new StopwordsManager();
            const tokenizer = new Tokenizer(stopwordsManager);

            // Create SearchEngine with minimal options
            const searchEngine = new SearchEngine({
                mappingsManager,
                tokenizer,
                indexName: 'test',
                // Explicitly disable autoPersistence to avoid circular dependency
                autoPersistence: null
            });

            expect(searchEngine).toBeDefined();
            expect(searchEngine.indices['test']).toBeDefined();

        } catch (error) {
            console.error('SearchEngine creation failed:', error);
            throw error;
        }
    });

    it('should test SharedMemoryStore creation with minimal dependencies', async () => {
        try {
            const { default: SharedMemoryStore } = await import('../src/infrastructure/SharedMemoryStore');

            const sharedMemoryStore = new SharedMemoryStore({ indexName: 'test' });

            expect(sharedMemoryStore).toBeDefined();
            expect(sharedMemoryStore.getStats()).toBeDefined();

        } catch (error) {
            console.error('SharedMemoryStore creation failed:', error);
            throw error;
        }
    });

    it('should test QueryEngine creation with all dependencies', async () => {
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

            expect(queryEngine).toBeDefined();
            expect(queryEngine.documents).toBe(documents);
            expect(queryEngine.invertedIndex).toBe(invertedIndex);
            expect(queryEngine.tokenizer).toBe(tokenizer);
            expect(queryEngine.mappingsManager).toBe(mappingsManager);
            expect(queryEngine.synonymEngine).toBe(synonymEngine);

        } catch (error) {
            console.error('QueryEngine creation failed:', error);
            throw error;
        }
    });

    it('should test end-to-end search functionality', async () => {
        try {
            // Test 1: Create QueryEngine directly
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

            // Test search
            const matchAllResult = queryEngine.search({ match_all: {} }, { size: 10 });
            const stringResult = queryEngine.search('Rick', { size: 10 });
            const rawSetResult = queryEngine.search({ match_all: {} }, { __rawSet: true });

            expect(documents.size).toBe(3);
            expect(matchAllResult.hits).toBeDefined();
            expect(matchAllResult.total).toBe(3);
            expect(stringResult.hits).toBeDefined();
            expect(stringResult.total).toBeGreaterThan(0);
            expect(rawSetResult instanceof Set).toBe(true);
            expect(rawSetResult.size).toBe(3);

        } catch (error) {
            console.error('End-to-end test failed:', error);
            throw error;
        }
    });
});
