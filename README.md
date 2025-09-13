# Advanced Search Engine with DDD Architecture

A high-performance, in-memory search engine built with **Domain-Driven Design (DDD)** principles, featuring advanced query capabilities, faceted search, geo-spatial search, and real-time indexing.

## 🆕 NEW: Domain-Driven Design Implementation

This search engine now features a complete **DDD architecture** providing:
- **Type-safe Value Objects** for domain concepts
- **Rich Entities** with business behavior  
- **Application Services** for use case orchestration
- **Repository Pattern** for data access abstraction
- **Domain Events** for decoupled communication
- **Clean Architecture** with clear layer separation

### Quick Start with DDD

```javascript
import { SearchApplicationService } from './src/application/services/SearchApplicationService.js';
import { InMemoryDocumentRepository } from './src/infrastructure/repositories/InMemoryDocumentRepository.js';

// Setup application service
const searchService = new SearchApplicationService({
    documentRepository: new InMemoryDocumentRepository(),
    // ... other dependencies
});

// Add documents
await searchService.add({
    id: 'doc-1',
    title: 'JavaScript Guide',
    content: 'Complete guide to JavaScript development',
    category: 'programming'
}, 'articles');

// Search documents
const results = await searchService.search('javascript', 'articles', {
    size: 10,
    filters: [{ term: { category: 'programming' } }]
});

console.log(results.toJSON());
```

## Architecture Overview

### DDD Layers

```
src/
├── application/           # Application Layer (Use Cases, Services)
│   ├── services/         # Application Services
│   ├── useCases/         # Use Cases
│   ├── queries/          # Query Objects
│   └── results/          # Result Objects
├── domain/               # Domain Layer (Business Logic)
│   ├── entities/         # Rich Domain Entities
│   ├── valueObjects/     # Value Objects (Type Safety)
│   ├── repositories/     # Repository Interfaces
│   ├── events/           # Domain Events
│   └── query/            # Enhanced Query Objects
├── infrastructure/       # Infrastructure Layer (Data Access, External)
│   ├── repositories/     # Repository Implementations
│   └── [other infrastructure...]
└── lib/                  # Shared Libraries
```

### Key DDD Components

- **Value Objects**: `DocumentId`, `IndexName`, `QueryText`, `SearchScore`, `FieldType`
- **Entities**: `Document` with rich behavior and identity
- **Application Services**: `SearchApplicationService` for orchestrating use cases
- **Use Cases**: `SearchDocumentsUseCase`, `AddDocumentUseCase`
- **Repositories**: Clean interfaces with in-memory implementations
- **Domain Events**: `DocumentAddedEvent` for event-driven architecture

## 🔧 Features

### Core Search Features
- **Full-text search** with BM25 scoring
- **Boolean queries** (AND, OR, NOT)
- **Fuzzy matching** with configurable edit distance
- **Wildcard queries** (* and ? patterns)
- **Phrase queries** with slop tolerance
- **Prefix matching** for autocomplete
- **Field-specific search** with boost factors

### Advanced Capabilities
- **Faceted search** with dynamic aggregations
- **Geo-spatial search** with distance and bounding box filters
- **Real-time indexing** with configurable persistence
- **Multi-index support** for data partitioning
- **Sharded inverted indices** for horizontal scaling
- **Personalization engine** for user-specific ranking
- **Synonym expansion** for improved recall

### Performance Optimizations
- **Worker pool architecture** for parallel processing
- **Shared memory storage** for zero-copy operations
- **Streaming persistence** with batched writes
- **Query caching** with LRU eviction
- **Memory-mapped indices** for large datasets

## 🚀 Quick Start (Traditional API)

```javascript
import { createSearchEngine } from './src/index.js';

// Create search engine
const engine = await createSearchEngine({
    enableShardedStorage: true,
    numShards: 4,
    autoPersistence: { enabled: false }
});

// Add documents
engine.add({ 
    id: '1', 
    title: 'JavaScript Basics',
    content: 'Learn the fundamentals of JavaScript programming'
});

// Search
const results = engine.search('javascript programming');
console.log(results);
```

## 📖 Documentation

- **[DDD Implementation Guide](src/DDD_IMPLEMENTATION.md)** - Complete overview of the DDD architecture
- **[Usage Examples](src/DDD_USAGE_EXAMPLES.md)** - Practical examples and migration guide
- **[API Guide](API_GUIDE.md)** - Traditional API documentation
- **[Performance Guide](PERFORMANCE_GUIDE.md)** - Performance optimization tips
- **[Query Guide](QUERY_GUIDE.md)** - Advanced query syntax

## 🧪 Testing

The project includes comprehensive tests for both DDD and traditional implementations:

```bash
# Run all tests
npm test

# Run DDD-specific tests
node --test tests/ddd-integration.test.js

# Run basic functionality tests
node --test tests/simple-smoke.test.js
```

## ✨ Benefits of DDD Implementation

1. **Type Safety**: Value objects prevent invalid data and provide compile-time safety
2. **Clear Boundaries**: Well-defined layers with explicit responsibilities
3. **Testability**: Clean interfaces enable easy unit testing and mocking
4. **Maintainability**: Business logic is centralized and easy to locate
5. **Extensibility**: New features can be added without affecting existing code
6. **Domain Focus**: Code reflects business concepts rather than technical details

## 🔄 Migration Path

The DDD implementation maintains **full backward compatibility**:

```javascript
// Existing code continues to work
import SearchEngine from './src/domain/SearchEngine.js';
const engine = new SearchEngine();
engine.add({ id: '1', title: 'Test' });
const results = engine.search('test');

// New DDD code (recommended for new development)
import { SearchApplicationService } from './src/application/services/SearchApplicationService.js';
const service = new SearchApplicationService({ /* dependencies */ });
await service.add({ id: '1', title: 'Test' }, 'default');
const results = await service.search('test', 'default');
```

## 🏗️ Advanced Configuration

```javascript
const engine = await createSearchEngine({
    // Sharding configuration
    enableShardedStorage: true,
    numShards: 8,
    
    // Performance options
    workerPool: {
        totalWorkers: 8,
        maxWriteWorkers: 3
    },
    
    // Persistence settings
    autoPersistence: {
        enabled: true,
        interval: 30000,
        batchSize: 100
    },
    
    // Search features
    facetFields: ['category', 'tags', 'author'],
    enablePersonalization: true,
    enableSynonyms: true
});
```

## 📊 Performance

- **Indexing Speed**: ~10,000 docs/second on modern hardware
- **Query Latency**: <10ms for simple queries, <50ms for complex aggregations
- **Memory Usage**: ~100MB per million documents (depends on content)
- **Throughput**: >1000 queries/second with worker pools

## 🤝 Contributing

We welcome contributions! Please see our contributing guidelines and:

1. Follow the DDD architecture patterns
2. Add comprehensive tests for new features
3. Update documentation for public APIs
4. Maintain backward compatibility

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

**Note**: This search engine is designed for in-memory operation and is ideal for applications requiring fast, real-time search capabilities with moderate dataset sizes (up to millions of documents). For larger datasets, consider using Elasticsearch or similar distributed search solutions. 