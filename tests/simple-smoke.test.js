import { test, describe } from 'node:test';
import assert from 'node:assert';

describe('Smoke Tests', () => {
    test('should run basic assertions', () => {
        assert.strictEqual(1 + 1, 2);
        assert.ok(true);
        assert.strictEqual(typeof 'hello', 'string');
    });

    test('should handle async operations', async () => {
        const result = await Promise.resolve('async result');
        assert.strictEqual(result, 'async result');
    });

    test('should work with arrays', () => {
        const arr = [1, 2, 3];
        assert.strictEqual(arr.length, 3);
        assert.deepStrictEqual(arr, [1, 2, 3]);
    });

    test('should work with objects', () => {
        const obj = { name: 'test', value: 42 };
        assert.strictEqual(obj.name, 'test');
        assert.strictEqual(obj.value, 42);
        assert.ok(obj.hasOwnProperty('name'));
    });

    test('should handle errors', () => {
        assert.throws(() => {
            throw new Error('Test error');
        }, Error);
    });

    test('should handle async errors', async () => {
        await assert.rejects(async () => {
            throw new Error('Async error');
        }, Error);
    });
}); 