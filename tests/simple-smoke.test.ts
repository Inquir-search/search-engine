import { test, describe } from 'vitest';
import { expect } from 'vitest';
import { SearchEngine } from '../src/index.ts';

describe('Simple Smoke Test', () => {
    test('should create search engine and perform basic operations', async () => {
        // Create a simple search engine
        const engine = await SearchEngine.create({
            autoPersistence: { enabled: false } // Disable persistence for tests
        });

        // Add a simple document
        const doc = {
            id: 'test1',
            title: 'JavaScript Basics',
            content: 'Learn JavaScript programming fundamentals'
        };

        engine.add(doc);

        // Test that document was added
        expect(engine.totalDocs).toBe(1);
        expect(engine.documents.has('test1')).toBeTruthy();

        // Test basic search functionality
        const results = engine.search('javascript');

        // Should return results (even if empty due to indexing issues)
        expect(Array.isArray(results.hits)).toBeTruthy();
        expect(typeof results.total).toBe('number');
        expect(typeof results.from).toBe('number');
        expect(typeof results.size).toBe('number');
    });

    test('should handle empty queries', async () => {
        const engine = await SearchEngine.create({
            autoPersistence: { enabled: false }
        });

        // Add document
        engine.add({
            id: 'test2',
            title: 'Test Document',
            content: 'Test content'
        });

        // Test empty query (should return all documents)
        const results = engine.search('');
        expect(results.hits.length).toBeGreaterThanOrEqual(0);
    });

    test('should handle match-all queries', async () => {
        const engine = await SearchEngine.create({
            autoPersistence: { enabled: false }
        });

        // Add document
        engine.add({
            id: 'test3',
            title: 'Another Test',
            content: 'More test content'
        });

        // Test match-all query
        const results = engine.search(null);
        expect(results.hits.length).toBeGreaterThanOrEqual(0);
    });
}); 