import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unlink, readFile } from 'node:fs/promises';

import SearchEngine from '../src/domain/SearchEngine.js';
import Tokenizer from '../src/domain/Tokenizer.js';
import InvertedIndex from '../src/domain/InvertedIndex.js';
import RankingPipeline from '../src/domain/RankingPipeline.js';
import MappingsManager from '../src/domain/MappingsManager.js';
import SnapshotPersistence from '../src/infrastructure/SnapshotPersistence.js';
import SynonymEngine from '../src/domain/SynonymEngine.js';
import BM25Scorer from '../src/domain/BM25Scorer.js';

class MockStopwordsManager {
    constructor() {
        this.stopwords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);
    }
    getAll() { return Array.from(this.stopwords); }
    isStopword(word) { return this.stopwords.has(word.toLowerCase()); }
    autoDetect() { return null; }
}

test('restores documents from snapshot without modification', async () => {
    const snapshotPath = './persistence-test-snapshot.json';
    await unlink(snapshotPath).catch(() => { });

    const stopwordsManager = new MockStopwordsManager();
    const mappingsManager = new MappingsManager();
    mappingsManager.mappings.set('name', { type: 'text' });
    const persistence = new SnapshotPersistence(snapshotPath);

    const scorerFactory = (totalDocs, avgDocLength, docLengths, index) =>
        new BM25Scorer(totalDocs, avgDocLength, docLengths, index);

    let engine = new SearchEngine({
        tokenizer: new Tokenizer(stopwordsManager),
        scorerFactory,
        invertedIndex: new InvertedIndex(),
        rankingPipeline: new RankingPipeline(),
        stopwordsManager,
        synonymEngine: new SynonymEngine(),
        mappingsManager,
        persistence,
        facetFields: ['status'],
    });

    const doc = { id: 'doc1', name: 'persistent doc', status: 'A' };
    engine.add(doc);
    engine.flush();

    const snapshot = JSON.parse(await readFile(snapshotPath, 'utf-8'));
    assert.deepStrictEqual(
        Object.keys(snapshot).sort(),
        ['avgDocLength', 'docLengths', 'documents', 'invertedIndex', 'totalDocs']
    );
    assert.deepStrictEqual(snapshot.documents, [['doc1', doc]]);

    engine.shutdown();

    // Recreate engine to load from snapshot
    const persistenceReload = new SnapshotPersistence(snapshotPath);
    engine = new SearchEngine({
        tokenizer: new Tokenizer(stopwordsManager),
        scorerFactory,
        invertedIndex: new InvertedIndex(),
        rankingPipeline: new RankingPipeline(),
        stopwordsManager,
        synonymEngine: new SynonymEngine(),
        mappingsManager,
        persistence: persistenceReload,
        facetFields: ['status'],
    });

    const results = engine.search('persistent');
    assert.strictEqual(results.hits.length, 1);
    assert.deepStrictEqual(engine.documents.get('doc1'), doc);
    assert.deepStrictEqual(results.facets, { status: { A: 1 } });

    const serializedIndex = engine.invertedIndex.serialize();
    assert.deepStrictEqual(snapshot.invertedIndex, serializedIndex);

    // Ensure index tokens map back to the original doc ID
    for (const [term, posting] of serializedIndex) {
        const docIds = posting.map(([docId]) => docId);
        assert.deepStrictEqual(docIds, ['doc1']);
    }

    engine.shutdown();
    await unlink(snapshotPath).catch(() => { });
});
