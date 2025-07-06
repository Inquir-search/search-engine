# Advanced Search Engine

A high-performance, full-featured search engine for Node.js with BM25 scoring, fuzzy search, geo-distance queries, and unified query syntax.

## Features

- 🔍 **Full-text search** with BM25 scoring algorithm
- 🎯 **9 query types**: match, term, prefix, wildcard, fuzzy, range, match_phrase, phrase, geo_distance
- 🧠 **Boolean logic**: complex queries with must, should, must_not
- 📍 **Geo-spatial queries** with distance-based filtering
- 🏷️ **Faceted search** for aggregations and filtering
- 🔤 **Fuzzy matching** with configurable edit distance
- 📄 **Pagination** support
- 🛑 **Stopwords filtering**
- 📊 **Real-time indexing** with inverted index
- 🎚️ **Configurable tokenization**

## Installation

```bash
npm install @inquir/search-engine
```

## Quick Start

```javascript
import { createSearchEngine } from '@inquir/search-engine';

// Create search engine with field mappings
const searchEngine = createSearchEngine({
    mappings: {
        title: { type: 'text' },
        content: { type: 'text' },
        category: { type: 'keyword' },
        price: { type: 'float' }
    }
});

// Add documents
searchEngine.add({ id: '1', title: 'iPhone 15', content: 'Latest smartphone', category: 'electronics', price: 999 });
searchEngine.add({ id: '2', title: 'MacBook Pro', content: 'Professional laptop', category: 'electronics', price: 2499 });

// Search
const results = searchEngine.search({
    bool: {
        must: [
            { match: { field: 'content', value: 'smartphone' } }
        ]
    }
});

console.log(results.hits); // Array of matching documents with scores
```

## API Reference

### Classes

#### `SearchEngine`
The main search engine class.

**Constructor Options:**
```javascript
new SearchEngine({
    tokenizer,           // Tokenizer instance
    scorerFactory,       // Function that creates BM25Scorer
    invertedIndex,       // InvertedIndex instance
    rankingPipeline,     // RankingPipeline instance
    stopwordsManager,    // StopwordsManager instance
    synonymEngine,       // SynonymEngine instance
    facetFields,         // Array of fields for faceting
    mappingsManager      // MappingsManager instance
})
```

**Methods:**
- `add(document)` - Add a document to the index
- `search(query, options)` - Search the index
- `remove(id)` - Remove a document by ID
- `update(id, document)` - Update a document
- `clear()` - Clear all documents

### Query Types

#### 1. Match Query
Full-text search with tokenization and scoring.

```javascript
{ match: { field: 'title', value: 'search terms' } }
```

#### 2. Term Query
Exact term matching (no tokenization).

```javascript
{ term: { field: 'category', value: 'electronics' } }
```

#### 3. Prefix Query
Matches terms that start with the given prefix.

```javascript
{ prefix: { field: 'title', value: 'phone' } }
```

#### 4. Wildcard Query
Pattern matching with `*` and `?` wildcards.

```javascript
{ wildcard: { field: 'title', value: 'iPh*ne' } }
```

#### 5. Fuzzy Query
Finds terms within edit distance.

```javascript
{ fuzzy: { field: 'title', value: 'iphone', fuzziness: 1 } }
```

#### 6. Range Query
Numeric or alphabetical range filtering.

```javascript
{ range: { field: 'price', gte: 100, lte: 500 } }
```

#### 7. Match Phrase Query
Exact phrase matching with configurable slop.

```javascript
{ match_phrase: { field: 'content', value: 'quick brown fox', slop: 1 } }
```

#### 8. Phrase Query
Multi-term phrase matching.

```javascript
{ phrase: { field: 'content', value: 'quick brown fox', slop: 0 } }
```

#### 9. Geo Distance Query
Geographic distance filtering.

```javascript
{ geo_distance: { 
    field: 'location', 
    center: { lat: 40.7128, lon: -74.0060 }, 
    distance: '10km' 
} }
```

### Boolean Queries

Combine multiple queries with boolean logic:

