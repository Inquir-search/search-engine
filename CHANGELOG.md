# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-01-XX

### Added
- Initial release of Advanced Search Engine
- BM25 scoring algorithm for relevance ranking
- 9 comprehensive query types:
  - Match query for full-text search
  - Term query for exact matching
  - Prefix query for prefix matching
  - Wildcard query with * and ? patterns
  - Fuzzy query with configurable edit distance
  - Range query for numeric/alphabetical ranges
  - Match phrase query for exact phrase matching
  - Phrase query for multi-term phrases
  - Geo distance query for location-based search
- Boolean logic with must, should, must_not clauses
- Faceted search for aggregations
- Real-time indexing with inverted index
- Configurable tokenization and stopwords filtering
- Pagination support
- Unified query syntax across all query types
- Comprehensive test suite with 270+ tests
- Type definitions for TypeScript support
- Examples and demo scripts

### Features
- High-performance inverted index structure
- Configurable BM25 parameters
- Geographic distance calculations with Haversine formula
- Levenshtein distance for fuzzy matching
- Regex pattern matching for wildcards
- Memory-efficient document storage
- Field mapping system with multiple data types
- Snapshot persistence for data durability
- AOF (Append-Only File) logging

### Documentation
- Comprehensive README with API documentation
- Query syntax guide with examples
- JSDoc type definitions
- Migration guide for query syntax
- Performance benchmarks
- Contributing guidelines

## [Unreleased]

### Planned
- CommonJS build support
- TypeScript declaration files (.d.ts)
- Synonym support enhancements
- Custom scoring functions
- Distributed search capabilities
- Query result caching
- Analytics and metrics collection 