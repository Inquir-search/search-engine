import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import BM25Scorer from '../src/domain/BM25Scorer.js';
import InvertedIndex from '../src/domain/InvertedIndex.js';

describe('BM25Scorer', () => {
    let scorer;
    let invertedIndex;
    let docLengths;
    let totalDocs;
    let avgDocLength;

    beforeEach(() => {
        invertedIndex = new InvertedIndex();
        docLengths = new Map();
        totalDocs = 0;
        avgDocLength = 0;
        scorer = new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex);
    });

    // Helper function to calculate score based on a simple query
    const calculateScore = (docId, queryTerms, currentScorer) => {
        let totalScore = 0;
        const s = currentScorer || scorer;
        for (const term of queryTerms) {
            const token = `name:${term}`; // Assuming 'name' field for simplicity
            const posting = invertedIndex.getPosting(token);
            if (posting && posting.has(docId)) {
                const docInfo = posting.get(docId);
                const tf = docInfo && docInfo.positions ? docInfo.positions.length : 0;
                totalScore += s.score(token, docId, tf);
            }
        }
        return totalScore;
    };

    test('should initialize BM25 scorer', () => {
        assert.ok(scorer);
        assert.strictEqual(scorer.k1, 1.2);
        assert.strictEqual(scorer.b, 0.75);
    });

    describe('Basic Scoring', () => {
        test('should calculate score for single term', () => {
            // Setup index
            invertedIndex.addToken('name:hello', 'doc1', 0);
            invertedIndex.addToken('name:world', 'doc1', 1);
            invertedIndex.addToken('name:hello', 'doc2', 0);

            docLengths.set('doc1', 2);
            docLengths.set('doc2', 1);
            totalDocs = 2;
            avgDocLength = 1.5;

            scorer = new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex);

            const score1 = calculateScore('doc1', ['hello', 'world']);
            const score2 = calculateScore('doc2', ['hello', 'world']);

            assert.ok(score1 > 0);
            assert.ok(score2 > 0);
            assert.ok(score1 > score2); // doc1 has a rare term 'world' which should boost its score
        });

        test('should return zero score for non-existent document', () => {
            scorer = new BM25Scorer(0, 0, new Map(), new InvertedIndex());
            const score = calculateScore('nonexistent', ['hello']);
            assert.strictEqual(score, 0);
        });

        test('should return zero score for document with no matching terms', () => {
            invertedIndex.addToken('name:hello', 'doc1', 0);
            docLengths.set('doc1', 1);
            totalDocs = 1;
            avgDocLength = 1;

            scorer = new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex);

            const score = calculateScore('doc1', ['world']);
            assert.strictEqual(score, 0);
        });
    });

    describe('Term Frequency (TF) Calculation', () => {
        test('should calculate TF for single occurrence', () => {
            invertedIndex.addToken('name:hello', 'doc1', 0);
            docLengths.set('doc1', 1);
            totalDocs = 1;
            avgDocLength = 1;

            scorer = new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex);

            const score = calculateScore('doc1', ['hello']);
            assert.ok(score > 0);
        });

        test('should calculate TF for multiple occurrences', () => {
            invertedIndex.addToken('name:hello', 'doc1', 0);
            invertedIndex.addToken('name:hello', 'doc1', 5);
            invertedIndex.addToken('name:hello', 'doc1', 10);
            docLengths.set('doc1', 3);
            totalDocs = 1;
            avgDocLength = 3;

            scorer = new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex);

            const score = calculateScore('doc1', ['hello']);
            assert.ok(score > 0);
        });

        test('should handle documents with different lengths', () => {
            invertedIndex.addToken('name:hello', 'doc1', 0);
            invertedIndex.addToken('name:hello', 'doc2', 0);
            invertedIndex.addToken('name:world', 'doc2', 1);

            docLengths.set('doc1', 1);
            docLengths.set('doc2', 2);
            totalDocs = 2;
            avgDocLength = 1.5;

            scorer = new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex);

            const score1 = calculateScore('doc1', ['hello']);
            const score2 = calculateScore('doc2', ['hello']);

            assert.ok(score1 > 0);
            assert.ok(score2 > 0);
            // doc1 is shorter, so it should be boosted
            assert.ok(score1 > score2);
        });
    });

    describe('Document Frequency (DF) Calculation', () => {
        test('should calculate DF for single document', () => {
            invertedIndex.addToken('name:hello', 'doc1', 0);
            docLengths.set('doc1', 1);
            totalDocs = 1;
            avgDocLength = 1;

            scorer = new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex);

            const score = calculateScore('doc1', ['hello']);
            assert.ok(score > 0);
        });

        test('should calculate DF for multiple documents', () => {
            invertedIndex.addToken('name:hello', 'doc1', 0);
            invertedIndex.addToken('name:hello', 'doc2', 0);
            invertedIndex.addToken('name:world', 'doc1', 1);

            docLengths.set('doc1', 2);
            docLengths.set('doc2', 1);
            totalDocs = 2;
            avgDocLength = 1.5;

            scorer = new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex);

            const score1 = calculateScore('doc1', ['hello', 'world']);
            const score2 = calculateScore('doc2', ['hello']);

            assert.ok(score1 > 0);
            assert.ok(score2 > 0);
        });

        test('should handle rare terms', () => {
            invertedIndex.addToken('name:rare', 'doc1', 0);
            invertedIndex.addToken('name:common', 'doc1', 1);
            invertedIndex.addToken('name:common', 'doc2', 0);
            invertedIndex.addToken('name:common', 'doc3', 0);

            docLengths.set('doc1', 2);
            docLengths.set('doc2', 1);
            docLengths.set('doc3', 1);
            totalDocs = 3;
            avgDocLength = 4 / 3;

            scorer = new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex);

            const score1 = calculateScore('doc1', ['rare', 'common']);
            const score2 = calculateScore('doc2', ['common']);
            const score3 = calculateScore('doc3', ['common']);


            assert.ok(score1 > 0);
            assert.ok(score2 > 0);
            assert.ok(score3 > 0);

            // score1 should be highest due to the rare term
            assert.ok(score1 > score2);
            assert.ok(score1 > score3);
        });
    });

    describe('Inverse Document Frequency (IDF) Calculation', () => {
        test('should calculate IDF for unique term', () => {
            invertedIndex.addToken('name:unique', 'doc1', 0);
            docLengths.set('doc1', 1);
            totalDocs = 1;
            avgDocLength = 1;

            scorer = new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex);

            const score = calculateScore('doc1', ['unique']);
            assert.ok(score > 0);
        });

        test('should calculate IDF for common term', () => {
            invertedIndex.addToken('name:common', 'doc1', 0);
            invertedIndex.addToken('name:common', 'doc2', 0);
            invertedIndex.addToken('name:common', 'doc3', 0);

            docLengths.set('doc1', 1);
            docLengths.set('doc2', 1);
            docLengths.set('doc3', 1);
            totalDocs = 3;
            avgDocLength = 1;

            scorer = new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex);

            const score = calculateScore('doc1', ['common']);
            assert.ok(score > 0);

            // Add a unique term to a new doc and check that its score is higher
            invertedIndex.addToken('name:unique', 'doc4', 0);
            docLengths.set('doc4', 1);
            totalDocs = 4;
            avgDocLength = 1;
            scorer = new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex);
            const scoreUnique = calculateScore('doc4', ['unique']);

            assert.ok(scoreUnique > score);
        });
    });

    describe('Document Length Normalization', () => {
        test('should normalize by document length', () => {
            invertedIndex.addToken('name:hello', 'doc1', 0);
            invertedIndex.addToken('name:hello', 'doc2', 0);
            invertedIndex.addToken('name:world', 'doc2', 1);
            invertedIndex.addToken('name:test', 'doc2', 2);

            docLengths.set('doc1', 1);
            docLengths.set('doc2', 3);
            totalDocs = 2;
            avgDocLength = 2;

            scorer = new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex);

            const score1 = calculateScore('doc1', ['hello']);
            const score2 = calculateScore('doc2', ['hello']);

            assert.ok(score1 > 0);
            assert.ok(score2 > 0);
            assert.ok(score1 > score2);
        });

        test('should handle documents shorter than average', () => {
            invertedIndex.addToken('name:hello', 'doc1', 0);
            invertedIndex.addToken('name:hello', 'doc2', 0);

            docLengths.set('doc1', 1);
            docLengths.set('doc2', 5);
            totalDocs = 2;
            avgDocLength = 2;

            scorer = new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex);

            const score1 = calculateScore('doc1', ['hello']);
            const score2 = calculateScore('doc2', ['hello']);

            assert.ok(score1 > 0);
            assert.ok(score2 > 0);
            assert.ok(score1 > score2);
        });

        test('should handle documents longer than average', () => {
            invertedIndex.addToken('name:hello', 'doc1', 0);
            invertedIndex.addToken('name:hello', 'doc2', 0);

            docLengths.set('doc1', 10);
            docLengths.set('doc2', 15);
            totalDocs = 2;
            avgDocLength = 1.5;

            scorer = new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex);

            const score1 = calculateScore('doc1', ['hello']);
            const score2 = calculateScore('doc2', ['hello']);

            assert.ok(score1 > 0);
            assert.ok(score2 > 0);
            assert.ok(score1 > score2);
        });
    });

    describe('Multi-Term Queries', () => {
        test('should score documents with multiple query terms', () => {
            invertedIndex.addToken('name:hello', 'doc1', 0);
            invertedIndex.addToken('name:world', 'doc1', 1);
            invertedIndex.addToken('name:hello', 'doc2', 0);
            invertedIndex.addToken('name:test', 'doc2', 1);

            docLengths.set('doc1', 2);
            docLengths.set('doc2', 2);
            totalDocs = 2;
            avgDocLength = 2;

            scorer = new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex);

            const score1 = calculateScore('doc1', ['hello', 'world']);
            const score2 = calculateScore('doc2', ['hello', 'world']);

            assert.ok(score1 > 0);
            assert.ok(score2 > 0);
            assert.ok(score1 > score2);
        });

        test('should handle documents with partial term matches', () => {
            invertedIndex.addToken('name:hello', 'doc1', 0);
            invertedIndex.addToken('name:world', 'doc1', 1);
            invertedIndex.addToken('name:hello', 'doc2', 0);

            docLengths.set('doc1', 2);
            docLengths.set('doc2', 1);
            totalDocs = 2;
            avgDocLength = 1.5;

            scorer = new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex);

            const score1 = calculateScore('doc1', ['hello', 'world']);
            const score2 = calculateScore('doc2', ['hello', 'world']);

            assert.ok(score1 > 0);
            assert.ok(score2 > 0);
            assert.ok(score1 > score2);
        });
    });

    describe('Parameter Tuning', () => {
        test('should handle different k1 values', () => {
            invertedIndex.addToken('name:hello', 'doc1', 0);
            invertedIndex.addToken('name:hello', 'doc1', 5);

            docLengths.set('doc1', 2);
            totalDocs = 1;
            avgDocLength = 2;

            scorer = new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex);
            scorer.k1 = 0.5; // Lower k1 reduces term frequency impact

            const score = calculateScore('doc1', ['hello']);
            assert.ok(score > 0);
        });

        test('should handle different b values', () => {
            invertedIndex.addToken('name:hello', 'doc1', 0);
            invertedIndex.addToken('name:hello', 'doc2', 0);

            docLengths.set('doc1', 1);
            docLengths.set('doc2', 5);
            totalDocs = 2;
            avgDocLength = 3;

            scorer = new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex);
            scorer.b = 0.0; // No length normalization

            const score1 = calculateScore('doc1', ['hello']);
            const score2 = calculateScore('doc2', ['hello']);

            assert.ok(score1 > 0);
            assert.ok(score2 > 0);
            // With b=0, both documents should have similar scores
            assert.ok(Math.abs(score1 - score2) < 0.1);
        });
    });

    describe('Edge Cases', () => {
        test('should handle empty inverted index', () => {
            const score = calculateScore('doc1', ['hello']);
            assert.strictEqual(score, 0);
        });

        test('should handle zero total documents', () => {
            scorer = new BM25Scorer(0, 0, docLengths, invertedIndex);
            const score = calculateScore('doc1', ['hello']);
            assert.strictEqual(score, 0);
        });

        test('should handle zero average document length', () => {
            scorer = new BM25Scorer(1, 0, docLengths, invertedIndex);
            const score = calculateScore('doc1', ['hello']);
            assert.strictEqual(score, 0);
        });

        test('should handle missing document length', () => {
            invertedIndex.addToken('name:hello', 'doc1', 0);
            const score = calculateScore('doc1', ['hello']);
            assert.strictEqual(score, 0);
        });

        test('should handle negative document length', () => {
            invertedIndex.addToken('name:hello', 'doc1', 0);
            docLengths.set('doc1', -1);
            totalDocs = 1;
            avgDocLength = 1;

            scorer = new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex);
            const score = calculateScore('doc1', ['hello']);
            assert.strictEqual(score, 0);
        });

        test('should handle very large document lengths', () => {
            invertedIndex.addToken('name:hello', 'doc1', 0);
            docLengths.set('doc1', 1000000);
            totalDocs = 1;
            avgDocLength = 1000000;

            scorer = new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex);
            const score = calculateScore('doc1', ['hello']);
            assert.ok(score >= 0);
        });
    });

    describe('Performance Tests', () => {
        test('should handle large inverted index efficiently', () => {
            // Setup large index
            for (let i = 0; i < 1000; i++) {
                invertedIndex.addToken(`name:token${i}`, `doc${i % 100}`, i);
            }

            docLengths.set('doc1', 10);
            totalDocs = 100;
            avgDocLength = 10;

            scorer = new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex);

            const start = Date.now();
            const score = calculateScore('doc1', ['token0']);
            const end = Date.now();

            assert.ok(end - start < 100); // should complete in under 100ms
            assert.ok(score >= 0);
        });

        test('should handle many document length lookups efficiently', () => {
            // Setup many documents
            for (let i = 0; i < 10000; i++) {
                docLengths.set(`doc${i}`, Math.floor(Math.random() * 100) + 1);
            }

            invertedIndex.addToken('name:hello', 'doc1', 0);
            totalDocs = 10000;
            avgDocLength = 50;

            scorer = new BM25Scorer(totalDocs, avgDocLength, docLengths, invertedIndex);

            const start = Date.now();
            const score = calculateScore('doc1', ['hello']);
            const end = Date.now();

            assert.ok(end - start < 100); // should complete in under 100ms
            assert.ok(score >= 0);
        });
    });
}); 