```javascript
{
    bool: {
        must: [          // All must match (AND)
            { match: { field: 'title', value: 'phone' } }
        ],
        should: [        // At least one should match (OR)
            { term: { field: 'brand', value: 'apple' } },
            { term: { field: 'brand', value: 'samsung' } }
        ],
        must_not: [      // None must match (NOT)
            { range: { field: 'price', gt: 1000 } }
        ]
    }
}
```

### Search Options

```javascript
searchEngine.search(query, {
    from: 0,           // Pagination offset
    size: 10,          // Number of results
    facets: ['category', 'brand'],  // Facet fields
    useOr: false       // Use OR logic for multiple terms
});
```

### Convenience Functions

#### `createSearchEngine(options)`
Quick setup with sensible defaults.

```javascript
const searchEngine = createSearchEngine({
    mappings: {
        title: { type: 'text' },
        category: { type: 'keyword' },
        price: { type: 'float' },
        location: { type: 'geo_point' }
    },
    stopwords: ['the', 'a', 'an'],
    facetFields: ['category'],
    autoSave: true
});
```

## Field Types

- **`text`** - Full-text searchable fields (tokenized)
- **`keyword`** - Exact-match fields (not tokenized)
- **`float`** - Floating-point numbers
- **`integer`** - Integer numbers
- **`boolean`** - Boolean values
- **`date`** - Date values
- **`geo_point`** - Geographic coordinates `[lat, lon]`

## Examples

### E-commerce Product Search

```javascript
const productSearch = createSearchEngine({
    mappings: {
        name: { type: 'text' },
        description: { type: 'text' },
        category: { type: 'keyword' },
        brand: { type: 'keyword' },
        price: { type: 'float' },
        rating: { type: 'float' }
    },
    facetFields: ['category', 'brand']
});

// Search for smartphones under $800 with high ratings
const results = productSearch.search({
    bool: {
        must: [
            { match: { field: 'name', value: 'smartphone' } },
            { range: { field: 'price', lte: 800 } },
            { range: { field: 'rating', gte: 4.0 } }
        ]
    }
}, { 
    facets: ['category', 'brand'],
    size: 20 
});
```

### Location-based Restaurant Search

```javascript
const restaurantSearch = createSearchEngine({
    mappings: {
        name: { type: 'text' },
        cuisine: { type: 'keyword' },
        location: { type: 'geo_point' },
        rating: { type: 'float' }
    }
});

// Find Italian restaurants within 5km
const results = restaurantSearch.search({
    bool: {
        must: [
            { term: { field: 'cuisine', value: 'italian' } },
            { geo_distance: { 
                field: 'location', 
                center: { lat: 40.7128, lon: -74.0060 }, 
                distance: '5km' 
            } }
        ]
    }
});
```

### Content Management System

```javascript
const cmsSearch = createSearchEngine({
    mappings: {
        title: { type: 'text' },
        content: { type: 'text' },
        tags: { type: 'keyword' },
        status: { type: 'keyword' },
        publishDate: { type: 'date' }
    }
});

// Complex content search with fuzzy matching
const results = cmsSearch.search({
    bool: {
        should: [
            { match: { field: 'title', value: 'javascript tutorial' } },
            { fuzzy: { field: 'title', value: 'javascript', fuzziness: 1 } },
            { match: { field: 'content', value: 'node.js programming' } }
        ],
        must: [
            { term: { field: 'status', value: 'published' } }
        ],
        must_not: [
            { term: { field: 'tags', value: 'deprecated' } }
        ]
    }
});
```

## Performance

- **Indexing**: O(log n) average case with inverted index
- **Search**: O(k log n) where k is the number of matching terms
- **Memory**: Efficient inverted index structure
- **Scoring**: Optimized BM25 algorithm

## Testing

```bash
npm test                    # Run all tests
npm run test:integration   # Integration tests
npm run test:comprehensive # Comprehensive query tests
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

---

**Need help?** Check out the [examples](examples/) directory or run `npm run demo` to see the search engine in action! 