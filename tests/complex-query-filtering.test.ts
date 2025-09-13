import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import SharedMemoryWorkerPool from '../src/infrastructure/SharedMemoryWorkerPool';

describe('Complex Query Filtering Tests', () => {
    let workerPool: SharedMemoryWorkerPool;

    beforeEach(async () => {
        workerPool = new SharedMemoryWorkerPool({
            workerThreads: 2,
            taskTimeout: 5000,
            sharedMemorySize: 50 * 1024 * 1024, // 50MB
            enablePersistence: false
        });
        await workerPool.initialize();
    });

    afterEach(async () => {
        if (workerPool) {
            await workerPool.shutdown();
        }
    });

    describe('Bool Query with Should Clauses', () => {
        beforeEach(async () => {
            // Setup test data with characters that have various attributes
            const rickDocs = [
                { id: '1', name: 'Rick Sanchez', species: 'Human', status: 'Alive', origin: 'Earth C-137', location: 'Citadel of Ricks' },
                { id: '2', name: 'Morty Smith', species: 'Human', status: 'Alive', origin: 'Earth C-137', location: 'Earth C-137' },
                { id: '3', name: 'Summer Smith', species: 'Human', status: 'Alive', origin: 'Earth C-137', location: 'Earth C-137' },
                { id: '4', name: 'Beth Smith', species: 'Human', status: 'Alive', origin: 'Earth C-137', location: 'Earth C-137' },
                { id: '5', name: 'Jerry Smith', species: 'Human', status: 'Alive', origin: 'Earth C-137', location: 'Earth C-137' }
            ];

            const animeDocs = [
                { id: '1', name: 'Naruto Uzumaki', series: 'Naruto', status: 'Alive', village: 'Konoha', occupation: 'Hokage' },
                { id: '2', name: 'Goku', series: 'Dragon Ball', status: 'Alive', planet: 'Earth', occupation: 'Fighter' },
                { id: '3', name: 'Luffy', series: 'One Piece', status: 'Alive', crew: 'Straw Hat Pirates', occupation: 'Pirate' },
                { id: '4', name: 'Ichigo', series: 'Bleach', status: 'Alive', occupation: 'Soul Reaper', location: 'Karakura Town' }
            ];

            await workerPool.addDocuments('rickandmorty', rickDocs);
            await workerPool.addDocuments('anime', animeDocs);
        });

        it('should handle complex bool queries with proper index filtering', async () => {
            const complexQuery = {
                bool: {
                    should: [
                        { match: { field: 'name', value: 'ri', boost: 4 } },
                        { match: { field: 'species', value: 'ri', boost: 3 } },
                        { match: { field: 'status', value: 'ri', boost: 3 } },
                        { prefix: { field: 'name', value: 'ri', boost: 3.5 } },
                        { prefix: { field: 'species', value: 'ri', boost: 2.5 } },
                        { prefix: { field: 'origin', value: 'ri', boost: 2 } },
                        { prefix: { field: 'location', value: 'ri', boost: 2 } },
                        { wildcard: { field: 'name', value: '*ri*', boost: 2.5 } },
                        { wildcard: { field: 'species', value: '*ri*', boost: 2 } },
                        { wildcard: { field: 'origin', value: '*ri*', boost: 1.8 } },
                        { wildcard: { field: 'location', value: '*ri*', boost: 1.8 } },
                        { wildcard: { field: 'status', value: '*ri*', boost: 1.5 } },
                        { wildcard: { field: 'name', value: '* ri*', boost: 3 } },
                        { wildcard: { field: 'origin', value: '* ri*', boost: 2.2 } },
                        { wildcard: { field: 'location', value: '* ri*', boost: 2.2 } },
                        { fuzzy: { field: 'name', value: 'ri', fuzziness: 2, boost: 1.5 } },
                        { fuzzy: { field: 'species', value: 'ri', fuzziness: 1, boost: 1.2 } },
                        { fuzzy: { field: 'origin', value: 'ri', fuzziness: 2, boost: 1 } },
                        { fuzzy: { field: 'location', value: 'ri', fuzziness: 2, boost: 1 } },
                        { fuzzy: { field: 'status', value: 'ri', fuzziness: 1, boost: 1 } }
                    ],
                    minimum_should_match: 1
                }
            };

            const rickSearch = await workerPool.search('rickandmorty', complexQuery);
            expect(rickSearch.success).toBe(true);
            expect(rickSearch.hits).toHaveLength(1); // Only Rick Sanchez should match
            expect(rickSearch.hits[0].name).toBe('Rick Sanchez');
            expect(rickSearch.hits[0].indexName).toBe('rickandmorty');

            const animeSearch = await workerPool.search('anime', complexQuery);
            expect(animeSearch.success).toBe(true);
            expect(animeSearch.hits).toHaveLength(0); // No anime characters should match 'ri'
        });

        it('should handle bool queries with must clauses', async () => {
            const mustQuery = {
                bool: {
                    must: [
                        { match: { field: 'species', value: 'Human' } },
                        { match: { field: 'status', value: 'Alive' } }
                    ]
                }
            };

            const rickSearch = await workerPool.search('rickandmorty', mustQuery);
            expect(rickSearch.success).toBe(true);
            expect(rickSearch.hits).toHaveLength(5); // All rickandmorty characters are Human and Alive
            expect(rickSearch.hits.every((doc: any) => doc.indexName === 'rickandmorty')).toBe(true);
            expect(rickSearch.hits.every((doc: any) => doc.species === 'Human')).toBe(true);
            expect(rickSearch.hits.every((doc: any) => doc.status === 'Alive')).toBe(true);

            const animeSearch = await workerPool.search('anime', mustQuery);
            expect(animeSearch.success).toBe(true);
            expect(animeSearch.hits).toHaveLength(0); // No anime characters have 'species' field
        });

        it('should handle bool queries with must_not clauses', async () => {
            const mustNotQuery = {
                bool: {
                    must_not: [
                        { match: { field: 'name', value: 'Rick' } }
                    ]
                }
            };

            const rickSearch = await workerPool.search('rickandmorty', mustNotQuery);
            expect(rickSearch.success).toBe(true);
            expect(rickSearch.hits).toHaveLength(4); // All except Rick Sanchez
            expect(rickSearch.hits.every((doc: any) => doc.name !== 'Rick Sanchez')).toBe(true);
            expect(rickSearch.hits.every((doc: any) => doc.indexName === 'rickandmorty')).toBe(true);
        });
    });

    describe('Aggregation Queries', () => {
        beforeEach(async () => {
            const rickDocs = [
                { id: '1', name: 'Rick Sanchez', species: 'Human', status: 'Alive', gender: 'Male', origin: 'Earth C-137', location: 'Citadel of Ricks' },
                { id: '2', name: 'Morty Smith', species: 'Human', status: 'Alive', gender: 'Male', origin: 'Earth C-137', location: 'Earth C-137' },
                { id: '3', name: 'Summer Smith', species: 'Human', status: 'Alive', gender: 'Female', origin: 'Earth C-137', location: 'Earth C-137' },
                { id: '4', name: 'Beth Smith', species: 'Human', status: 'Alive', gender: 'Female', origin: 'Earth C-137', location: 'Earth C-137' },
                { id: '5', name: 'Jerry Smith', species: 'Human', status: 'Alive', gender: 'Male', origin: 'Earth C-137', location: 'Earth C-137' }
            ];

            const animeDocs = [
                { id: '1', name: 'Naruto Uzumaki', series: 'Naruto', status: 'Alive', gender: 'Male', village: 'Konoha' },
                { id: '2', name: 'Goku', series: 'Dragon Ball', status: 'Alive', gender: 'Male', planet: 'Earth' },
                { id: '3', name: 'Luffy', series: 'One Piece', status: 'Alive', gender: 'Male', crew: 'Straw Hat Pirates' },
                { id: '4', name: 'Ichigo', series: 'Bleach', status: 'Alive', gender: 'Male', occupation: 'Soul Reaper' }
            ];

            await workerPool.addDocuments('rickandmorty', rickDocs);
            await workerPool.addDocuments('anime', animeDocs);
        });

        it('should handle queries with aggregations and proper filtering', async () => {
            const queryWithAggs = {
                query: { match_all: {} },
                aggs: {
                    species: {
                        terms: { field: 'species', size: 50 }
                    },
                    status: {
                        terms: { field: 'status', size: 20 }
                    },
                    gender: {
                        terms: { field: 'gender', size: 20 }
                    },
                    origin: {
                        terms: { field: 'origin', size: 50 }
                    },
                    location: {
                        terms: { field: 'location', size: 50 }
                    }
                }
            };

            const rickSearch = await workerPool.search('rickandmorty', queryWithAggs.query, {
                from: 0,
                size: 12,
                aggregations: queryWithAggs.aggs
            });

            expect(rickSearch.success).toBe(true);
            expect(rickSearch.hits).toHaveLength(5);
            expect(rickSearch.hits.every((doc: any) => doc.indexName === 'rickandmorty')).toBe(true);
            expect(rickSearch.aggregations).toBeDefined();

            const animeSearch = await workerPool.search('anime', queryWithAggs.query, {
                from: 0,
                size: 12,
                aggregations: queryWithAggs.aggs
            });

            expect(animeSearch.success).toBe(true);
            expect(animeSearch.hits).toHaveLength(4);
            expect(animeSearch.hits.every((doc: any) => doc.indexName === 'anime')).toBe(true);
            expect(animeSearch.aggregations).toBeDefined();
        });
    });

    describe('Query Performance and Caching', () => {
        beforeEach(async () => {
            // Create a larger dataset for performance testing
            const rickDocs = Array.from({ length: 100 }, (_, i) => ({
                id: `${i + 1}`,
                name: `Character ${i + 1}`,
                species: i % 2 === 0 ? 'Human' : 'Alien',
                status: i % 3 === 0 ? 'Alive' : 'Dead',
                gender: i % 2 === 0 ? 'Male' : 'Female',
                origin: `Origin ${i + 1}`,
                location: `Location ${i + 1}`,
                indexName: 'rickandmorty'
            }));

            const animeDocs = Array.from({ length: 50 }, (_, i) => ({
                id: `${i + 1}`,
                name: `Anime Character ${i + 1}`,
                series: `Series ${i + 1}`,
                status: i % 2 === 0 ? 'Alive' : 'Dead',
                gender: i % 2 === 0 ? 'Male' : 'Female',
                village: `Village ${i + 1}`,
                indexName: 'anime'
            }));

            await workerPool.addDocuments('rickandmorty', rickDocs);
            await workerPool.addDocuments('anime', animeDocs);
        });

        it('should handle complex queries efficiently', async () => {
            const complexQuery = {
                bool: {
                    should: [
                        { match: { field: 'name', value: 'Character', boost: 4 } },
                        { match: { field: 'species', value: 'Human', boost: 3 } },
                        { wildcard: { field: 'name', value: '*Character*', boost: 2.5 } }
                    ],
                    minimum_should_match: 1
                }
            };

            const startTime = Date.now();
            const rickSearch = await workerPool.search('rickandmorty', complexQuery, { size: 100 });
            const endTime = Date.now();

            expect(rickSearch.success).toBe(true);
            expect(rickSearch.hits).toHaveLength(100);
            expect(rickSearch.hits.every((doc: any) => doc.indexName === 'rickandmorty')).toBe(true);
            expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
        });

        it('should maintain performance with concurrent complex queries', async () => {
            const complexQuery = {
                bool: {
                    should: [
                        { match: { field: 'name', value: 'Character', boost: 4 } },
                        { wildcard: { field: 'name', value: '*Character*', boost: 2.5 } }
                    ],
                    minimum_should_match: 1
                }
            };

            const startTime = Date.now();
            const [rickSearch, animeSearch] = await Promise.all([
                workerPool.search('rickandmorty', complexQuery, { size: 100 }),
                workerPool.search('anime', complexQuery, { size: 50 })
            ]);
            const endTime = Date.now();

            expect(rickSearch.success).toBe(true);
            expect(animeSearch.success).toBe(true);
            expect(rickSearch.hits).toHaveLength(100);
            expect(animeSearch.hits).toHaveLength(50);
            expect(endTime - startTime).toBeLessThan(2000); // Should complete within 2 seconds
        });
    });

    describe('Edge Cases and Error Handling', () => {
        beforeEach(async () => {
            await workerPool.addDocuments('test', [
                { id: '1', name: 'Test Character', species: 'Human', status: 'Alive' }
            ]);
        });

        it('should handle malformed complex queries gracefully', async () => {
            const malformedQuery = {
                bool: {
                    should: [
                        { match: { field: 'name', value: 'Test' } },
                        { invalid: { field: 'name', value: 'Test' } } // Invalid query type
                    ]
                }
            };

            const result = await workerPool.search('test', malformedQuery);
            expect(result.success).toBe(true);
            // Should still return results for valid parts of the query
        });

        it('should handle empty bool queries', async () => {
            const emptyBoolQuery = {
                bool: {
                    should: []
                }
            };

            const result = await workerPool.search('test', emptyBoolQuery);
            expect(result.success).toBe(true);
            expect(result.hits).toHaveLength(0);
        });

        it('should handle queries with missing fields gracefully', async () => {
            const missingFieldQuery = {
                bool: {
                    should: [
                        { match: { field: 'nonexistent', value: 'Test' } }
                    ]
                }
            };

            const result = await workerPool.search('test', missingFieldQuery);
            expect(result.success).toBe(true);
            expect(result.hits).toHaveLength(0);
        });
    });
});
