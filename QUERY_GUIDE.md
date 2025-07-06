# Search Engine Query Guide

This guide covers all available query types in the search engine using the unified syntax where all queries consistently use `field` + `value` parameters.

## Basic Query Structure

All queries follow this basic structure:
```javascript
const results = searchEngine.search({
    bool: {
        must: [/* required clauses */],
        should: [/* optional clauses */],
        must_not: [/* exclusion clauses */]
    }
});
```

## Query Types

### 1. Match Query
Performs full-text search with tokenization and analysis.

```javascript
// Basic match query
const results = searchEngine.search({
    bool: {
        must: [
            { match: { field: 'name', value: 'hello world' } }
        ]
    }
});

// Multi-field match
const results = searchEngine.search({
    bool: {
        should: [
            { match: { field: 'name', value: 'search term' } },
            { match: { field: 'description', value: 'search term' } }
        ]
    }
});
```

**Use cases:**
- Full-text search across text fields
- Natural language queries
- Multi-word searches with tokenization

### 2. Term Query
Performs exact term matching without tokenization.

```javascript
// Exact term match
const results = searchEngine.search({
    bool: {
        must: [
            { term: { field: 'status', value: 'active' } }
        ]
    }
});

// Multiple exact terms
const results = searchEngine.search({
    bool: {
        must: [
            { term: { field: 'category', value: 'electronics' } },
            { term: { field: 'status', value: 'available' } }
        ]
    }
});
```

**Use cases:**
- Keyword field searches
- Status/category filtering
- Exact value matching

### 3. Prefix Query
Matches documents where the field value starts with the specified prefix.

```javascript
// Basic prefix search
const results = searchEngine.search({
    bool: {
        must: [
            { prefix: { field: 'name', value: 'app' } }
        ]
    }
});

// Case-insensitive prefix search
const results = searchEngine.search({
    bool: {
        must: [
            { prefix: { field: 'name', value: 'APP' } }
        ]
    }
});
```

**Use cases:**
- Auto-complete functionality
- Name/title suggestions
- Hierarchical category filtering

### 4. Wildcard Query
Supports pattern matching with `*` (multiple characters) and `?` (single character).

```javascript
// Prefix wildcard
const results = searchEngine.search({
    bool: {
        must: [
            { wildcard: { field: 'name', value: 'app*' } }
        ]
    }
});

// Suffix wildcard
const results = searchEngine.search({
    bool: {
        must: [
            { wildcard: { field: 'name', value: '*ing' } }
        ]
    }
});

// Single character wildcard
const results = searchEngine.search({
    bool: {
        must: [
            { wildcard: { field: 'name', value: 'c?t' } }
        ]
    }
});

// Complex patterns
const results = searchEngine.search({
    bool: {
        must: [
            { wildcard: { field: 'email', value: '*@example.com' } }
        ]
    }
});
```

**Use cases:**
- Pattern-based searching
- Email domain filtering
- File extension matching
- Flexible text matching

### 5. Fuzzy Query
Finds documents with terms similar to the search term (handles typos).

```javascript
// Basic fuzzy search
const results = searchEngine.search({
    bool: {
        must: [
            { fuzzy: { field: 'name', value: 'documnt', fuzziness: 2 } }
        ]
    }
});

// Default fuzziness (2)
const results = searchEngine.search({
    bool: {
        must: [
            { fuzzy: { field: 'name', value: 'helo' } }
        ]
    }
});
```

**Parameters:**
- `fuzziness`: Maximum edit distance (default: 2)

**Use cases:**
- Typo tolerance
- Approximate matching
- User-friendly search

### 6. Range Query
Matches documents with field values within a specified range.

```javascript
// Numeric range
const results = searchEngine.search({
    bool: {
        must: [
            { range: { field: 'price', gte: 10, lte: 100 } }
        ]
    }
});

// String range (alphabetical)
const results = searchEngine.search({
    bool: {
        must: [
            { range: { field: 'name', gte: 'a', lte: 'm' } }
        ]
    }
});

// Open-ended ranges
const results = searchEngine.search({
    bool: {
        must: [
            { range: { field: 'price', gte: 50 } }  // >= 50
        ]
    }
});

const results = searchEngine.search({
    bool: {
        must: [
            { range: { field: 'price', lte: 200 } }  // <= 200
        ]
    }
});
```

**Parameters:**
- `gte`: Greater than or equal to
- `lte`: Less than or equal to

**Use cases:**
- Price filtering
- Date ranges
- Numeric filtering
- Alphabetical ranges

### 7. Geo Distance Query
Finds documents within a specified distance from a geographic point.

```javascript
// Basic geo distance
const results = searchEngine.search({
    bool: {
        must: [
            {
                geo_distance: {
                    field: 'location',
                    center: { lat: 40.7128, lon: -74.0060 },
                    distance: 10  // kilometers
                }
            }
        ]
    }
});

// Multiple geo constraints
const results = searchEngine.search({
    bool: {
        must: [
            {
                geo_distance: {
                    field: 'location',
                    center: { lat: 51.5074, lon: -0.1278 },
                    distance: 5
                }
            }
        ]
    }
});
```

