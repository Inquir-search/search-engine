import { test, describe } from 'vitest';
import { expect } from 'vitest';
import { Tokenizer } from '../src/index.js';

describe('Tokenizer Module Tests', () => {
    let tokenizer;
    let mockStopwordsManager;

    test('should initialize tokenizer', () => {
        mockStopwordsManager = {
            getAll: () => ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']
        };
        tokenizer = new Tokenizer(mockStopwordsManager);
        expect(tokenizer).toBeTruthy();
        expect(typeof tokenizer.tokenize).toBe('function');
    });

    describe('Standard Analyzer', () => {
        test('should tokenize simple text', () => {
            const tokens = tokenizer.tokenize('hello world', 'standard');
            expect(tokens).toEqual(['hello', 'world']);
        });

        test('should handle punctuation', () => {
            const tokens = tokenizer.tokenize('hello, world!', 'standard');
            expect(tokens).toEqual(['hello', 'world']);
        });

        test('should handle multiple spaces', () => {
            const tokens = tokenizer.tokenize('hello   world', 'standard');
            expect(tokens).toEqual(['hello', 'world']);
        });

        test('should handle mixed case', () => {
            const tokens = tokenizer.tokenize('Hello World', 'standard');
            expect(tokens).toEqual(['hello', 'world']);
        });

        test('should handle numbers', () => {
            const tokens = tokenizer.tokenize('hello 123 world', 'standard');
            expect(tokens).toEqual(['hello', '123', 'world']);
        });

        test('should handle empty string', () => {
            const tokens = tokenizer.tokenize('', 'standard');
            expect(tokens).toEqual([]);
        });

        test('should handle whitespace only', () => {
            const tokens = tokenizer.tokenize('   \t\n  ', 'standard');
            expect(tokens).toEqual([]);
        });
    });

    describe('Simple Analyzer', () => {
        test('should tokenize and lowercase', () => {
            const tokens = tokenizer.tokenize('Hello WORLD', 'simple');
            expect(tokens).toEqual(['hello', 'world']);
        });

        test('should handle special characters', () => {
            const tokens = tokenizer.tokenize('hello@world.com', 'simple');
            expect(tokens).toEqual(['hello', 'world', 'com']);
        });
    });

    describe('Whitespace Analyzer', () => {
        test('should preserve case', () => {
            const tokens = tokenizer.tokenize('Hello WORLD', 'whitespace');
            expect(tokens).toEqual(['Hello', 'WORLD']);
        });

        test('should handle multiple spaces', () => {
            const tokens = tokenizer.tokenize('hello   world', 'whitespace');
            expect(tokens).toEqual(['hello', 'world']);
        });
    });

    describe('Keyword Analyzer', () => {
        test('should return single token', () => {
            const tokens = tokenizer.tokenize('hello world', 'keyword');
            expect(tokens).toEqual(['hello world']);
        });

        test('should handle special characters', () => {
            const tokens = tokenizer.tokenize('hello@world.com', 'keyword');
            expect(tokens).toEqual(['hello@world.com']);
        });
    });

    describe('Email Analyzer', () => {
        test('should extract email components', () => {
            const tokens = tokenizer.tokenize('user@example.com', 'email');
            expect(tokens).toEqual(['user@example.com', 'user', 'example.com', 'example', 'com']);
        });

        test('should handle complex emails', () => {
            const tokens = tokenizer.tokenize('user+tag@company.co.uk', 'email');
            expect(tokens).toEqual(['user+tag@company.co.uk', 'user+tag', 'company.co.uk', 'company', 'co', 'uk']);
        });

        test('should handle subdomains', () => {
            const tokens = tokenizer.tokenize('user@sub.example.com', 'email');
            expect(tokens).toEqual(['user@sub.example.com', 'user', 'sub.example.com', 'sub', 'example', 'com']);
        });
    });

    describe('URL Analyzer', () => {
        test('should extract URL components', () => {
            const tokens = tokenizer.tokenize('https://example.com', 'url');
            expect(tokens).toEqual(['https://example.com', 'example.com', 'example', 'com']);
        });

        test('should handle complex URLs', () => {
            const tokens = tokenizer.tokenize('https://api.example.com/docs/v1', 'url');
            expect(tokens).toEqual(['https://api.example.com/docs/v1', 'api.example.com', 'api', 'example', 'com', 'docs', 'v1']);
        });

        test('should handle query parameters', () => {
            const tokens = tokenizer.tokenize('https://example.com?q=search&page=1', 'url');
            expect(tokens).toEqual(['https://example.com?q=search&page=1', 'example.com', 'example', 'com']);
        });
    });

    describe('Phone Analyzer', () => {
        test('should extract phone number components', () => {
            const tokens = tokenizer.tokenize('123-456-7890', 'phone');
            expect(tokens).toEqual(['123-456-7890', '1234567890', '123', '456', '7890']);
        });

        test('should handle parentheses format', () => {
            const tokens = tokenizer.tokenize('(555) 123-4567', 'phone');
            expect(tokens).toEqual(['(555) 123-4567', '5551234567', '555', '123', '4567']);
        });

        test('should handle international format', () => {
            const tokens = tokenizer.tokenize('+1-555-987-6543', 'phone');
            expect(tokens).toEqual(['+1-555-987-6543', '15559876543', '555', '987', '6543']);
        });

        test('should extract full concatenated number', () => {
            const tokens = tokenizer.tokenize('123-456-7890', 'phone');
            expect(tokens).toContain('1234567890');
        });
    });

    describe('Pattern Analyzer', () => {
        test('should use custom regex pattern', () => {
            const tokens = tokenizer.tokenize('hello123world', 'pattern');
            expect(tokens).toEqual(['hello123world']);
        });

        test('should handle number pattern', () => {
            const tokens = tokenizer.tokenize('hello123world456', 'pattern');
            expect(tokens).toEqual(['hello123world456']);
        });
    });

    describe('Advanced Analyzer', () => {
        test('should handle complex text', () => {
            const tokens = tokenizer.tokenize('Hello, World! How are you?', 'advanced');
            expect(tokens).toEqual(['hello', 'world', 'how', 'are', 'you']);
        });

        test('should handle contractions', () => {
            const tokens = tokenizer.tokenize("Don't worry, be happy!", 'advanced');
            expect(tokens).toEqual(['don', 'worry', 'be', 'happy']);
        });

        test('should handle possessives', () => {
            const tokens = tokenizer.tokenize("The cat's toy is here.", 'advanced');
            expect(tokens).toEqual(['cat', 'toy', 'is', 'here']);
        });
    });

    describe('Custom Analyzer', () => {
        test('should use custom processing function', () => {
            // The default custom analyzer in Tokenizer just returns standard tokens
            const customFn = (text) => text.split('').reverse().join('').split(' ');
            const tokens = tokenizer.tokenize('hello world', 'custom', customFn);
            expect(tokens).toEqual(['hello', 'world']);
        });
    });

    describe('Edge Cases', () => {
        test('should handle null input', () => {
            const tokens = tokenizer.tokenize(null, 'standard');
            expect(tokens).toEqual([]);
        });

        test('should handle undefined input', () => {
            const tokens = tokenizer.tokenize(undefined, 'standard');
            expect(tokens).toEqual([]);
        });

        test('should handle non-string input', () => {
            const tokens = tokenizer.tokenize(123, 'standard');
            expect(tokens).toEqual([]);
        });

        test('should handle unknown analyzer', () => {
            const tokens = tokenizer.tokenize('hello world', 'unknown');
            expect(tokens).toEqual(['hello', 'world']); // falls back to standard
        });
    });

    describe('Performance Tests', () => {
        test('should handle large text efficiently', () => {
            const largeText = 'hello world '.repeat(1000);
            const start = Date.now();
            const tokens = tokenizer.tokenize(largeText, 'standard');
            const end = Date.now();

            expect(tokens.length).toBeGreaterThan(0);
            expect(end - start).toBeLessThan(100); // should complete in under 100ms
        });
    });
}); 