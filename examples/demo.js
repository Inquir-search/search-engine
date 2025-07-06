#!/usr/bin/env node

import { createSearchEngine, SearchEngine } from '../src/index.js';

console.log('🔍 Advanced Search Engine Demo\n');

// Example 1: Using the convenience function
console.log('Example 1: Quick Setup with createSearchEngine()');
const searchEngine = createSearchEngine({
    mappings: {
        title: { type: 'text' },
        content: { type: 'text' },
        category: { type: 'keyword' },
        price: { type: 'float' },
        location: { type: 'geo_point' }
    },
    stopwords: ['the', 'a', 'an'],
    facetFields: ['category']
});

// Add sample documents
searchEngine.add({ id: '1', title: 'iPhone 15', content: 'Latest smartphone with advanced camera', category: 'electronics', price: 999 });
searchEngine.add({ id: '2', title: 'MacBook Pro', content: 'Professional laptop for developers', category: 'electronics', price: 2499 });
searchEngine.add({ id: '3', title: 'Coffee Mug', content: 'Ceramic mug for hot beverages', category: 'kitchen', price: 15.99 });
searchEngine.add({ id: '4', title: 'Wireless Headphones', content: 'Noise-canceling bluetooth headphones', category: 'electronics', price: 299 });

// Example searches
console.log('\n--- Basic Text Search ---');
let results = searchEngine.search({
    bool: {
        must: [
            { match: { field: 'content', value: 'smartphone camera' } }
        ]
    }
});
console.log('Search for "smartphone camera":', results.hits.map(h => ({ id: h.id, title: h.title, score: h.score ? h.score.toFixed(2) : 'N/A' })));

console.log('\n--- Fuzzy Search ---');
results = searchEngine.search({
    bool: {
        must: [
            { fuzzy: { field: 'title', value: 'iPhon', fuzziness: 1 } }
        ]
    }
});
console.log('Fuzzy search for "iPhon":', results.hits.map(h => ({ id: h.id, title: h.title })));

console.log('\n--- Range Query ---');
results = searchEngine.search({
    bool: {
        must: [
            { range: { field: 'price', gte: 100, lte: 500 } }
        ]
    }
});
console.log('Price range $100-$500:', results.hits.map(h => ({ id: h.id, title: h.title, price: h.price })));

console.log('\n--- Faceted Search ---');
results = searchEngine.search({
    bool: {
        must: [
            { match: { field: 'content', value: 'electronic' } }
        ]
    }
}, { facets: ['category'] });
console.log('Electronics search with facets:');
console.log('Results:', results.hits.map(h => ({ id: h.id, title: h.title })));
console.log('Facets:', results.facets);

console.log('\n--- Complex Boolean Query ---');
results = searchEngine.search({
    bool: {
        should: [
            { match: { field: 'title', value: 'phone' } },
            { match: { field: 'title', value: 'laptop' } }
        ],
        must: [
            { term: { field: 'category', value: 'electronics' } }
        ],
        must_not: [
            { range: { field: 'price', gt: 1000 } }
        ]
    }
});
console.log('Complex query (phone OR laptop) AND electronics AND price <= $1000:');
console.log('Results:', results.hits.map(h => ({ id: h.id, title: h.title, price: h.price })));

// Example 2: Using individual classes for advanced configuration
console.log('\n\nExample 2: Advanced Configuration');

import { 
    BM25Scorer, 
    InvertedIndex, 
    MappingsManager, 
    Tokenizer, 
    StopwordsManager,
    RankingPipeline,
    SynonymEngine
} from '../src/index.js';

const stopwordsManager = new StopwordsManager({ get: () => ['the', 'a', 'an', 'and'], autoSave: false });
const mappingsManager = new MappingsManager(null);
mappingsManager.setMapping('description', { type: 'text' });

const customSearchEngine = new SearchEngine({
    tokenizer: new Tokenizer(stopwordsManager),
    scorerFactory: (totalDocs, avgDocLength, docLengths, invertedIndex) => 
        new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex),
    invertedIndex: new InvertedIndex(),
    rankingPipeline: new RankingPipeline(),
    stopwordsManager,
    synonymEngine: new SynonymEngine(),
    mappingsManager
});

customSearchEngine.add({ id: 'doc1', description: 'The quick brown fox jumps over the lazy dog' });
customSearchEngine.add({ id: 'doc2', description: 'A fast brown animal leaps over a sleepy canine' });

console.log('\n--- Stopwords Filtering ---');
results = customSearchEngine.search({
    bool: {
        must: [
            { match: { field: 'description', value: 'the quick fox' } }
        ]
    }
});
console.log('Search with stopwords removed:', results.hits.map(h => ({ id: h.id, score: h.score ? h.score.toFixed(2) : 'N/A' })));

console.log('\n🎉 Demo completed! Check out the comprehensive tests for more examples.');

// Show library stats
console.log('\n📊 Library Information:');
console.log('- Total documents indexed:', searchEngine.getStats?.() || 'Stats not available');
console.log('- Query types supported: match, term, prefix, wildcard, fuzzy, range, match_phrase, phrase, geo_distance');
console.log('- Features: BM25 scoring, faceted search, geo queries, boolean logic, pagination'); 