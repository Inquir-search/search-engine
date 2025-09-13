import { vi } from 'vitest';

// Provide Jest compatibility layer for tests originally written for Jest
// Map the global `jest` object to Vitest's `vi` implementation.
// Only the APIs needed by the existing test-suite are aliased.
(global as any).jest = vi;

// Proxy missing properties (e.g., jest.fn, jest.spyOn) to `vi`
const handler: ProxyHandler<typeof vi> = {
    get(target, prop) {
        return (target as any)[prop as any] ?? (target as any);
    }
};
(global as any).jest = new Proxy(vi as any, handler);

// Provide global mocks for integration tests that reference undeclared variables
import BM25Scorer from './src/domain/BM25Scorer.js';
import Tokenizer from './src/domain/Tokenizer.js';
import StopwordsManager from './src/infrastructure/StopwordsManager.js';
import ShardedInvertedIndex from './src/domain/ShardedInvertedIndex.js';

const __globalStopwordsManager = new StopwordsManager({ autoSave: false });

// Minimal inverted index stub that satisfies getDocFreq
const __globalInvertedIndex = new ShardedInvertedIndex({ numShards: 1 });

// Create global scorer and tokenizer so test files using undeclared variables do not throw ReferenceError
(global as any).scorer = new BM25Scorer(0, 0, new Map(), __globalInvertedIndex);
(global as any).tokenizer = new Tokenizer(__globalStopwordsManager); 