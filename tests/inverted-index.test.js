import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import InvertedIndex from '../src/domain/InvertedIndex.js';

describe('InvertedIndex Module Tests', () => {
    let index;

    beforeEach(() => {
        index = new InvertedIndex();
    });

    test('should initialize inverted index', () => {
        assert.ok(index);
        assert.ok(index.index instanceof Map);
    });

    describe('Token Addition', () => {
        test('should add single token', () => {
            index.addToken('hello', 'doc1', 0);
            const posting = index.getPosting('hello');
            assert.ok(posting.has('doc1'));
            assert.strictEqual(posting.get('doc1').positions[0], 0);
        });

        test('should add multiple tokens for same document', () => {
            index.addToken('hello', 'doc1', 0);
            index.addToken('world', 'doc1', 1);

            const helloPosting = index.getPosting('hello');
            const worldPosting = index.getPosting('world');

            assert.ok(helloPosting.has('doc1'));
            assert.ok(worldPosting.has('doc1'));
            assert.strictEqual(helloPosting.get('doc1').positions[0], 0);
            assert.strictEqual(worldPosting.get('doc1').positions[0], 1);
        });

        test('should add same token to multiple documents', () => {
            index.addToken('hello', 'doc1', 0);
            index.addToken('hello', 'doc2', 0);

            const posting = index.getPosting('hello');
            assert.ok(posting.has('doc1'));
            assert.ok(posting.has('doc2'));
        });

        test('should handle duplicate positions', () => {
            index.addToken('hello', 'doc1', 0);
            index.addToken('hello', 'doc1', 0); // duplicate position

            const posting = index.getPosting('hello');
            const docInfo = posting.get('doc1');
            assert.strictEqual(docInfo.positions.length, 1); // should deduplicate
        });

        test('should handle multiple positions for same token', () => {
            index.addToken('hello', 'doc1', 0);
            index.addToken('hello', 'doc1', 5);
            index.addToken('hello', 'doc1', 10);

            const posting = index.getPosting('hello');
            const docInfo = posting.get('doc1');
            assert.deepStrictEqual(docInfo.positions, [0, 5, 10]);
        });
    });

    describe('Posting Retrieval', () => {
        test('should return empty posting for non-existent token', () => {
            const posting = index.getPosting('nonexistent');
            assert.ok(posting instanceof Map);
            assert.strictEqual(posting.size, 0);
        });

        test('should return correct posting for existing token', () => {
            index.addToken('hello', 'doc1', 0);
            index.addToken('hello', 'doc2', 0);

            const posting = index.getPosting('hello');
            assert.strictEqual(posting.size, 2);
            assert.ok(posting.has('doc1'));
            assert.ok(posting.has('doc2'));
        });

        test('should return posting with correct document info', () => {
            index.addToken('hello', 'doc1', 0);
            index.addToken('hello', 'doc1', 5);

            const posting = index.getPosting('hello');
            const docInfo = posting.get('doc1');

            assert.ok(docInfo);
            assert.ok(Array.isArray(docInfo.positions));
            assert.deepStrictEqual(docInfo.positions, [0, 5]);
        });
    });

    describe('Document Frequency', () => {
        test('should calculate correct document frequency', () => {
            index.addToken('hello', 'doc1', 0);
            index.addToken('hello', 'doc2', 0);
            index.addToken('hello', 'doc3', 0);

            const posting = index.getPosting('hello');
            assert.strictEqual(posting.size, 3);
        });

        test('should handle single document', () => {
            index.addToken('hello', 'doc1', 0);
            index.addToken('hello', 'doc1', 5);

            const posting = index.getPosting('hello');
            assert.strictEqual(posting.size, 1);
        });
    });

    describe('Term Frequency', () => {
        test('should calculate correct term frequency', () => {
            index.addToken('hello', 'doc1', 0);
            index.addToken('hello', 'doc1', 5);
            index.addToken('hello', 'doc1', 10);

            const posting = index.getPosting('hello');
            const docInfo = posting.get('doc1');
            assert.strictEqual(docInfo.positions.length, 3);
        });

        test('should handle single occurrence', () => {
            index.addToken('hello', 'doc1', 0);

            const posting = index.getPosting('hello');
            const docInfo = posting.get('doc1');
            assert.strictEqual(docInfo.positions.length, 1);
        });
    });

    describe('Position Information', () => {
        test('should store correct positions', () => {
            index.addToken('hello', 'doc1', 0);
            index.addToken('world', 'doc1', 1);
            index.addToken('hello', 'doc1', 5);

            const helloPosting = index.getPosting('hello');
            const worldPosting = index.getPosting('world');

            assert.deepStrictEqual(helloPosting.get('doc1').positions, [0, 5]);
            assert.deepStrictEqual(worldPosting.get('doc1').positions, [1]);
        });

        test('should handle out of order positions', () => {
            index.addToken('hello', 'doc1', 10);
            index.addToken('hello', 'doc1', 5);
            index.addToken('hello', 'doc1', 0);

            const posting = index.getPosting('hello');
            const docInfo = posting.get('doc1');
            assert.deepStrictEqual(docInfo.positions, [0, 5, 10]); // should be sorted
        });
    });

    describe('Index Operations', () => {
        test('should list all tokens', () => {
            index.addToken('hello', 'doc1', 0);
            index.addToken('world', 'doc1', 1);
            index.addToken('test', 'doc2', 0);

            const tokens = Array.from(index.index.keys());
            assert.strictEqual(tokens.length, 3);
            assert.ok(tokens.includes('hello'));
            assert.ok(tokens.includes('world'));
            assert.ok(tokens.includes('test'));
        });

        test('should handle empty index', () => {
            const tokens = Array.from(index.index.keys());
            assert.strictEqual(tokens.length, 0);
        });
    });

    describe('Edge Cases', () => {
        test('should handle empty token', () => {
            index.addToken('', 'doc1', 0);
            const posting = index.getPosting('');
            assert.ok(posting.has('doc1'));
        });

        test('should handle null token', () => {
            index.addToken(null, 'doc1', 0);
            const posting = index.getPosting(null);
            assert.ok(posting.has('doc1'));
        });

        test('should handle undefined token', () => {
            index.addToken(undefined, 'doc1', 0);
            const posting = index.getPosting(undefined);
            assert.ok(posting.has('doc1'));
        });

        test('should handle empty document ID', () => {
            index.addToken('hello', '', 0);
            const posting = index.getPosting('hello');
            assert.ok(posting.has(''));
        });

        test('should handle null document ID', () => {
            index.addToken('hello', null, 0);
            const posting = index.getPosting('hello');
            assert.ok(posting.has(null));
        });

        test('should handle negative positions', () => {
            index.addToken('hello', 'doc1', -1);
            const posting = index.getPosting('hello');
            const docInfo = posting.get('doc1');
            assert.deepStrictEqual(docInfo.positions, [-1]);
        });

        test('should handle large position numbers', () => {
            index.addToken('hello', 'doc1', 1000000);
            const posting = index.getPosting('hello');
            const docInfo = posting.get('doc1');
            assert.deepStrictEqual(docInfo.positions, [1000000]);
        });
    });

    describe('Performance Tests', () => {
        test('should handle many tokens efficiently', () => {
            const start = Date.now();

            for (let i = 0; i < 1000; i++) {
                index.addToken(`token${i}`, `doc${i % 100}`, i);
            }

            const end = Date.now();
            assert.ok(end - start < 100); // should complete in under 100ms

            const tokens = Array.from(index.index.keys());
            assert.strictEqual(tokens.length, 1000);
        });

        test('should handle many documents efficiently', () => {
            const start = Date.now();

            for (let i = 0; i < 1000; i++) {
                index.addToken('common', `doc${i}`, i);
            }

            const end = Date.now();
            assert.ok(end - start < 100); // should complete in under 100ms

            const posting = index.getPosting('common');
            assert.strictEqual(posting.size, 1000);
        });
    });

    describe('Memory Management', () => {
        test('should not leak memory with many operations', () => {
            const initialMemory = process.memoryUsage().heapUsed;

            for (let i = 0; i < 10000; i++) {
                index.addToken(`token${i}`, `doc${i}`, i);
            }

            const finalMemory = process.memoryUsage().heapUsed;
            const memoryIncrease = finalMemory - initialMemory;

            // Memory increase should be reasonable (less than 10MB)
            assert.ok(memoryIncrease < 10 * 1024 * 1024);
        });
    });
}); 