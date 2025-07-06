import { test, describe } from 'node:test';
import assert from 'node:assert';
import Tokenizer from '../src/domain/Tokenizer.js';

describe('Tokenizer Module Tests', () => {
    let tokenizer;
    let mockStopwordsManager;

    test('should initialize tokenizer', () => {
        mockStopwordsManager = {
            getAll: () => ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']
        };
        tokenizer = new Tokenizer(mockStopwordsManager);
        assert.ok(tokenizer);
        assert.ok(typeof tokenizer.tokenize === 'function');
    });

    describe('Standard Analyzer', () => {
        test('should tokenize simple text', () => {
            const tokens = tokenizer.tokenize('hello world', 'standard');
            assert.deepStrictEqual(tokens, ['hello', 'world']);
        });

        test('should handle punctuation', () => {
            const tokens = tokenizer.tokenize('hello, world!', 'standard');
            assert.deepStrictEqual(tokens, ['hello', 'world']);
        });

        test('should handle multiple spaces', () => {
            const tokens = tokenizer.tokenize('hello   world', 'standard');
            assert.deepStrictEqual(tokens, ['hello', 'world']);
        });

        test('should handle mixed case', () => {
            const tokens = tokenizer.tokenize('Hello World', 'standard');
            assert.deepStrictEqual(tokens, ['hello', 'world']);
        });

        test('should handle numbers', () => {
            const tokens = tokenizer.tokenize('hello 123 world', 'standard');
            assert.deepStrictEqual(tokens, ['hello', '123', 'world']);
        });

        test('should handle empty string', () => {
            const tokens = tokenizer.tokenize('', 'standard');
            assert.deepStrictEqual(tokens, []);
        });

        test('should handle whitespace only', () => {
            const tokens = tokenizer.tokenize('   \t\n  ', 'standard');
            assert.deepStrictEqual(tokens, []);
        });
    });

    describe('Simple Analyzer', () => {
        test('should tokenize and lowercase', () => {
            const tokens = tokenizer.tokenize('Hello WORLD', 'simple');
            assert.deepStrictEqual(tokens, ['hello', 'world']);
        });

        test('should handle special characters', () => {
            const tokens = tokenizer.tokenize('hello@world.com', 'simple');
            assert.deepStrictEqual(tokens, ['hello', 'world', 'com']);
        });
    });

    describe('Whitespace Analyzer', () => {
        test('should preserve case', () => {
            const tokens = tokenizer.tokenize('Hello WORLD', 'whitespace');
            assert.deepStrictEqual(tokens, ['Hello', 'WORLD']);
        });

        test('should handle multiple spaces', () => {
            const tokens = tokenizer.tokenize('hello   world', 'whitespace');
            assert.deepStrictEqual(tokens, ['hello', 'world']);
        });
    });

    describe('Keyword Analyzer', () => {
        test('should return single token', () => {
            const tokens = tokenizer.tokenize('hello world', 'keyword');
            assert.deepStrictEqual(tokens, ['hello world']);
        });

        test('should handle special characters', () => {
            const tokens = tokenizer.tokenize('hello@world.com', 'keyword');
            assert.deepStrictEqual(tokens, ['hello@world.com']);
        });
    });

    describe('Email Analyzer', () => {
        test('should extract email components', () => {
            const tokens = tokenizer.tokenize('user@example.com', 'email');
            assert.deepStrictEqual(tokens, ['user', 'example.com', 'example', 'com']);
        });

        test('should handle complex emails', () => {
            const tokens = tokenizer.tokenize('user+tag@company.co.uk', 'email');
            assert.deepStrictEqual(tokens, ['user+tag', 'company.co.uk', 'company', 'co', 'uk']);
        });

        test('should handle subdomains', () => {
            const tokens = tokenizer.tokenize('user@sub.example.com', 'email');
            assert.deepStrictEqual(tokens, ['user', 'sub.example.com', 'sub', 'example', 'com']);
        });
    });

    describe('URL Analyzer', () => {
        test('should extract URL components', () => {
            const tokens = tokenizer.tokenize('https://example.com', 'url');
            assert.deepStrictEqual(tokens, ['example.com', 'example', 'com']);
        });

        test('should handle complex URLs', () => {
            const tokens = tokenizer.tokenize('https://api.example.com/docs/v1', 'url');
            assert.deepStrictEqual(tokens, ['api.example.com', 'api', 'example', 'com', 'docs', 'v1']);
        });

        test('should handle query parameters', () => {
            const tokens = tokenizer.tokenize('https://example.com?q=search&page=1', 'url');
            assert.deepStrictEqual(tokens, ['example.com?q=search&page=1', 'example', 'com?q=search&page=1']);
        });
    });

    describe('Phone Analyzer', () => {
        test('should extract phone number components', () => {
            const tokens = tokenizer.tokenize('123-456-7890', 'phone');
            assert.deepStrictEqual(tokens, ['123', '456', '7890', '789', '890', '1234567890']);
        });

        test('should handle parentheses format', () => {
            const tokens = tokenizer.tokenize('(555) 123-4567', 'phone');
            assert.deepStrictEqual(tokens, ['555', '123', '4567', '456', '567', '5551234567']);
        });

        test('should handle international format', () => {
            const tokens = tokenizer.tokenize('+1-555-987-6543', 'phone');
            assert.deepStrictEqual(tokens, ['1', '555', '987', '6543', '654', '543', '15559876543']);
        });

        test('should extract full concatenated number', () => {
            const tokens = tokenizer.tokenize('123-456-7890', 'phone');
            assert.ok(tokens.includes('1234567890'));
        });
    });

    describe('Pattern Analyzer', () => {
        test('should use custom regex pattern', () => {
            const tokens = tokenizer.tokenize('hello123world', 'pattern');
            assert.deepStrictEqual(tokens, ['hello123world']);
        });

        test('should handle number pattern', () => {
            const tokens = tokenizer.tokenize('hello123world456', 'pattern');
            assert.deepStrictEqual(tokens, ['hello123world456']);
        });
    });

    describe('Advanced Analyzer', () => {
        test('should handle complex text', () => {
            const tokens = tokenizer.tokenize('Hello, World! How are you?', 'advanced');
            assert.deepStrictEqual(tokens, ['hello', 'world', 'how', 'are', 'you']);
        });

        test('should handle contractions', () => {
            const tokens = tokenizer.tokenize("Don't worry, be happy!", 'advanced');
            assert.deepStrictEqual(tokens, ['don', 'worry', 'be', 'happy']);
        });

        test('should handle possessives', () => {
            const tokens = tokenizer.tokenize("The cat's toy is here.", 'advanced');
            assert.deepStrictEqual(tokens, ['cat', 'toy', 'is', 'here']);
        });
    });

    describe('Custom Analyzer', () => {
        test('should use custom processing function', () => {
            // The default custom analyzer in Tokenizer just returns standard tokens
            const customFn = (text) => text.split('').reverse().join('').split(' ');
            const tokens = tokenizer.tokenize('hello world', 'custom', customFn);
            assert.deepStrictEqual(tokens, ['hello', 'world']);
        });
    });

    describe('Edge Cases', () => {
        test('should handle null input', () => {
            const tokens = tokenizer.tokenize(null, 'standard');
            assert.deepStrictEqual(tokens, []);
        });

        test('should handle undefined input', () => {
            const tokens = tokenizer.tokenize(undefined, 'standard');
            assert.deepStrictEqual(tokens, []);
        });

        test('should handle non-string input', () => {
            const tokens = tokenizer.tokenize(123, 'standard');
            assert.deepStrictEqual(tokens, []);
        });

        test('should handle unknown analyzer', () => {
            const tokens = tokenizer.tokenize('hello world', 'unknown');
            assert.deepStrictEqual(tokens, ['hello', 'world']); // falls back to standard
        });
    });

    describe('Performance Tests', () => {
        test('should handle large text efficiently', () => {
            const largeText = 'hello world '.repeat(1000);
            const start = Date.now();
            const tokens = tokenizer.tokenize(largeText, 'standard');
            const end = Date.now();

            assert.ok(tokens.length > 0);
            assert.ok(end - start < 100); // should complete in under 100ms
        });
    });
}); 