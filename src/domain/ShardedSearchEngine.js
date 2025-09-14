import SearchEngine from './SearchEngine.js';
import { mergeSearchResults } from './SearchResultAggregator.js';

export default class ShardedSearchEngine {
    constructor({ shardCount = 1, searchEngineFactory }) {
        if (typeof shardCount !== 'number' || shardCount < 1) {
            throw new Error('shardCount must be a positive integer');
        }
        if (typeof searchEngineFactory !== 'function') {
            throw new Error('searchEngineFactory must be provided');
        }
        this.shardCount = shardCount;
        this.shards = [];
        for (let i = 0; i < shardCount; i++) {
            const engine = searchEngineFactory(i);
            if (!(engine instanceof SearchEngine)) {
                throw new Error('searchEngineFactory must return a SearchEngine instance');
            }
            this.shards.push(engine);
        }
    }

    _getShardIndex(docId) {
        const str = String(docId);
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = (hash + str.charCodeAt(i)) % this.shardCount;
        }
        return hash;
    }

    add(doc) {
        const idx = this._getShardIndex(doc.id);
        this.shards[idx].add(doc);
    }

    delete(docId) {
        const idx = this._getShardIndex(docId);
        this.shards[idx].delete(docId);
    }

    search(query, context = {}) {
        const shardResults = this.shards.map(shard => shard.search(query, { from: 0, size: Number.MAX_SAFE_INTEGER }));
        return mergeSearchResults(shardResults, context);
    }

    flush() {
        for (const shard of this.shards) {
            shard.flush();
        }
    }

    shutdown() {
        for (const shard of this.shards) {
            shard.shutdown();
        }
    }
}

