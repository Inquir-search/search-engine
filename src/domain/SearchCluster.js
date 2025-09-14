import ShardedSearchEngine from './ShardedSearchEngine.js';
import SearchEngine from './SearchEngine.js';
import { mergeSearchResults } from './SearchResultAggregator.js';

export default class SearchCluster {
    constructor() {
        this.indices = new Map();
    }

    addIndex(name, engine) {
        if (this.indices.has(name)) {
            throw new Error(`Index ${name} already exists`);
        }
        if (!(engine instanceof SearchEngine) && !(engine instanceof ShardedSearchEngine)) {
            throw new Error('Engine must be a SearchEngine or ShardedSearchEngine instance');
        }
        this.indices.set(name, engine);
    }

    add(indexName, doc) {
        const engine = this.indices.get(indexName);
        if (!engine) {
            throw new Error(`Index ${indexName} not found`);
        }
        engine.add(doc);
    }

    delete(indexName, docId) {
        const engine = this.indices.get(indexName);
        if (!engine) return;
        engine.delete(docId);
    }

    search(query, { index, from, size } = {}) {
        if (index) {
            const engine = this.indices.get(index);
            if (!engine) {
                return { hits: [], facets: {}, total: 0, from: from || 0, size: size || 10 };
            }
            return engine.search(query, { from, size });
        }

        const results = [];
        for (const engine of this.indices.values()) {
            results.push(engine.search(query, { from: 0, size: Number.MAX_SAFE_INTEGER }));
        }
        return mergeSearchResults(results, { from, size });
    }

    flush() {
        for (const engine of this.indices.values()) {
            if (typeof engine.flush === 'function') {
                engine.flush();
            }
        }
    }

    shutdown() {
        for (const engine of this.indices.values()) {
            if (typeof engine.shutdown === 'function') {
                engine.shutdown();
            }
        }
    }
}

