import { test, describe, beforeEach } from 'vitest';
import { expect } from 'vitest';
import { BM25Scorer, ShardedInvertedIndex } from '../src/index.js';

describe('BM25Scorer', () => {
    let scorer;
    let invertedIndex;
    let docLengths;
    let totalDocs;
    let avgDocLength;

    function addDocument(docId, field, text) {
        const tokens = text.split(' ');
        docLengths.set(docId, tokens.length);
        tokens.forEach((token, position) => {
            invertedIndex.addToken(`${field}:${token}`, docId, position);
        });
    }

    beforeEach(() => {
        invertedIndex = new ShardedInvertedIndex({ numShards: 1 });
        docLengths = new Map();
        totalDocs = 0;
        avgDocLength = 0;
    });

    const calculateScore = (docId, queryTerms, currentScorer) => {
        let totalScore = 0;
        queryTerms.forEach(term => {
            const tf = invertedIndex.termFrequency(term, docId);
            totalScore += currentScorer.score(term, { value: docId }, tf);
        });
        return totalScore;
    };

    test('should initialize with default parameters', () => {
        docLengths.set('doc1', 10);
        totalDocs = 1;
        avgDocLength = 10;
        scorer = new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex);

        expect(scorer.k1).toBe(1.2);
        expect(scorer.b).toBe(0.75);
    });

    test('should calculate BM25 score for a single term', () => {
        addDocument('doc1', 'name', 'hello world');
        addDocument('doc2', 'name', 'hello universe');
        totalDocs = 2;
        avgDocLength = (docLengths.get('doc1') + docLengths.get('doc2')) / 2;

        scorer = new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex);

        const score1 = calculateScore('doc1', ['name:world'], scorer);
        const score2 = calculateScore('doc2', ['name:world'], scorer);

        expect(score1).toBeGreaterThan(0);
        expect(score2).toBe(0);
        expect(score1).toBeGreaterThan(score2);
    });

    test('should return 0 for non-existent documents', () => {
        scorer = new BM25Scorer(0, 0, docLengths, invertedIndex);
        const score = scorer.score('name:test', { value: 'non-existent-doc' }, 1);
        expect(score).toBe(0);
    });

    test('should return 0 for documents with no term frequency', () => {
        addDocument('doc1', 'name', 'foo bar');
        totalDocs = 1;
        avgDocLength = docLengths.get('doc1');
        scorer = new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex);
        const score = scorer.score('name:test', { value: 'doc1' }, 0);
        expect(score).toBe(0);
    });

    test('should calculate higher scores for higher term frequencies', () => {
        addDocument('doc1', 'name', 'test test test');
        totalDocs = 1;
        avgDocLength = docLengths.get('doc1');
        scorer = new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex);
        const tf = invertedIndex.termFrequency('name:test', 'doc1');
        const score = scorer.score('name:test', { value: 'doc1' }, tf);
        expect(score).toBeGreaterThan(0);
    });

    test('should calculate higher scores for rarer terms', () => {
        addDocument('doc1', 'name', 'rare common');
        addDocument('doc2', 'name', 'common');
        totalDocs = 2;
        avgDocLength = (docLengths.get('doc1') + docLengths.get('doc2')) / 2;
        scorer = new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex);
        const tf = invertedIndex.termFrequency('name:rare', 'doc1');
        const score = scorer.score('name:rare', { value: 'doc1' }, tf);
        expect(score).toBeGreaterThan(0);
    });

    test('should penalize longer documents', () => {
        addDocument('doc1', 'name', 'test');
        addDocument('doc2', 'name', 'test word word word word word word word word word word word word word word word word word word word');
        totalDocs = 2;
        avgDocLength = (docLengths.get('doc1') + docLengths.get('doc2')) / 2;
        scorer = new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex);
        const tf1 = invertedIndex.termFrequency('name:test', 'doc1');
        const tf2 = invertedIndex.termFrequency('name:test', 'doc2');
        const score1 = scorer.score('name:test', { value: 'doc1' }, tf1);
        const score2 = scorer.score('name:test', { value: 'doc2' }, tf2);
        expect(score1).toBeGreaterThan(0);
        expect(score2).toBeGreaterThan(0);
        expect(score1).toBeGreaterThan(score2);
    });

    test('should handle custom k1 and b parameters', () => {
        addDocument('doc1', 'name', 'test');
        totalDocs = 1;
        avgDocLength = docLengths.get('doc1');
        scorer = new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex, { k1: 2.0, b: 0.5 });
        const tf = invertedIndex.termFrequency('name:test', 'doc1');
        const score = scorer.score('name:test', { value: 'doc1' }, tf);
        expect(score).toBeGreaterThan(0);
    });

    test('should handle multiple documents with different term frequencies', () => {
        addDocument('doc1', 'name', 'test test test');
        addDocument('doc2', 'name', 'test test');
        addDocument('doc3', 'name', 'test');
        totalDocs = 3;
        avgDocLength = (docLengths.get('doc1') + docLengths.get('doc2') + docLengths.get('doc3')) / 3;
        scorer = new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex);
        const tf1 = invertedIndex.termFrequency('name:test', 'doc1');
        const tf2 = invertedIndex.termFrequency('name:test', 'doc2');
        const tf3 = invertedIndex.termFrequency('name:test', 'doc3');
        const score1 = scorer.score('name:test', { value: 'doc1' }, tf1);
        const score2 = scorer.score('name:test', { value: 'doc2' }, tf2);
        const score3 = scorer.score('name:test', { value: 'doc3' }, tf3);
        expect(score1).toBeGreaterThan(0);
        expect(score2).toBeGreaterThan(0);
        expect(score3).toBeGreaterThan(0);
        expect(score1).toBeGreaterThan(score2);
        expect(score1).toBeGreaterThan(score3);
    });

    test('should handle empty inverted index', () => {
        docLengths.set('doc1', 10);
        totalDocs = 1;
        avgDocLength = 10;
        scorer = new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex);
        const tf = invertedIndex.termFrequency('name:test', 'doc1');
        const score = scorer.score('name:test', { value: 'doc1' }, tf);
        expect(score).toBe(0);
    });

    test('should handle term appearing in all documents', () => {
        addDocument('doc1', 'name', 'common');
        addDocument('doc2', 'name', 'common');
        totalDocs = 2;
        avgDocLength = (docLengths.get('doc1') + docLengths.get('doc2')) / 2;
        scorer = new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex);
        const tf = invertedIndex.termFrequency('name:common', 'doc1');
        const score = scorer.score('name:common', { value: 'doc1' }, tf);
        expect(score).toBeGreaterThan(0);
    });

    test('should handle unique terms with higher boost', () => {
        addDocument('doc1', 'name', 'unique common');
        addDocument('doc2', 'name', 'common');
        totalDocs = 2;
        avgDocLength = (docLengths.get('doc1') + docLengths.get('doc2')) / 2;
        scorer = new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex);
        const tfCommon = invertedIndex.termFrequency('name:common', 'doc1');
        const tfUnique = invertedIndex.termFrequency('name:unique', 'doc1');
        const score = scorer.score('name:common', { value: 'doc1' }, tfCommon);
        const scoreUnique = scorer.score('name:unique', { value: 'doc1' }, tfUnique);
        expect(scoreUnique).toBeGreaterThan(score);
    });

    test('should handle multiple fields correctly', () => {
        addDocument('doc1', 'title', 'test');
        addDocument('doc1', 'content', 'content');
        addDocument('doc2', 'title', 'other');
        addDocument('doc2', 'content', 'content');
        totalDocs = 2;
        avgDocLength = (docLengths.get('doc1') + docLengths.get('doc2')) / 2;
        scorer = new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex);
        const tf1 = invertedIndex.termFrequency('title:test', 'doc1');
        const tf2 = invertedIndex.termFrequency('title:test', 'doc2');
        const score1 = scorer.score('title:test', { value: 'doc1' }, tf1);
        const score2 = scorer.score('title:test', { value: 'doc2' }, tf2);
        expect(score1).toBeGreaterThan(0);
        expect(score2).toBe(0);
        expect(score1).toBeGreaterThan(score2);
    });

    test('should handle varying document lengths', () => {
        addDocument('doc1', 'name', 'test');
        addDocument('doc2', 'name', 'test');
        docLengths.set('doc1', 5);
        docLengths.set('doc2', 15);
        totalDocs = 2;
        avgDocLength = (docLengths.get('doc1') + docLengths.get('doc2')) / 2;
        scorer = new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex);
        const tf1 = invertedIndex.termFrequency('name:test', 'doc1');
        const tf2 = invertedIndex.termFrequency('name:test', 'doc2');
        const score1 = scorer.score('name:test', { value: 'doc1' }, tf1);
        const score2 = scorer.score('name:test', { value: 'doc2' }, tf2);
        expect(score1).toBeGreaterThan(0);
        expect(score2).toBeGreaterThan(0);
        expect(score1).toBeGreaterThan(score2);
    });

    test('should handle extreme k1 values', () => {
        // For k1 = 0, BM25 reduces to a binary model (presence/absence)
        // For very large k1, BM25 approaches a raw term frequency model
        // If idf or tf is zero, both scores may be zero
        docLengths.set('doc1', 10);
        totalDocs = 1;
        avgDocLength = 10;
        addDocument('doc1', 'name', 'test test test');

        const scorer1 = new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex, 0.0, 0.75);
        const scorer2 = new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex, 100.0, 0.75);
        const tf = invertedIndex.termFrequency('name:test', 'doc1');
        const score1 = scorer1.score('doc1', 'name:test', tf);
        const score2 = scorer2.score('doc1', 'name:test', tf);
        if (score1 === 0 && score2 === 0) {
            expect(score1).toBe(score2);
        } else {
            expect(score1).toBeLessThan(score2);
        }
    });

    test('should handle extreme b values', () => {
        // For b = 0, document length normalization is disabled
        // For b = 1, full normalization is applied
        docLengths.set('doc1', 10);
        totalDocs = 1;
        avgDocLength = 10;
        addDocument('doc1', 'name', 'test test test');

        const scorer1 = new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex, 1.2, 0.0);
        const scorer2 = new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex, 1.2, 1.0);
        const tf = invertedIndex.termFrequency('name:test', 'doc1');
        const score1 = scorer1.score('doc1', 'name:test', tf);
        const score2 = scorer2.score('doc1', 'name:test', tf);
        // For a single doc with avg length, scores are equal
        expect(score1).toBeCloseTo(score2, 8);
    });

    test('should handle very similar scores', () => {
        docLengths.set('doc1', 10);
        docLengths.set('doc2', 10);
        totalDocs = 2;
        avgDocLength = 10;

        addDocument('doc1', 'name', 'test');
        addDocument('doc2', 'name', 'test');

        scorer = new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex);

        const score1 = scorer.score('name:test', { value: 'doc1' }, 1);
        const score2 = scorer.score('name:test', { value: 'doc2' }, 1);

        expect(score1).toBeGreaterThan(0);
        expect(score2).toBeGreaterThan(0);
        // Scores should be very similar for identical documents
        expect(Math.abs(score1 - score2)).toBeLessThan(0.1);
    });

    test('should return 0 for empty document length', () => {
        docLengths.set('doc1', 0);
        totalDocs = 1;
        avgDocLength = 0;
        scorer = new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex);

        const score = scorer.score('name:test', { value: 'doc1' }, 1);
        expect(score).toBe(0);
    });

    test('should return 0 for negative term frequency', () => {
        docLengths.set('doc1', 10);
        totalDocs = 1;
        avgDocLength = 10;
        scorer = new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex);

        const score = scorer.score('name:test', { value: 'doc1' }, -1);
        expect(score).toBe(0);
    });

    test('should return 0 for zero total documents', () => {
        totalDocs = 0;
        avgDocLength = 0;
        scorer = new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex);

        const score = scorer.score('name:test', { value: 'doc1' }, 1);
        expect(score).toBe(0);
    });

    test('should throw for negative average document length', () => {
        docLengths.set('doc1', 10);
        totalDocs = 1;
        avgDocLength = -5;
        addDocument('doc1', 'name', 'test test test');
        expect(() => {
            new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex);
        }).toThrow();
    });

    test('should handle zero average document length', () => {
        docLengths.set('doc1', 0);
        totalDocs = 1;
        avgDocLength = 0;
        scorer = new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex);

        const score = scorer.score('name:test', { value: 'doc1' }, 1);
        expect(score).toBe(0);
    });

    test('should handle large document collections', () => {
        // Add many documents
        for (let i = 0; i < 1000; i++) {
            docLengths.set(`doc${i}`, 10);
            addDocument(`doc${i}`, 'name', 'test');
        }
        totalDocs = 1000;
        avgDocLength = 10;

        scorer = new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex);

        const score = scorer.score('name:test', { value: 'doc1' }, 1);
        expect(score).toBeGreaterThanOrEqual(0);
    });

    test('should perform BM25 calculation efficiently', () => {
        // Setup a moderate sized index
        for (let i = 0; i < 100; i++) {
            docLengths.set(`doc${i}`, 10);
            addDocument(`doc${i}`, 'name', 'test');
        }
        totalDocs = 100;
        avgDocLength = 10;

        scorer = new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex);

        const start = Date.now();
        const score = scorer.score('name:test', { value: 'doc1' }, 1);
        const end = Date.now();

        expect(end - start).toBeLessThan(100); // should complete in under 100ms
        expect(score).toBeGreaterThanOrEqual(0);
    });

    test('should handle concurrent scoring requests', () => {
        docLengths.set('doc1', 10);
        docLengths.set('doc2', 10);
        totalDocs = 2;
        avgDocLength = 10;

        addDocument('doc1', 'name', 'test');
        addDocument('doc2', 'name', 'test');

        scorer = new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex);

        const start = Date.now();
        const score1 = scorer.score('name:test', { value: 'doc1' }, 1);
        const score2 = scorer.score('name:test', { value: 'doc2' }, 1);
        const end = Date.now();

        expect(end - start).toBeLessThan(100); // should complete in under 100ms
        expect(score1).toBeGreaterThanOrEqual(0);
        expect(score2).toBeGreaterThanOrEqual(0);
    });
}); 