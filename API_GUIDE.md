# Search Engine API Guide

A fully configurable search engine server with dynamic index creation and management.

## Quick Start

1. **Start the server:**
   ```bash
   node server.js
   ```

2. **Set up a sample index:**
   ```bash
   node examples/setup-anime-index.js
   ```

3. **Open the demo UI:**
   Open `http://localhost:3000/anime-search.html` in your browser

## API Endpoints

### Index Management

#### Create Index
```http
POST /index
Content-Type: application/json

{
  "indexName": "my-index",
  "baseDir": "./data/my-index",
  "enableShardedStorage": true,
  "numShards": 4,
  "autoPersistence": {
    "enabled": true,
    "interval": 30000,
    "saveOnAdd": true,
    "saveOnShutdown": true,
    "batchSize": 100
  },
  "facetFields": ["category", "status", "year"]
}
```

#### List All Indexes
```http
GET /index
```

#### Delete Index
```http
DELETE /index/{indexName}
```

#### Get Index Statistics
```http
GET /index/{indexName}/stats
```

### Document Management

#### Add Documents
```http
POST /index/{indexName}/documents
Content-Type: application/json

{
  "documents": [
    {
      "id": "doc1",
      "title": "Example Document",
      "content": "This is an example",
      "category": "example",
      "year": 2024
    }
  ]
}
```

#### Manual Flush
```http
POST /index/{indexName}/flush
```

### Search & Facets

#### Search Documents
```http
POST /search/{indexName}
Content-Type: application/json

{
  "query": {
    "match": {
      "field": "title",
      "value": "example"
    }
  },
  "from": 0,
  "size": 10
}
```

#### Get Facets
```http
GET /facets/{indexName}
```

## Configuration Options

### Index Configuration

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `indexName` | string | required | Unique identifier for the index |
| `baseDir` | string | `./data/{indexName}` | Directory for storing index data |
| `enableShardedStorage` | boolean | `true` | Enable sharded persistence |
| `numShards` | number | `8` | Number of shards for the index |
| `facetFields` | string[] | `[]` | Fields to use for faceting |

### Auto-Persistence Configuration

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable automatic persistence |
| `interval` | number | `30000` | Auto-save interval in milliseconds |
| `saveOnAdd` | boolean | `true` | Save after adding documents |
| `saveOnShutdown` | boolean | `true` | Save on server shutdown |
| `batchSize` | number | `100` | Save after N documents added |

## Query Types

### Match All
```json
{
  "query": { "match_all": {} }
}
```

### Match Query
```json
{
  "query": {
    "match": {
      "field": "title",
      "value": "search term"
    }
  }
}
```

### Term Query (Exact Match)
```json
{
  "query": {
    "term": {
      "field": "category",
      "value": "action"
    }
  }
}
```

### Boolean Query
```json
{
  "query": {
    "bool": {
      "must": [
        { "match": { "field": "title", "value": "example" } }
      ],
      "should": [
        { "term": { "field": "category", "value": "popular" } }
      ],
      "must_not": [
        { "term": { "field": "status", "value": "deleted" } }
      ]
    }
  }
}
```

## Example Usage

### 1. Create a movies index
```bash
curl -X POST http://localhost:3000/index \
  -H "Content-Type: application/json" \
  -d '{
    "indexName": "movies",
    "facetFields": ["genre", "year", "rating"],
    "numShards": 4
  }'
```

### 2. Add movie documents
```bash
curl -X POST http://localhost:3000/index/movies/documents \
  -H "Content-Type: application/json" \
  -d '{
    "documents": [
      {
        "id": "movie1",
        "title": "The Matrix",
        "genre": "Sci-Fi",
        "year": 1999,
        "rating": "R",
        "plot": "A computer hacker learns about the true nature of reality."
      }
    ]
  }'
```

### 3. Search movies
```bash
curl -X POST http://localhost:3000/search/movies \
  -H "Content-Type: application/json" \
  -d '{
    "query": {
      "match": {
        "field": "title",
        "value": "matrix"
      }
    },
    "from": 0,
    "size": 10
  }'
```

### 4. Get facets
```bash
curl http://localhost:3000/facets/movies
```

## Error Handling

All endpoints return JSON responses. Error responses include:

```json
{
  "error": "Error description"
}
```

Common HTTP status codes:
- `200` - Success
- `400` - Bad Request (invalid parameters)
- `404` - Index not found
- `409` - Index already exists
- `500` - Internal server error

## Features

- ✅ **Dynamic Index Creation** - Create indexes on-demand with custom configuration
- ✅ **Configurable Persistence** - Auto-save with customizable intervals and triggers
- ✅ **Sharded Storage** - Distribute data across multiple shards for scalability
- ✅ **Field Mapping** - Automatic field type detection and mapping
- ✅ **Faceted Search** - Built-in faceting for filtering and navigation
- ✅ **Full-Text Search** - Advanced query DSL with boolean logic
- ✅ **RESTful API** - Clean, consistent API design
- ✅ **Graceful Shutdown** - Proper cleanup and data persistence on exit

## Development

To extend the server:

1. **Add new query types** - Extend the QueryEngine with new query processors
2. **Custom analyzers** - Add field-specific text analysis
3. **New endpoints** - Add routes for additional functionality
4. **Middleware** - Add authentication, logging, or other middleware

The server is built using Express.js and a modular search engine architecture. 