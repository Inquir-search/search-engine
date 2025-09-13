import { test, describe, beforeEach, afterEach, before, after } from 'vitest';
import { expect } from 'vitest';
import ShardedInvertedIndex from '../src/domain/ShardedInvertedIndex.ts';
import SynonymEngine from '../src/domain/SynonymEngine.ts';

// Patch SynonymEngine for tests to provide isEnabled and getSynonyms
class TestSynonymEngine {
    isEnabled() { return false; }
    getSynonyms() { return []; }
}

describe('InvertedIndex Module Tests', () => {
    let index;

    beforeEach(() => {
        index = new ShardedInvertedIndex({ numShards: 1 });
    });

    test('should initialize inverted index', () => {
        expect(index).toBeTruthy();
        expect(index.index instanceof Map).toBeTruthy();
    });

    describe('Token Addition', () => {
        test('should add single token', () => {
            index.addToken('hello', 'doc1', 0);
            const posting = index.getPosting('hello');
            expect(posting.has('doc1')).toBeTruthy();
            expect(posting.get('doc1').positions[0]).toBe(0);
        });

        test('should add multiple tokens for same document', () => {
            index.addToken('hello', 'doc1', 0);
            index.addToken('world', 'doc1', 1);

            const helloPosting = index.getPosting('hello');
            const worldPosting = index.getPosting('world');

            expect(helloPosting.has('doc1')).toBeTruthy();
            expect(worldPosting.has('doc1')).toBeTruthy();
            expect(helloPosting.get('doc1').positions[0]).toBe(0);
            expect(worldPosting.get('doc1').positions[0]).toBe(1);
        });

        test('should add same token to multiple documents', () => {
            index.addToken('hello', 'doc1', 0);
            index.addToken('hello', 'doc2', 0);

            const posting = index.getPosting('hello');
            expect(posting.has('doc1')).toBeTruthy();
            expect(posting.has('doc2')).toBeTruthy();
        });

        test('should handle duplicate positions', () => {
            index.addToken('hello', 'doc1', 0);
            index.addToken('hello', 'doc1', 0); // duplicate position

            const posting = index.getPosting('hello');
            const docInfo = posting.get('doc1');
            expect(docInfo.positions.length).toBe(1); // should deduplicate
        });

        test('should handle multiple positions for same token', () => {
            index.addToken('hello', 'doc1', 0);
            index.addToken('hello', 'doc1', 5);
            index.addToken('hello', 'doc1', 10);

            const posting = index.getPosting('hello');
            const docInfo = posting.get('doc1');
            expect(docInfo.positions).toEqual([0, 5, 10]);
        });
    });

    describe('Posting Retrieval', () => {
        test('should return empty posting for non-existent token', () => {
            const posting = index.getPosting('nonexistent');
            expect(posting instanceof Map).toBeTruthy();
            expect(posting.size).toBe(0);
        });

        test('should return correct posting for existing token', () => {
            index.addToken('hello', 'doc1', 0);
            index.addToken('hello', 'doc2', 0);

            const posting = index.getPosting('hello');
            expect(posting.size).toBe(2);
            expect(posting.has('doc1')).toBeTruthy();
            expect(posting.has('doc2')).toBeTruthy();
        });

        test('should return posting with correct document info', () => {
            index.addToken('hello', 'doc1', 0);
            index.addToken('hello', 'doc1', 5);

            const posting = index.getPosting('hello');
            const docInfo = posting.get('doc1');

            expect(docInfo).toBeTruthy();
            expect(Array.isArray(docInfo.positions)).toBeTruthy();
            expect(docInfo.positions).toEqual([0, 5]);
        });
    });

    describe('Document Frequency', () => {
        test('should calculate correct document frequency', () => {
            index.addToken('hello', 'doc1', 0);
            index.addToken('hello', 'doc2', 0);
            index.addToken('hello', 'doc3', 0);

            const posting = index.getPosting('hello');
            expect(posting.size).toBe(3);
        });

        test('should handle single document', () => {
            index.addToken('hello', 'doc1', 0);
            index.addToken('hello', 'doc1', 5);

            const posting = index.getPosting('hello');
            expect(posting.size).toBe(1);
        });
    });

    describe('Term Frequency', () => {
        test('should calculate correct term frequency', () => {
            index.addToken('hello', 'doc1', 0);
            index.addToken('hello', 'doc1', 5);
            index.addToken('hello', 'doc1', 10);

            const posting = index.getPosting('hello');
            const docInfo = posting.get('doc1');
            expect(docInfo.positions.length).toBe(3);
        });

        test('should handle single occurrence', () => {
            index.addToken('hello', 'doc1', 0);

            const posting = index.getPosting('hello');
            const docInfo = posting.get('doc1');
            expect(docInfo.positions.length).toBe(1);
        });
    });

    describe('Position Information', () => {
        test('should store correct positions', () => {
            index.addToken('hello', 'doc1', 0);
            index.addToken('world', 'doc1', 1);
            index.addToken('hello', 'doc1', 5);

            const helloPosting = index.getPosting('hello');
            const worldPosting = index.getPosting('world');

            expect(helloPosting.get('doc1').positions).toEqual([0, 5]);
            expect(worldPosting.get('doc1').positions).toEqual([1]);
        });

        test('should handle out of order positions', () => {
            index.addToken('hello', 'doc1', 10);
            index.addToken('hello', 'doc1', 5);
            index.addToken('hello', 'doc1', 0);

            const posting = index.getPosting('hello');
            const docInfo = posting.get('doc1');
            expect(docInfo.positions).toEqual([0, 5, 10]); // should be sorted
        });
    });

    describe('Index Operations', () => {
        test('should list all tokens', () => {
            index.addToken('hello', 'doc1', 0);
            index.addToken('world', 'doc1', 1);
            index.addToken('test', 'doc2', 0);

            const tokens = Array.from(index.index.keys());
            expect(tokens.length).toBe(3);
            expect(tokens).toContain('hello');
            expect(tokens).toContain('world');
            expect(tokens).toContain('test');
        });

        test('should handle empty index', () => {
            const tokens = Array.from(index.index.keys());
            expect(tokens.length).toBe(0);
        });
    });

    describe('Edge Cases', () => {
        test('should handle empty token', () => {
            index.addToken('', 'doc1', 0);
            const posting = index.getPosting('');
            expect(posting.has('doc1')).toBeTruthy();
        });

        test('should handle null token', () => {
            index.addToken(null, 'doc1', 0);
            const posting = index.getPosting(null);
            expect(posting.has('doc1')).toBeTruthy();
        });

        test('should handle undefined token', () => {
            index.addToken(undefined, 'doc1', 0);
            const posting = index.getPosting(undefined);
            expect(posting.has('doc1')).toBeTruthy();
        });

        test('should handle empty document ID', () => {
            index.addToken('hello', '', 0);
            const posting = index.getPosting('hello');
            expect(posting.has('')).toBeTruthy();
        });

        test('should handle null document ID', () => {
            index.addToken('hello', null, 0);
            const posting = index.getPosting('hello');
            expect(posting.has(null)).toBeTruthy();
        });

        test('should handle negative positions', () => {
            index.addToken('hello', 'doc1', -1);
            const posting = index.getPosting('hello');
            const docInfo = posting.get('doc1');
            expect(docInfo.positions).toEqual([-1]);
        });

        test('should handle large position numbers', () => {
            index.addToken('hello', 'doc1', 1000000);
            const posting = index.getPosting('hello');
            const docInfo = posting.get('doc1');
            expect(docInfo.positions).toEqual([1000000]);
        });
    });

    describe('Performance Tests', () => {
        test('should handle many tokens efficiently', () => {
            const start = Date.now();

            for (let i = 0; i < 1000; i++) {
                index.addToken(`token${i}`, `doc${i % 100}`, i);
            }

            const end = Date.now();
            expect(end - start < 100).toBeTruthy(); // should complete in under 100ms

            const tokens = Array.from(index.index.keys());
            expect(tokens.length).toBe(1000);
        });

        test('should handle many documents efficiently', () => {
            const start = Date.now();

            for (let i = 0; i < 1000; i++) {
                index.addToken('common', `doc${i}`, i);
            }

            const end = Date.now();
            expect(end - start < 100).toBeTruthy(); // should complete in under 100ms

            const posting = index.getPosting('common');
            expect(posting.size).toBe(1000);
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
            expect(memoryIncrease < 10 * 1024 * 1024).toBeTruthy();
        });
    });
}); 