**Parameters:**
- `center`: Object with `lat` and `lon` coordinates
- `distance`: Distance in kilometers

**Use cases:**
- Location-based search
- "Near me" functionality
- Geographic filtering

### 8. Match Phrase Query
Matches exact phrases with optional word distance tolerance.

```javascript
// Exact phrase match
const results = searchEngine.search({
    bool: {
        must: [
            { match_phrase: { field: 'description', value: 'quick brown fox' } }
        ]
    }
});

// Phrase with slop (word distance tolerance)
const results = searchEngine.search({
    bool: {
        must: [
            { match_phrase: { field: 'description', value: 'quick fox', slop: 1 } }
        ]
    }
});
```

**Parameters:**
- `slop`: Maximum number of intervening words allowed (default: 0)

**Use cases:**
- Exact phrase searching
- Quote searches
- Flexible phrase matching

### 9. Phrase Query
Alternative phrase matching with slop support.

```javascript
// Basic phrase query
const results = searchEngine.search({
    bool: {
        must: [
            { phrase: { field: 'content', value: 'hello world' } }
        ]
    }
});

// Phrase with slop
const results = searchEngine.search({
    bool: {
        must: [
            { phrase: { field: 'content', value: 'hello world', slop: 2 } }
        ]
    }
});
```

**Use cases:**
- Alternative to match_phrase
- Phrase-based searching
- Content analysis

## Boolean Logic

### Must Clauses (AND)
All must clauses must match for a document to be included.

```javascript
const results = searchEngine.search({
    bool: {
        must: [
            { term: { field: 'status', value: 'active' } },
            { match: { field: 'name', value: 'product' } },
            { range: { field: 'price', gte: 10, lte: 100 } }
        ]
    }
});
```

### Should Clauses (OR)
At least one should clause should match. Used for scoring when combined with must.

```javascript
// OR logic
const results = searchEngine.search({
    bool: {
        should: [
            { match: { field: 'name', value: 'apple' } },
            { match: { field: 'name', value: 'orange' } },
            { match: { field: 'name', value: 'banana' } }
        ]
    }
});

// Boosting with should (when combined with must)
const results = searchEngine.search({
    bool: {
        must: [
            { term: { field: 'category', value: 'fruit' } }
        ],
        should: [
            { match: { field: 'name', value: 'organic' } }  // Boosts organic fruits
        ]
    }
});
```

### Must Not Clauses (NOT)
Documents matching must_not clauses are excluded.

```javascript
const results = searchEngine.search({
    bool: {
        must: [
            { match: { field: 'name', value: 'phone' } }
        ],
        must_not: [
            { term: { field: 'status', value: 'discontinued' } },
            { range: { field: 'price', gte: 1000 } }
        ]
    }
});
```

## Complex Query Examples

### E-commerce Product Search
```javascript
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
```

### Location-Based Restaurant Search
```javascript
const results = searchEngine.search({
    bool: {
        must: [
            { match: { field: 'type', value: 'restaurant' } },
            {
                geo_distance: {
                    field: 'location',
                    center: { lat: 40.7128, lon: -74.0060 },
                    distance: 5
                }
            }
        ],
        should: [
            { match: { field: 'cuisine', value: 'italian' } },
            { range: { field: 'rating', gte: 4.0 } }
        ]
    }
});
```

### Content Search with Fuzzy Matching
```javascript
const results = searchEngine.search({
    bool: {
        should: [
            { match: { field: 'title', value: 'machine learning' } },
            { fuzzy: { field: 'title', value: 'machne learing', fuzziness: 2 } },
            { match_phrase: { field: 'content', value: 'artificial intelligence' } }
        ]
    }
});
```

## Search Context Options

### Pagination
```javascript
const results = searchEngine.search(query, {
    from: 0,    // Starting index
    size: 10    // Number of results
});
```

### OR Logic Override
```javascript
const results = searchEngine.search(query, {
    operator: 'or'  // Changes default AND behavior to OR
});
```

## Best Practices

1. **Use appropriate query types:**
   - `match` for full-text search
   - `term` for exact matching
   - `prefix` for auto-complete
   - `wildcard` for pattern matching
   - `range` for numeric/date filtering

2. **Combine query types effectively:**
   - Use `must` for required conditions
   - Use `should` for optional scoring boosts
   - Use `must_not` for exclusions

3. **Performance considerations:**
   - Prefer `term` over `match` for exact matches
   - Use `prefix` instead of `wildcard` when possible
   - Limit fuzzy query fuzziness values

4. **Field-specific queries:**
   - Use `term` queries for keyword fields
   - Use `match` queries for text fields
   - Use `range` queries for numeric fields
   - Use `geo_distance` for location fields

This unified syntax ensures consistency across all query types while providing powerful search capabilities for various use cases. 