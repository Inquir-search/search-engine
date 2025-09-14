import ShardedSearchEngine from './ShardedSearchEngine.js';
import SearchEngine from './SearchEngine.js';

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
        const hits = results.flatMap(r => r.hits);
        hits.sort((a, b) => b._score - a._score);
        const f = from || 0;
        const s = size !== undefined ? size : 10;
        const paginatedHits = hits.slice(f, f + s);

        const facets = {};
        for (const r of results) {
            for (const [field, values] of Object.entries(r.facets || {})) {
                if (!facets[field]) facets[field] = {};
                for (const [val, count] of Object.entries(values)) {
                    facets[field][val] = (facets[field][val] || 0) + count;
                }
            }
        }
        const total = results.reduce((sum, r) => sum + r.total, 0);
        return { hits: paginatedHits, facets, total, from: f, size: s };
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

