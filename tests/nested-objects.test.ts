import { test, describe, beforeEach, afterEach, before, after } from 'vitest';
import { expect } from 'vitest';
import SearchEngine from '../src/domain/SearchEngine.ts';
import BM25Scorer from '../src/domain/BM25Scorer.ts';
import MappingsManager from '../src/domain/MappingsManager.ts';
import Tokenizer from '../src/domain/Tokenizer.ts';
import ShardedInvertedIndex from '../src/domain/ShardedInvertedIndex.ts';
import RankingPipeline from '../src/domain/RankingPipeline.ts';
import StopwordsManager from '../src/infrastructure/StopwordsManager.ts';
import SynonymEngine from '../src/domain/SynonymEngine.ts';

// Patch SynonymEngine for tests to provide isEnabled and getSynonyms
class TestSynonymEngine {
    isEnabled() { return false; }
    getSynonyms() { return []; }
}

describe('Nested Objects Tests', () => {
    let searchEngine;
    let mappingsManager;

    beforeEach(async () => {
        const scorerFactory = (totalDocs, avgDocLength, docLengths, index) =>
            new BM25Scorer(totalDocs, avgDocLength, docLengths, index);

        const stopwordsManager = new StopwordsManager({ autoSave: false });
        const tokenizer = new Tokenizer(stopwordsManager);
        const scorer = new BM25Scorer(0, 0, new Map(), new ShardedInvertedIndex({ numShards: 1 }));
        const rankingPipeline = new RankingPipeline(scorer, tokenizer);

        mappingsManager = new MappingsManager();

        searchEngine = await SearchEngine.create({
            tokenizer,
            scorerFactory,
            invertedIndex: new ShardedInvertedIndex({ numShards: 1 }),
            rankingPipeline,
            stopwordsManager,
            synonymEngine: new TestSynonymEngine(),
            mappingsManager,
        });

        await searchEngine.clean();
    });

    beforeEach(async () => {
        if (mappingsManager && mappingsManager.mappings) {
            mappingsManager.mappings = new Map();
        }
    });

    afterEach(async () => {
        if (searchEngine && typeof searchEngine.shutdown === 'function') {
            await searchEngine.shutdown();
            searchEngine = null;
        }
    });

    describe('Mappings Generation', () => {
        test('should generate mappings for nested objects', () => {
            const document = {
                id: 'doc1',
                user: {
                    name: 'John Doe',
                    email: 'john@example.com',
                    profile: {
                        age: 30,
                        location: {
                            city: 'New York',
                            country: 'USA'
                        }
                    }
                },
                product: {
                    name: 'iPhone',
                    category: 'electronics'
                }
            };

            // Test autoMap method
            mappingsManager.autoMap(document);

            // Check that nested field mappings are created
            expect(mappingsManager.getMapping('user.name')).toEqual({ type: 'text' });
            expect(mappingsManager.getMapping('user.email')).toEqual({ type: 'email' });
            expect(mappingsManager.getMapping('user.profile.age')).toEqual({ type: 'number' });
            expect(mappingsManager.getMapping('user.profile.location.city')).toEqual({ type: 'text' });
            expect(mappingsManager.getMapping('user.profile.location.country')).toEqual({ type: 'text' });
            expect(mappingsManager.getMapping('product.name')).toEqual({ type: 'text' });
            expect(mappingsManager.getMapping('product.category')).toEqual({ type: 'text' });
        });

        test('should handle arrays in nested objects', () => {
            const document = {
                id: 'doc1',
                user: {
                    name: 'John Doe',
                    tags: ['developer', 'javascript'],
                    scores: [85, 92, 78]
                }
            };

            mappingsManager.autoMap(document);

            expect(mappingsManager.getMapping('user.name')).toEqual({ type: 'text' });
            expect(mappingsManager.getMapping('user.tags')).toEqual({ type: 'text' });
            expect(mappingsManager.getMapping('user.scores')).toEqual({ type: 'number' });
        });

        test('should handle geo points in nested objects', () => {
            const document = {
                id: 'doc1',
                location: {
                    coordinates: [40.7128, -74.0060],
                    address: {
                        street: '123 Main St',
                        city: 'New York'
                    }
                }
            };

            mappingsManager.autoMap(document);

            expect(mappingsManager.getMapping('location.coordinates')).toEqual({ type: 'geo_point' });
            expect(mappingsManager.getMapping('location.address.street')).toEqual({ type: 'text' });
            expect(mappingsManager.getMapping('location.address.city')).toEqual({ type: 'text' });
        });
    });

    describe('Document Indexing', () => {
        test('should index nested object fields', () => {
            const document = {
                id: 'doc1',
                user: {
                    name: 'John Doe',
                    email: 'john@example.com'
                },
                product: {
                    name: 'iPhone 15',
                    category: 'electronics'
                }
            };

            searchEngine.add(document);

            // Check that document was added
            expect(searchEngine.totalDocs).toBe(1);
            expect(searchEngine.documents.has('doc1')).toBeTruthy();

            // Check that mappings were created
            expect(mappingsManager.getMapping('user.name')).toEqual({ type: 'text' });
            expect(mappingsManager.getMapping('user.email')).toEqual({ type: 'email' });
            expect(mappingsManager.getMapping('product.name')).toEqual({ type: 'text' });
            expect(mappingsManager.getMapping('product.category')).toEqual({ type: 'text' });
        });

        test('should handle deeply nested objects', () => {
            const document = {
                id: 'doc1',
                company: {
                    name: 'Tech Corp',
                    departments: {
                        engineering: {
                            name: 'Engineering',
                            employees: {
                                lead: {
                                    name: 'Alice Smith',
                                    role: 'Team Lead'
                                }
                            }
                        }
                    }
                }
            };

            searchEngine.add(document);

            expect(searchEngine.totalDocs).toBe(1);

            // Check deep nested mappings
            expect(mappingsManager.getMapping('company.name')).toEqual({ type: 'text' });
            expect(mappingsManager.getMapping('company.departments.engineering.name')).toEqual({ type: 'text' });
            expect(mappingsManager.getMapping('company.departments.engineering.employees.lead.name')).toEqual({ type: 'text' });
            expect(mappingsManager.getMapping('company.departments.engineering.employees.lead.role')).toEqual({ type: 'text' });
        });
    });

    describe('Search Functionality', () => {
        test('should search in nested object fields', () => {
            const documents = [
                {
                    id: 'doc1',
                    user: {
                        name: 'John Doe',
                        email: 'john@example.com'
                    },
                    product: {
                        name: 'iPhone 15',
                        category: 'electronics'
                    }
                },
                {
                    id: 'doc2',
                    user: {
                        name: 'Jane Smith',
                        email: 'jane@example.com'
                    },
                    product: {
                        name: 'Samsung Galaxy',
                        category: 'electronics'
                    }
                }
            ];

            documents.forEach(doc => searchEngine.add(doc));

            // Search in nested user.name field
            const results1 = searchEngine.search({
                bool: {
                    must: [
                        { match: { field: 'user.name', value: 'John' } }
                    ]
                }
            });

            expect(results1.hits.length).toBe(1);
            expect(results1.hits[0].id).toBe('doc1');

            // Search in nested product.name field
            const results2 = searchEngine.search({
                bool: {
                    must: [
                        { match: { field: 'product.name', value: 'iPhone' } }
                    ]
                }
            });

            expect(results2.hits.length).toBe(1);
            expect(results2.hits[0].id).toBe('doc1');

            // Search in nested product.category field
            const results3 = searchEngine.search({
                bool: {
                    must: [
                        { term: { field: 'product.category', value: 'electronics' } }
                    ]
                }
            });

            expect(results3.hits.length).toBe(2);
        });

        test('should search in deeply nested fields', () => {
            const document = {
                id: 'doc1',
                company: {
                    name: 'Tech Corp',
                    departments: {
                        engineering: {
                            name: 'Engineering',
                            employees: {
                                lead: {
                                    name: 'Alice Smith',
                                    role: 'Team Lead'
                                }
                            }
                        }
                    }
                }
            };

            searchEngine.add(document);

            // Search in deeply nested field
            const results = searchEngine.search({
                bool: {
                    must: [
                        { match: { field: 'company.departments.engineering.employees.lead.name', value: 'Alice' } }
                    ]
                }
            });

            expect(results.hits.length).toBe(1);
            expect(results.hits[0].id).toBe('doc1');
        });

        test('should handle complex nested queries', () => {
            const documents = [
                {
                    id: 'doc1',
                    user: {
                        name: 'John Doe',
                        email: 'john@example.com',
                        profile: {
                            age: 30,
                            location: 'New York'
                        }
                    },
                    product: {
                        name: 'iPhone 15',
                        price: 999
                    }
                },
                {
                    id: 'doc2',
                    user: {
                        name: 'Jane Smith',
                        email: 'jane@example.com',
                        profile: {
                            age: 25,
                            location: 'Los Angeles'
                        }
                    },
                    product: {
                        name: 'Samsung Galaxy',
                        price: 899
                    }
                }
            ];

            documents.forEach(doc => searchEngine.add(doc));

            // Complex query with multiple nested fields
            const results = searchEngine.search({
                bool: {
                    must: [
                        { match: { field: 'user.name', value: 'John' } },
                        { match: { field: 'user.profile.location', value: 'New York' } }
                    ],
                    should: [
                        { match: { field: 'product.name', value: 'iPhone' } }
                    ]
                }
            });

            expect(results.hits.length).toBe(1);
            expect(results.hits[0].id).toBe('doc1');
        });

        test('should handle fuzzy search in nested fields', () => {
            const document = {
                id: 'doc1',
                user: {
                    name: 'John Doe',
                    email: 'john@example.com'
                },
                product: {
                    name: 'iPhone 15 Pro Max',
                    category: 'electronics'
                }
            };

            searchEngine.add(document);

            // Fuzzy search in nested field
            const results = searchEngine.search({
                bool: {
                    must: [
                        { fuzzy: { field: 'product.name', value: 'iphone', fuzziness: 2 } }
                    ]
                }
            });

            expect(results.hits.length).toBe(1);
            expect(results.hits[0].id).toBe('doc1');
        });

        test('should handle prefix search in nested fields', () => {
            const document = {
                id: 'doc1',
                user: {
                    name: 'John Doe',
                    email: 'john@example.com'
                },
                product: {
                    name: 'iPhone 15 Pro Max',
                    category: 'electronics'
                }
            };

            searchEngine.add(document);

            // Prefix search in nested field
            const results = searchEngine.search({
                bool: {
                    must: [
                        { prefix: { field: 'product.name', value: 'iPhone' } }
                    ]
                }
            });

            expect(results.hits.length).toBe(1);
            expect(results.hits[0].id).toBe('doc1');
        });

        test('should handle wildcard search in nested fields', () => {
            const document = {
                id: 'doc1',
                user: {
                    name: 'John Doe',
                    email: 'john@example.com'
                },
                product: {
                    name: 'iPhone 15 Pro Max',
                    category: 'electronics'
                }
            };

            searchEngine.add(document);

            // Wildcard search in nested field
            const results = searchEngine.search({
                bool: {
                    must: [
                        { wildcard: { field: 'product.name', value: 'iPhone*' } }
                    ]
                }
            });

            expect(results.hits.length).toBe(1);
            expect(results.hits[0].id).toBe('doc1');
        });
    });

    describe('Edge Cases', () => {
        test('should handle empty nested objects', () => {
            const document = {
                id: 'doc1',
                user: {},
                product: {
                    name: 'iPhone'
                }
            };

            searchEngine.add(document);

            expect(searchEngine.totalDocs).toBe(1);

            // Should not create mappings for empty objects
            expect(mappingsManager.getMapping('user')).toBe(undefined);
            expect(mappingsManager.getMapping('product.name')).toEqual({ type: 'text' });
        });

        test('should handle null values in nested objects', () => {
            const document = {
                id: 'doc1',
                user: {
                    name: null,
                    email: 'john@example.com'
                }
            };

            searchEngine.add(document);

            expect(searchEngine.totalDocs).toBe(1);

            // Should create mapping for email but not for null name
            expect(mappingsManager.getMapping('user.email')).toEqual({ type: 'email' });
        });

        test('should handle arrays of objects', () => {
            const document = {
                id: 'doc1',
                users: [
                    { name: 'John', email: 'john@example.com' },
                    { name: 'Jane', email: 'jane@example.com' }
                ]
            };

            searchEngine.add(document);

            // Should detect type from first array element
            expect(mappingsManager.getMapping('users')).toEqual({ type: 'object' });
        });
    });
}); 