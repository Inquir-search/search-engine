import { test, describe, beforeEach, afterEach } from 'vitest';
import { expect } from 'vitest';
import SearchEngine from '../src/domain/SearchEngine.ts';
import BM25Scorer from '../src/domain/BM25Scorer.ts';
import MappingsManager from '../src/domain/MappingsManager.ts';
import Tokenizer from '../src/domain/Tokenizer.ts';
import ShardedInvertedIndex from '../src/domain/ShardedInvertedIndex.ts';
import RankingPipeline from '../src/domain/RankingPipeline.ts';
import StopwordsManager from '../src/infrastructure/StopwordsManager.ts';
import SynonymEngine from '../src/domain/SynonymEngine.ts';
import FacetEngine from '../src/domain/FacetEngine.ts';

// Patch SynonymEngine for tests to provide isEnabled and getSynonyms
class TestSynonymEngine {
    isEnabled() { return false; }
    getSynonyms() { return []; }
}

describe('Comprehensive Query Tests - Missing Documentation Cases', () => {
    let searchEngine;
    let mappingsManager;

    beforeEach(async () => {
        const scorerFactory = (totalDocs, avgDocLength, docLengths, index) =>
            new BM25Scorer(totalDocs, avgDocLength, docLengths, index);

        const stopwordsManager = new StopwordsManager({ autoSave: false });
        const tokenizer = new Tokenizer(stopwordsManager);
        const scorer = new BM25Scorer(0, 0, new Map(), new ShardedInvertedIndex({ numShards: 1 }));
        const rankingPipeline = new RankingPipeline(scorer, tokenizer);

        mappingsManager = new MappingsManager(null); // No file path for tests

        // Set up field mappings manually
        mappingsManager.setMapping('name', { type: 'text' });
        mappingsManager.setMapping('title', { type: 'text' });
        mappingsManager.setMapping('content', { type: 'text' });
        mappingsManager.setMapping('description', { type: 'text' });
        mappingsManager.setMapping('category', { type: 'keyword' });
        mappingsManager.setMapping('status', { type: 'keyword' });
        mappingsManager.setMapping('brand', { type: 'keyword' });
        mappingsManager.setMapping('features', { type: 'text' });
        mappingsManager.setMapping('type', { type: 'keyword' });
        mappingsManager.setMapping('cuisine', { type: 'keyword' });
        mappingsManager.setMapping('price', { type: 'float' });
        mappingsManager.setMapping('rating', { type: 'float' });
        mappingsManager.setMapping('age', { type: 'float' });
        mappingsManager.setMapping('location', { type: 'geo_point' });

        searchEngine = await SearchEngine.create({
            tokenizer,
            scorerFactory,
            invertedIndex: new ShardedInvertedIndex({ numShards: 1 }),
            rankingPipeline,
            stopwordsManager,
            synonymEngine: new TestSynonymEngine(),
            facetFields: ['category', 'status', 'brand'],
            mappingsManager,
        });

        // Clean the query engine before each test to ensure isolation
        if (searchEngine && searchEngine.queryEngine) {
            searchEngine.queryEngine.clean();
        }
    });

    afterEach(async () => {
        if (searchEngine && typeof searchEngine.shutdown === 'function') {
            await searchEngine.shutdown();
            searchEngine = null;
        }

        // Clean up any test data files that might have been created
        try {
            const fs = await import('fs');
            const testFiles = ['./data', './test-data', './snapshot.json', './aof.log'];
            for (const file of testFiles) {
                if (fs.existsSync(file)) {
                    if (fs.statSync(file).isDirectory()) {
                        fs.rmSync(file, { recursive: true, force: true });
                    } else {
                        fs.unlinkSync(file);
                    }
                }
            }
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    describe('Fuzzy Query Edge Cases', () => {
        test('should handle default fuzziness (without explicit parameter)', () => {
            searchEngine.add({ id: 'f1', name: 'hello' });
            searchEngine.add({ id: 'f2', name: 'helo' }); // 1 edit distance
            searchEngine.add({ id: 'f3', name: 'hllo' }); // 1 edit distance
            searchEngine.add({ id: 'f4', name: 'hxllo' }); // 2 edit distance
            searchEngine.add({ id: 'f5', name: 'hxylzo' }); // 3+ edit distance

            const results = searchEngine.search({
                bool: {
                    must: [
                        { fuzzy: { field: 'name', value: 'hello' } } // default fuzziness = 2
                    ]
                }
            });

            expect(results.hits.length).toBe(4); // f1, f2, f3, f4 (within fuzziness 2)
            const ids = results.hits.map(h => h.id).sort();
            expect(ids).toEqual(['f1', 'f2', 'f3', 'f4']);
        });

        test('should handle different fuzziness values', () => {
            searchEngine.add({ id: 'f1', name: 'hello' });
            searchEngine.add({ id: 'f2', name: 'helo' }); // 1 edit (deletion)
            searchEngine.add({ id: 'f3', name: 'hxllo' }); // 1 edit (substitution)
            searchEngine.add({ id: 'f4', name: 'hxylzo' }); // 3+ edits

            // Test fuzziness = 1
            const results1 = searchEngine.search({
                bool: {
                    must: [
                        { fuzzy: { field: 'name', value: 'hello', fuzziness: 1 } }
                    ]
                }
            });
            expect(results1.hits.length).toBe(3); // f1, f2, f3

            // Test fuzziness = 0 (exact match)
            const results0 = searchEngine.search({
                bool: {
                    must: [
                        { fuzzy: { field: 'name', value: 'hello', fuzziness: 0 } }
                    ]
                }
            });
            expect(results0.hits.length).toBe(1); // f1 only
        });
    });

    describe('Range Query Variations', () => {
        beforeEach(async () => {
            searchEngine.add({ id: 'r1', name: 'alice', price: 10 });
            searchEngine.add({ id: 'r2', name: 'bob', price: 50 });
            searchEngine.add({ id: 'r3', name: 'charlie', price: 100 });
            searchEngine.add({ id: 'r4', name: 'david', price: 200 });
            searchEngine.add({ id: 'r5', name: 'eve', price: 500 });
        });

        test('should handle string ranges (alphabetical)', () => {
            const results = searchEngine.search({
                bool: {
                    must: [
                        { range: { field: 'name', gte: 'bob', lte: 'david' } }
                    ]
                }
            });

            expect(results.hits.length).toBe(3); // bob, charlie, david
            const names = results.hits.map(h => h.name).sort();
            expect(names).toEqual(['bob', 'charlie', 'david']);
        });

        test('should handle open-ended ranges (only gte)', () => {
            const results = searchEngine.search({
                bool: {
                    must: [
                        { range: { field: 'price', gte: 100 } }
                    ]
                }
            });

            expect(results.hits.length).toBe(3); // charlie, david, eve (price >= 100)
            const ids = results.hits.map(h => h.id).sort();
            expect(ids).toEqual(['r3', 'r4', 'r5']);
        });

        test('should handle open-ended ranges (only lte)', () => {
            const results = searchEngine.search({
                bool: {
                    must: [
                        { range: { field: 'price', lte: 50 } }
                    ]
                }
            });

            expect(results.hits.length).toBe(2); // alice, bob (price <= 50)
            const ids = results.hits.map(h => h.id).sort();
            expect(ids).toEqual(['r1', 'r2']);
        });
    });

    describe('Geo Distance Query Format Consistency', () => {
        beforeEach(async () => {
            searchEngine.add({ id: 'g1', name: 'place1', location: [0, 0] });
            searchEngine.add({ id: 'g2', name: 'place2', location: [1, 1] });
            searchEngine.add({ id: 'g3', name: 'place3', location: [10, 10] });
        });

        test('should work with documented format (lat/lon object)', () => {
            const results = searchEngine.search({
                bool: {
                    must: [{
                        geo_distance: {
                            field: 'location',
                            center: { lat: 0.5, lon: 0.5 },
                            distance: 100 // 100km
                        }
                    }]
                }
            });

            expect(results.hits.length).toBe(2); // g1, g2
            const ids = results.hits.map(h => h.id).sort();
            expect(ids).toEqual(['g1', 'g2']);
        });

        test('should work with array format for backward compatibility', () => {
            const results = searchEngine.search({
                bool: {
                    must: [{
                        geo_distance: {
                            field: 'location',
                            center: [0.5, 0.5],
                            distance: 100
                        }
                    }]
                }
            });

            expect(results.hits.length).toBe(2); // g1, g2
            const ids = results.hits.map(h => h.id).sort();
            expect(ids).toEqual(['g1', 'g2']);
        });

        test('should handle multiple geo constraints', () => {
            searchEngine.add({ id: 'g4', name: 'place4', location: [2, 2] });

            const results = searchEngine.search({
                bool: {
                    must: [
                        {
                            geo_distance: {
                                field: 'location',
                                center: { lat: 1, lon: 1 },
                                distance: 200 // Large radius to include multiple points
                            }
                        }
                    ]
                }
            });

            expect(results.hits.length >= 2).toBeTruthy(); // Should include nearby points
        });
    });

    describe('Match Phrase with Slop', () => {
        beforeEach(async () => {
            searchEngine.add({ id: 'p1', description: 'quick brown fox jumps' });
            searchEngine.add({ id: 'p2', description: 'quick red fox jumps' });
            searchEngine.add({ id: 'p3', description: 'quick brown dog jumps' });
            searchEngine.add({ id: 'p4', description: 'the quick brown fox' });
        });

        test('should find exact phrase matches', () => {
            const results = searchEngine.search({
                bool: {
                    must: [
                        { match_phrase: { field: 'description', value: 'quick brown fox' } }
                    ]
                }
            });

            expect(results.hits.length).toBe(2); // p1, p4
            const ids = results.hits.map(h => h.id).sort();
            expect(ids).toEqual(['p1', 'p4']);
        });

        test('should handle phrase with slop (word distance tolerance)', () => {
            const results = searchEngine.search({
                bool: {
                    must: [
                        { match_phrase: { field: 'description', value: 'quick fox', slop: 1 } }
                    ]
                }
            });

            // Should match "quick brown fox", "quick red fox", and "the quick brown fox" (1 word between)
            expect(results.hits.length).toBe(3); // p1, p2, p4
            const ids = results.hits.map(h => h.id).sort();
            expect(ids).toEqual(['p1', 'p2', 'p4']);
        });

        test('should handle larger slop values', () => {
            const results = searchEngine.search({
                bool: {
                    must: [
                        { match_phrase: { field: 'description', value: 'quick jumps', slop: 3 } }
                    ]
                }
            });

            // Should match phrases where "quick" and "jumps" have up to 3 words between
            expect(results.hits.length >= 3).toBeTruthy(); // p1, p2, p3
        });
    });

    describe('Phrase Query with Slop', () => {
        beforeEach(async () => {
            searchEngine.add({ id: 'ph1', content: 'hello beautiful world' });
            searchEngine.add({ id: 'ph2', content: 'hello world' });
            searchEngine.add({ id: 'ph3', content: 'hello amazing wonderful world' });
            searchEngine.add({ id: 'ph4', content: 'world hello' });
        });

        test('should find exact phrase matches', () => {
            const results = searchEngine.search({
                bool: {
                    must: [
                        { phrase: { field: 'content', value: 'hello world' } }
                    ]
                }
            });

            expect(results.hits.length).toBe(1); // ph2 (exact match)
            expect(results.hits[0].id).toBe('ph2');
        });

        test('should handle phrase with slop', () => {
            const results = searchEngine.search({
                bool: {
                    must: [
                        { phrase: { field: 'content', value: 'hello world', slop: 1 } }
                    ]
                }
            });

            // Should match "hello world" and "hello beautiful world" (1 word between)
            expect(results.hits.length).toBe(2); // ph1, ph2
            const ids = results.hits.map(h => h.id).sort();
            expect(ids).toEqual(['ph1', 'ph2']);
        });

        test('should handle larger slop values', () => {
            const results = searchEngine.search({
                bool: {
                    must: [
                        { phrase: { field: 'content', value: 'hello world', slop: 3 } }
                    ]
                }
            });

            // Should match with up to 3 intervening words
            expect(results.hits.length >= 2).toBeTruthy(); // ph1, ph2, possibly ph3
        });
    });

    describe('Complex Query Examples from Documentation', () => {
        test('E-commerce Product Search', () => {
            // Setup products
            searchEngine.add({ id: 'prod1', name: 'iPhone 14 smartphone', category: 'electronics', price: 699, brand: 'apple', features: 'wireless charging camera', status: 'in_stock' });
            searchEngine.add({ id: 'prod2', name: 'Samsung Galaxy smartphone', category: 'electronics', price: 599, brand: 'samsung', features: 'fast charging display', status: 'in_stock' });
            searchEngine.add({ id: 'prod3', name: 'Google Pixel smartphone', category: 'electronics', price: 499, brand: 'google', features: 'camera ai', status: 'out_of_stock' });
            searchEngine.add({ id: 'prod4', name: 'Nokia basic phone', category: 'electronics', price: 99, brand: 'nokia', features: 'long battery', status: 'in_stock' });
            searchEngine.add({ id: 'prod5', name: 'Apple smartphone premium', category: 'electronics', price: 999, brand: 'apple', features: 'wireless charging premium', status: 'in_stock' });

            console.log('🔍 DEBUG: Added 5 products to search engine');
            console.log('🔍 DEBUG: SearchEngine total docs:', searchEngine.indices.default.documents.size);

            // Test simpler queries first
            console.log('🔍 DEBUG: Testing simple name match:');
            const nameResults = searchEngine.search({ match: { field: 'name', value: 'smartphone' } });
            console.log('  Name match results:', nameResults.hits.length, nameResults.hits.map(h => h.id));
            
            console.log('🔍 DEBUG: Testing category term:');
            const categoryResults = searchEngine.search({ term: { field: 'category', value: 'electronics' } });
            console.log('  Category term results:', categoryResults.hits.length, categoryResults.hits.map(h => h.id));
            
            console.log('🔍 DEBUG: Testing price range:');
            const priceResults = searchEngine.search({ range: { field: 'price', gte: 200, lte: 800 } });
            console.log('  Price range results:', priceResults.hits.length, priceResults.hits.map(h => h.id));
            
            console.log('🔍 DEBUG: Testing must_not status:');
            const statusResults = searchEngine.search({ term: { field: 'status', value: 'out_of_stock' } });
            console.log('  Status out_of_stock results:', statusResults.hits.length, statusResults.hits.map(h => h.id));
            
            console.log('🔍 DEBUG: Testing must_not status (in_stock):');
            const inStockResults = searchEngine.search({ term: { field: 'status', value: 'in_stock' } });
            console.log('  Status in_stock results:', inStockResults.hits.length, inStockResults.hits.map(h => h.id));

            // Test boolean query without must_not first
            console.log('🔍 DEBUG: Testing boolean query without must_not:');
            const boolResults = searchEngine.search({
                bool: {
                    must: [
                        { match: { field: 'name', value: 'smartphone' } },
                        { term: { field: 'category', value: 'electronics' } },
                        { range: { field: 'price', gte: 200, lte: 800 } }
                    ]
                }
            });
            console.log('  Boolean must results:', boolResults.hits.length, boolResults.hits.map(h => h.id));

            const results = searchEngine.search({
                bool: {
                    must: [
                        { match: { field: 'name', value: 'smartphone' } },
                        { term: { field: 'category', value: 'electronics' } },
                        { range: { field: 'price', gte: 200, lte: 800 } }
                    ],
                    should: [
                        { match: { field: 'brand', value: 'apple' } },
                        { match: { field: 'features', value: 'wireless charging' } }
                    ],
                    must_not: [
                        { term: { field: 'status', value: 'out_of_stock' } }
                    ]
                }
            });

            console.log('🔍 DEBUG: Search results:', results);
            console.log('🔍 DEBUG: Number of hits:', results.hits.length);
            
            // Debug: Check what documents are in the index
            console.log('🔍 DEBUG: All documents in index:');
            for (const [id, doc] of searchEngine.indices.default.documents) {
                console.log(`  - ${id}:`, doc);
            }

            // Should match smartphones in price range, in stock, with preference for Apple/wireless charging
            expect(results.hits.length >= 2).toBeTruthy();

            // Verify no out of stock items
            const statuses = results.hits.map(h => h.status);
            expect(statuses).not.toContain('out_of_stock');

            // Verify price range
            const prices = results.hits.map(h => h.price);
            expect(prices.every(p => p >= 200 && p <= 800)).toBeTruthy();
        });

        test('Location-Based Restaurant Search', () => {
            // Setup restaurants
            searchEngine.add({ id: 'rest1', name: 'Mama Mia Pizza', type: 'restaurant', location: [40.7128, -74.0060], cuisine: 'italian', rating: 4.5 });
            searchEngine.add({ id: 'rest2', name: 'Sushi Bar', type: 'restaurant', location: [40.7589, -73.9851], cuisine: 'japanese', rating: 4.2 });
            searchEngine.add({ id: 'rest3', name: 'Italian Bistro', type: 'restaurant', location: [40.7505, -73.9934], cuisine: 'italian', rating: 3.8 });
            searchEngine.add({ id: 'rest4', name: 'Fast Food Joint', type: 'restaurant', location: [41.0000, -74.0000], cuisine: 'american', rating: 2.5 });

            const results = searchEngine.search({
                bool: {
                    must: [
                        { match: { field: 'type', value: 'restaurant' } },
                        {
                            geo_distance: {
                                field: 'location',
                                center: { lat: 40.7128, lon: -74.0060 },
                                distance: 5 // 5km radius
                            }
                        }
                    ],
                    should: [
                        { match: { field: 'cuisine', value: 'italian' } },
                        { range: { field: 'rating', gte: 4.0 } }
                    ]
                }
            });

            // Should find restaurants within 5km with preference for Italian/high rating
            expect(results.hits.length >= 1).toBeTruthy();

            // Verify all are restaurants
            const types = results.hits.map(h => h.type);
            expect(types.every(t => t === 'restaurant')).toBeTruthy();
        });

        test('Content Search with Fuzzy Matching', () => {
            // Setup content
            searchEngine.add({ id: 'art1', title: 'Machine Learning Fundamentals', content: 'Introduction to artificial intelligence and ML algorithms' });
            searchEngine.add({ id: 'art2', title: 'Deep Learning Guide', content: 'Neural networks and artificial intelligence applications' });
            searchEngine.add({ id: 'art3', title: 'AI Ethics', content: 'Responsible artificial intelligence development' });
            searchEngine.add({ id: 'art4', title: 'Data Science Basics', content: 'Statistics and data analysis fundamentals' });

            const results = searchEngine.search({
                bool: {
                    should: [
                        { match: { field: 'title', value: 'machine learning' } },
                        { fuzzy: { field: 'title', value: 'machne learing', fuzziness: 2 } },
                        { match_phrase: { field: 'content', value: 'artificial intelligence' } }
                    ]
                }
            });

            // Should match articles with ML, fuzzy ML matches, or AI content
            expect(results.hits.length >= 3).toBeTruthy();

            // Should include the ML article and AI articles
            const ids = results.hits.map(h => h.id);
            expect(ids).toContain('art1'); // Machine Learning
            expect(ids).toContain('art2'); // Has "artificial intelligence"
            expect(ids).toContain('art3'); // Has "artificial intelligence"
        });
    });

    describe('Boolean Logic Combinations', () => {
        beforeEach(async () => {
            searchEngine.add({ id: 'fruit1', name: 'organic red apple', category: 'fruit', price: 2.5 });
            searchEngine.add({ id: 'fruit2', name: 'regular green apple', category: 'fruit', price: 1.5 });
            searchEngine.add({ id: 'fruit3', name: 'organic banana', category: 'fruit', price: 1.8 });
            searchEngine.add({ id: 'veg1', name: 'organic carrot', category: 'vegetable', price: 1.2 });
        });

        test('should handle boosting with should (must + should combination)', () => {
            const results = searchEngine.search({
                bool: {
                    must: [
                        { term: { field: 'category', value: 'fruit' } }
                    ],
                    should: [
                        { match: { field: 'name', value: 'organic' } } // Should boost organic fruits
                    ]
                }
            });

            // Should return all fruits, but organic ones should score higher
            expect(results.hits.length).toBe(3);

            // Verify all are fruits
            const categories = results.hits.map(h => h.category);
            expect(categories.every(c => c === 'fruit')).toBeTruthy();

            // Organic fruits should have higher scores (appear first)
            const firstResult = results.hits[0];
            expect(firstResult.name).toContain('organic');
        });

        test('should handle complex must_not exclusions', () => {
            const results = searchEngine.search({
                bool: {
                    must: [
                        { match: { field: 'name', value: 'apple' } }
                    ],
                    must_not: [
                        { term: { field: 'category', value: 'vegetable' } },
                        { range: { field: 'price', gte: 2.0 } }
                    ]
                }
            });

            // Should find apples that are not vegetables and cost less than $2.00
            expect(results.hits.length).toBe(1); // Only regular green apple
            expect(results.hits[0].id).toBe('fruit2');
        });
    });

    describe('Context Options', () => {
        beforeEach(async () => {
            searchEngine.add({ id: 'ctx1', name: 'red apple fruit' });
            searchEngine.add({ id: 'ctx2', name: 'green apple vegetable' });
            searchEngine.add({ id: 'ctx3', name: 'blue berry fruit' });
        });

        test('should handle OR logic override', () => {
            const results = searchEngine.search('apple berry', {
                operator: 'or'
            });

            // With OR logic, should match documents containing either "apple" OR "berry"
            expect(results.hits.length).toBe(3); // All documents match either term
            const ids = results.hits.map(h => h.id).sort();
            expect(ids).toEqual(['ctx1', 'ctx2', 'ctx3']);
        });

        test('should handle AND logic (default)', () => {
            const results = searchEngine.search('apple fruit');

            // With AND logic (default), should match documents containing both terms
            expect(results.hits.length).toBe(1); // Only ctx1 has both "apple" and "fruit"
            expect(results.hits[0].id).toBe('ctx1');
        });

        test('should handle pagination with complex queries', () => {
            // Add more documents for pagination
            for (let i = 4; i <= 15; i++) {
                searchEngine.add({ id: `ctx${i}`, name: `apple item ${i}` });
            }

            const page1 = searchEngine.search('apple', { from: 0, size: 5 });
            const page2 = searchEngine.search('apple', { from: 5, size: 5 });
            const page3 = searchEngine.search('apple', { from: 10, size: 5 });

            expect(page1.hits.length).toBe(5);
            expect(page2.hits.length).toBe(5);
            expect(page3.hits.length >= 2).toBeTruthy(); // At least ctx1, ctx2, plus some from the loop

            // Verify pagination metadata
            expect(page1.from).toBe(0);
            expect(page1.size).toBe(5);
            expect(page2.from).toBe(5);
            expect(page2.size).toBe(5);

            // Verify no overlap between pages
            const page1Ids = page1.hits.map(h => h.id);
            const page2Ids = page2.hits.map(h => h.id);
            const overlap = page1Ids.filter(id => page2Ids.includes(id));
            expect(overlap.length).toBe(0);
        });
    });

    describe('Multi-field Match Queries', () => {
        beforeEach(async () => {
            searchEngine.add({ id: 'multi1', name: 'laptop computer', description: 'powerful gaming machine' });
            searchEngine.add({ id: 'multi2', name: 'desktop computer', description: 'office productivity tool' });
            searchEngine.add({ id: 'multi3', name: 'tablet device', description: 'portable computer for travel' });
        });

        test('should search across multiple fields with should clauses', () => {
            const results = searchEngine.search({
                bool: {
                    should: [
                        { match: { field: 'name', value: 'computer' } },
                        { match: { field: 'description', value: 'computer' } }
                    ]
                }
            });

            // Should match documents where either name or description contains "computer"
            expect(results.hits.length).toBe(3); // All have "computer" in name or description
            const ids = results.hits.map(h => h.id).sort();
            expect(ids).toEqual(['multi1', 'multi2', 'multi3']);
        });

        test('should handle field-specific term matching', () => {
            const results = searchEngine.search({
                bool: {
                    must: [
                        { match: { field: 'name', value: 'laptop' } },
                        { match: { field: 'description', value: 'gaming' } }
                    ]
                }
            });

            // Should match only documents where name contains "laptop" AND description contains "gaming"
            expect(results.hits.length).toBe(1);
            expect(results.hits[0].id).toBe('multi1');
        });
    });
}); 