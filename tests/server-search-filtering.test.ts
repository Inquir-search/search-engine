import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn } from 'child_process';

describe('Server Search Filtering Tests', () => {
    let serverProcess: any;
    const serverUrl = 'http://localhost:3000';
    const testId = Date.now().toString();

    beforeAll(async () => {
        // Start the server
        serverProcess = spawn('npm', ['run', 'start'], {
            stdio: 'pipe',
            shell: true
        });

        // Wait for server to start with better error handling
        let attempts = 0;
        const maxAttempts = 30; // 30 seconds total

        while (attempts < maxAttempts) {
            try {
                const response = await fetch(`${serverUrl}/`);
                if (response.ok) {
                    console.log('Server started successfully');
                    break;
                }
            } catch (error) {
                // Server not ready yet, wait and retry
            }

            await new Promise(resolve => setTimeout(resolve, 1000));
            attempts++;
        }

        if (attempts >= maxAttempts) {
            throw new Error('Server failed to start within 30 seconds');
        }

        // Add test data
        await addTestData();
    }, 30000);

    afterAll(async () => {
        if (serverProcess) {
            serverProcess.kill();
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    });

    async function addTestData() {
        // Clear any existing data first
        console.log('Clearing existing data...');
        try {
            await fetch(`${serverUrl}/index/rickandmorty`, { method: 'DELETE' });
            await fetch(`${serverUrl}/index/anime`, { method: 'DELETE' });
        } catch (error) {
            console.log('Error clearing data (expected if indices don\'t exist):', error.message);
        }

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

        // Add rickandmorty data
        const rickResponse = await fetch(`${serverUrl}/index/rickandmorty-${testId}/documents`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ documents: rickDocs })
        });
        const rickResult = await rickResponse.json();
        console.log('Rick documents added:', rickResult);
        expect(rickResponse.ok).toBe(true);

        // Add anime data
        const animeResponse = await fetch(`${serverUrl}/index/anime-${testId}/documents`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ documents: animeDocs })
        });
        expect(animeResponse.ok).toBe(true);
    }

    async function makeSearchRequest(indexName: string, query: any, options: any = {}) {
        const response = await fetch(`${serverUrl}/search/${indexName}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: query,
                ...options
            })
        });

        expect(response.ok).toBe(true);
        return await response.json();
    }

    describe('Basic Search Filtering', () => {
        it('should filter search results by index name', async () => {
            const rickSearch = await makeSearchRequest(`rickandmorty-${testId}`, { match_all: {} });
            expect(rickSearch.hits).toHaveLength(5);
            expect(rickSearch.hits.every((doc: any) => doc.indexName === `rickandmorty-${testId}`)).toBe(true);
            expect(rickSearch.hits.every((doc: any) => doc.species === 'Human')).toBe(true);

            const animeSearch = await makeSearchRequest(`anime-${testId}`, { match_all: {} });
            expect(animeSearch.hits).toHaveLength(4);
            expect(animeSearch.hits.every((doc: any) => doc.indexName === `anime-${testId}`)).toBe(true);
            expect(animeSearch.hits.every((doc: any) => doc.series)).toBe(true);
        });

        it('should filter string queries by index name', async () => {
            const rickSearch = await makeSearchRequest(`rickandmorty-${testId}`, { match: { field: 'name', value: 'Rick' } });
            console.log('Rick search result:', rickSearch);
            expect(rickSearch.hits).toHaveLength(1);
            expect(rickSearch.hits[0].name).toBe('Rick Sanchez');
            expect(rickSearch.hits[0].indexName).toBe(`rickandmorty-${testId}`);

            const animeSearch = await makeSearchRequest(`anime-${testId}`, { match: { field: 'name', value: 'Naruto' } });
            console.log('Naruto search result:', animeSearch);
            expect(animeSearch.hits).toHaveLength(1);
            expect(animeSearch.hits[0].name).toBe('Naruto Uzumaki');
            expect(animeSearch.hits[0].indexName).toBe(`anime-${testId}`);
        });

        it('should filter wildcard queries by index name', async () => {
            const rickSearch = await makeSearchRequest(`rickandmorty-${testId}`, { wildcard: { field: '*', value: '*' } });
            console.log('Rick wildcard search result:', rickSearch);
            expect(rickSearch.hits).toHaveLength(5);
            expect(rickSearch.hits.every((doc: any) => doc.indexName === `rickandmorty-${testId}`)).toBe(true);

            const animeSearch = await makeSearchRequest(`anime-${testId}`, { wildcard: { field: '*', value: '*' } });
            console.log('Anime wildcard search result:', animeSearch);
            expect(animeSearch.hits).toHaveLength(4);
            expect(animeSearch.hits.every((doc: any) => doc.indexName === `anime-${testId}`)).toBe(true);
        });
    });

    describe('Complex Query Filtering', () => {
        it('should handle complex bool queries with proper filtering', async () => {
            const complexQuery = {
                bool: {
                    should: [
                        { match: { field: 'name', value: 'ri', boost: 4 } },
                        { match: { field: 'species', value: 'ri', boost: 3 } },
                        { wildcard: { field: 'name', value: '*ri*', boost: 2.5 } },
                        { wildcard: { field: 'species', value: '*ri*', boost: 2 } }
                    ],
                    minimum_should_match: 1
                }
            };

            const rickSearch = await makeSearchRequest(`rickandmorty-${testId}`, complexQuery);
            expect(rickSearch.hits).toHaveLength(1);
            expect(rickSearch.hits[0].name).toBe('Rick Sanchez');
            expect(rickSearch.hits[0].indexName).toBe(`rickandmorty-${testId}`);

            const animeSearch = await makeSearchRequest(`anime-${testId}`, complexQuery);
            expect(animeSearch.hits).toHaveLength(0);
        });

        it('should handle the original complex query from the user', async () => {
            const originalQuery = {
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

            const rickSearch = await makeSearchRequest(`rickandmorty-${testId}`, originalQuery, {
                from: 0,
                size: 12,
                aggs: {
                    species: { terms: { field: 'species', size: 50 } },
                    status: { terms: { field: 'status', size: 20 } },
                    gender: { terms: { field: 'gender', size: 20 } },
                    origin: { terms: { field: 'origin', size: 50 } },
                    location: { terms: { field: 'location', size: 50 } }
                }
            });

            expect(rickSearch.hits).toHaveLength(1);
            expect(rickSearch.hits[0].name).toBe('Rick Sanchez');
            expect(rickSearch.hits[0].indexName).toBe(`rickandmorty-${testId}`);
            expect(rickSearch.total).toBe(1);
            expect(rickSearch.from).toBe(0);
            expect(rickSearch.size).toBe(12);
        });
    });

    describe('Pagination and Performance', () => {
        it('should handle pagination correctly for each index', async () => {
            const rickPage1 = await makeSearchRequest(`rickandmorty-${testId}`, { match_all: {} }, { from: 0, size: 3 });
            expect(rickPage1.hits).toHaveLength(3);
            expect(rickPage1.total).toBe(5);
            expect(rickPage1.from).toBe(0);
            expect(rickPage1.size).toBe(3);
            expect(rickPage1.hits.every((doc: any) => doc.indexName === `rickandmorty-${testId}`)).toBe(true);

            const rickPage2 = await makeSearchRequest(`rickandmorty-${testId}`, { match_all: {} }, { from: 3, size: 3 });
            expect(rickPage2.hits).toHaveLength(2);
            expect(rickPage2.total).toBe(5);
            expect(rickPage2.from).toBe(3);
            expect(rickPage2.size).toBe(3);
        });

        it('should maintain performance with concurrent searches', async () => {
            const startTime = Date.now();

            const [rickSearch, animeSearch] = await Promise.all([
                makeSearchRequest(`rickandmorty-${testId}`, { match_all: {} }),
                makeSearchRequest(`anime-${testId}`, { match_all: {} })
            ]);

            const endTime = Date.now();

            expect(rickSearch.hits).toHaveLength(5);
            expect(animeSearch.hits).toHaveLength(4);
            expect(rickSearch.hits.every((doc: any) => doc.indexName === `rickandmorty-${testId}`)).toBe(true);
            expect(animeSearch.hits.every((doc: any) => doc.indexName === `anime-${testId}`)).toBe(true);
            expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
        });
    });

    describe('Error Handling', () => {
        it('should handle searches on non-existent indices', async () => {
            const response = await fetch(`${serverUrl}/search/nonexistent`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: { match_all: {} } })
            });

            expect(response.status).toBe(404);
            const error = await response.json();
            expect(error.error).toContain('not found');
        });

        it('should handle malformed queries gracefully', async () => {
            const malformedQuery = {
                bool: {
                    should: [
                        { match: { field: 'name', value: 'Test' } },
                        { invalid: { field: 'name', value: 'Test' } }
                    ]
                }
            };

            const result = await makeSearchRequest(`rickandmorty-${testId}`, malformedQuery);
            expect(result.hits).toBeDefined();
            expect(Array.isArray(result.hits)).toBe(true);
        });

        it('should handle empty queries', async () => {
            const result = await makeSearchRequest(`rickandmorty-${testId}`, '');
            expect(result.hits).toHaveLength(0);
            expect(result.total).toBe(0);
        });
    });

    describe('Response Format', () => {
        it('should return properly formatted search results', async () => {
            const result = await makeSearchRequest(`rickandmorty-${testId}`, { match_all: {} });

            expect(result).toHaveProperty('hits');
            expect(result).toHaveProperty('total');
            expect(result).toHaveProperty('from');
            expect(result).toHaveProperty('size');
            expect(result).toHaveProperty('_performance');

            expect(Array.isArray(result.hits)).toBe(true);
            expect(typeof result.total).toBe('number');
            expect(typeof result.from).toBe('number');
            expect(typeof result.size).toBe('number');
            expect(typeof result._performance).toBe('object');
        });

        it('should include performance metrics', async () => {
            const result = await makeSearchRequest(`rickandmorty-${testId}`, { match_all: {} });

            expect(result._performance).toHaveProperty('queryTime');
            expect(result._performance).toHaveProperty('cached');
            expect(typeof result._performance.queryTime).toBe('string');
            expect(typeof result._performance.cached).toBe('boolean');
        });
    });
});
