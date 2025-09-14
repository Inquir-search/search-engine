import { test } from 'node:test';
import assert from 'node:assert/strict';

import Tokenizer from '../src/domain/Tokenizer.js';
import InvertedIndex from '../src/domain/InvertedIndex.js';
import RankingPipeline from '../src/domain/RankingPipeline.js';
import MappingsManager from '../src/domain/MappingsManager.js';
import SynonymEngine from '../src/domain/SynonymEngine.js';
import BM25Scorer from '../src/domain/BM25Scorer.js';
import SearchEngine from '../src/domain/SearchEngine.js';
import ShardedSearchEngine from '../src/domain/ShardedSearchEngine.js';
import SearchCluster from '../src/domain/SearchCluster.js';

class MockStopwordsManager {
    constructor() {
        this.stopwords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);
    }
    getAll() { return Array.from(this.stopwords); }
    isStopword(word) { return this.stopwords.has(word.toLowerCase()); }
    autoDetect() { return null; }
}

const scorerFactory = (totalDocs, avgDocLength, docLengths, index) =>
    new BM25Scorer(totalDocs, avgDocLength, docLengths, index);

function createEngine() {
    const stopwordsManager = new MockStopwordsManager();
    const mappingsManager = new MappingsManager();
    mappingsManager.mappings.set('name', { type: 'text' });
    mappingsManager.mappings.set('type', { type: 'keyword' });
    return new SearchEngine({
        tokenizer: new Tokenizer(stopwordsManager),
        scorerFactory,
        invertedIndex: new InvertedIndex(),
        rankingPipeline: new RankingPipeline(),
        stopwordsManager,
        synonymEngine: new SynonymEngine(),
        mappingsManager,
        facetFields: ['type'],
    });
}

test('supports sharding and multiple indices', () => {
    const cluster = new SearchCluster();
    const primary = new ShardedSearchEngine({ shardCount: 2, searchEngineFactory: createEngine });
    const secondary = new ShardedSearchEngine({ shardCount: 2, searchEngineFactory: createEngine });
    cluster.addIndex('primary', primary);
    cluster.addIndex('secondary', secondary);

    cluster.add('primary', { id: 'doc1', name: 'alpha document', type: 'A' });
    cluster.add('primary', { id: 'doc2', name: 'beta document', type: 'A' });
    cluster.add('secondary', { id: 'doc3', name: 'alpha beta', type: 'B' });

    let results = cluster.search('alpha');
    assert.strictEqual(results.total, 2);
    assert.deepStrictEqual(results.facets, { type: { A: 1, B: 1 } });
    assert.ok(results.hits.some(h => h.id === 'doc1'));
    assert.ok(results.hits.some(h => h.id === 'doc3'));

    results = cluster.search('beta', { index: 'primary' });
    assert.strictEqual(results.total, 1);
    assert.deepStrictEqual(results.facets, { type: { A: 1 } });
    assert.strictEqual(results.hits[0].id, 'doc2');

    cluster.flush();
    cluster.shutdown();
});

