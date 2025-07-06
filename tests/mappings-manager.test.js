import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import MappingsManager from '../src/domain/MappingsManager.js';

describe('MappingsManager Module Tests', () => {
    let mappingsManager;

    beforeEach(() => {
        mappingsManager = new MappingsManager(null); // Pass null to prevent loading from file
    });

    test('should initialize mappings manager', () => {
        assert.ok(mappingsManager);
        assert.ok(mappingsManager.mappings instanceof Map);
    });

    describe('Field Mapping', () => {
        test('should add simple text field mapping', () => {
            mappingsManager.setMapping('name', { type: 'text' });
            const mapping = mappingsManager.getMapping('name');
            assert.deepStrictEqual(mapping, { type: 'text' });
        });

        test('should add keyword field mapping', () => {
            mappingsManager.setMapping('status', { type: 'keyword' });
            const mapping = mappingsManager.getMapping('status');
            assert.deepStrictEqual(mapping, { type: 'keyword' });
        });

        test('should add email field mapping', () => {
            mappingsManager.setMapping('email', { type: 'email' });
            const mapping = mappingsManager.getMapping('email');
            assert.deepStrictEqual(mapping, { type: 'email' });
        });

        test('should add URL field mapping', () => {
            mappingsManager.setMapping('website', { type: 'url' });
            const mapping = mappingsManager.getMapping('website');
            assert.deepStrictEqual(mapping, { type: 'url' });
        });

        test('should add phone field mapping', () => {
            mappingsManager.setMapping('phone', { type: 'phone' });
            const mapping = mappingsManager.getMapping('phone');
            assert.deepStrictEqual(mapping, { type: 'phone' });
        });

        test('should add number field mapping', () => {
            mappingsManager.setMapping('age', { type: 'number' });
            const mapping = mappingsManager.getMapping('age');
            assert.deepStrictEqual(mapping, { type: 'number' });
        });

        test('should add date field mapping', () => {
            mappingsManager.setMapping('created', { type: 'date' });
            const mapping = mappingsManager.getMapping('created');
            assert.deepStrictEqual(mapping, { type: 'date' });
        });

        test('should add geo_point field mapping', () => {
            mappingsManager.setMapping('location', { type: 'geo_point' });
            const mapping = mappingsManager.getMapping('location');
            assert.deepStrictEqual(mapping, { type: 'geo_point' });
        });

        test('should add boolean field mapping', () => {
            mappingsManager.setMapping('active', { type: 'boolean' });
            const mapping = mappingsManager.getMapping('active');
            assert.deepStrictEqual(mapping, { type: 'boolean' });
        });
    });

    describe('Field Retrieval', () => {
        test('should return undefined for non-existent field', () => {
            const mapping = mappingsManager.getMapping('nonexistent');
            assert.strictEqual(mapping, undefined);
        });

        test('should return correct mapping for existing field', () => {
            mappingsManager.setMapping('name', { type: 'text' });
            const mapping = mappingsManager.getMapping('name');
            assert.deepStrictEqual(mapping, { type: 'text' });
        });

        test('should handle case-sensitive field names', () => {
            mappingsManager.setMapping('Name', { type: 'text' });
            const mapping1 = mappingsManager.getMapping('Name');
            const mapping2 = mappingsManager.getMapping('name');

            assert.deepStrictEqual(mapping1, { type: 'text' });
            assert.strictEqual(mapping2, undefined);
        });
    });

    describe('Text Fields', () => {
        test('should return all text fields', () => {
            mappingsManager.setMapping('name', { type: 'text' });
            mappingsManager.setMapping('description', { type: 'text' });
            mappingsManager.setMapping('status', { type: 'keyword' });
            mappingsManager.setMapping('email', { type: 'email' });
            mappingsManager.setMapping('website', { type: 'url' });
            mappingsManager.setMapping('phone', { type: 'phone' });

            const textFields = mappingsManager.getTextFields();
            assert.strictEqual(textFields.length, 6);
            assert.ok(textFields.includes('name'));
            assert.ok(textFields.includes('description'));
            assert.ok(textFields.includes('status'));
            assert.ok(textFields.includes('email'));
            assert.ok(textFields.includes('website'));
            assert.ok(textFields.includes('phone'));
        });

        test('should return empty array when no text fields', () => {
            mappingsManager.setMapping('age', { type: 'number' });
            mappingsManager.setMapping('active', { type: 'boolean' });

            const textFields = mappingsManager.getTextFields();
            assert.strictEqual(textFields.length, 0);
        });
    });

    describe('Field Type Detection', () => {
        test('should detect text type from string value', () => {
            const type = mappingsManager.detectFieldType('hello world');
            assert.strictEqual(type, 'text');
        });

        test('should detect email type from email value', () => {
            const type = mappingsManager.detectFieldType('user@example.com');
            assert.strictEqual(type, 'email');
        });

        test('should detect URL type from URL value', () => {
            const type = mappingsManager.detectFieldType('https://example.com');
            assert.strictEqual(type, 'url');
        });

        test('should detect phone type from phone value', () => {
            const type = mappingsManager.detectFieldType('123-456-7890');
            assert.strictEqual(type, 'phone');
        });

        test('should detect number type from numeric value', () => {
            const type = mappingsManager.detectFieldType(42);
            assert.strictEqual(type, 'number');
        });

        test('should detect boolean type from boolean value', () => {
            const type = mappingsManager.detectFieldType(true);
            assert.strictEqual(type, 'boolean');
        });

        test('should detect date type from date value', () => {
            const type = mappingsManager.detectFieldType(new Date());
            assert.strictEqual(type, 'date');
        });

        test('should detect geo_point type from coordinates', () => {
            const type = mappingsManager.detectFieldType({ lat: 40.7128, lon: -74.0060 });
            assert.strictEqual(type, 'geo_point');
        });

        test('should default to text for unknown types', () => {
            const type = mappingsManager.detectFieldType(null);
            assert.strictEqual(type, 'text');
        });
    });

    describe('Auto Mapping', () => {
        test('should auto-map fields from document', () => {
            const document = {
                name: 'John Doe',
                email: 'john@example.com',
                age: 30,
                active: true,
                location: { lat: 40.7128, lon: -74.0060 }
            };

            mappingsManager.autoMap(document);

            assert.deepStrictEqual(mappingsManager.getMapping('name'), { type: 'text' });
            assert.deepStrictEqual(mappingsManager.getMapping('email'), { type: 'email' });
            assert.deepStrictEqual(mappingsManager.getMapping('age'), { type: 'number' });
            assert.deepStrictEqual(mappingsManager.getMapping('active'), { type: 'boolean' });
            assert.deepStrictEqual(mappingsManager.getMapping('location'), { type: 'geo_point' });
        });

        test('should preserve existing mappings', () => {
            mappingsManager.setMapping('name', { type: 'keyword' });

            const document = { name: 'John Doe' };
            mappingsManager.autoMap(document);

            // Should preserve existing mapping
            assert.deepStrictEqual(mappingsManager.getMapping('name'), { type: 'keyword' });
        });

        test('should handle nested objects', () => {
            const document = {
                user: {
                    name: 'John',
                    email: 'john@example.com'
                }
            };

            mappingsManager.autoMap(document);

            // Should map nested fields with dot notation
            assert.deepStrictEqual(mappingsManager.getMapping('user.name'), { type: 'text' });
            assert.deepStrictEqual(mappingsManager.getMapping('user.email'), { type: 'email' });
        });

        test('should handle arrays', () => {
            const document = {
                tags: ['tag1', 'tag2'],
                scores: [85, 92, 78]
            };

            mappingsManager.autoMap(document);

            // Should detect type from first array element
            assert.deepStrictEqual(mappingsManager.getMapping('tags'), { type: 'text' });
            assert.deepStrictEqual(mappingsManager.getMapping('scores'), { type: 'number' });
        });
    });

    describe('Validation', () => {
        test('should validate text field', () => {
            const isValid = mappingsManager.validateField('name', 'hello world', 'text');
            assert.strictEqual(isValid, true);
        });

        test('should validate email field', () => {
            const isValid = mappingsManager.validateField('email', 'user@example.com', 'email');
            assert.strictEqual(isValid, true);
        });

        test('should reject invalid email', () => {
            const isValid = mappingsManager.validateField('email', 'invalid-email', 'email');
            assert.strictEqual(isValid, false);
        });

        test('should validate URL field', () => {
            const isValid = mappingsManager.validateField('url', 'https://example.com', 'url');
            assert.strictEqual(isValid, true);
        });

        test('should reject invalid URL', () => {
            const isValid = mappingsManager.validateField('url', 'not-a-url', 'url');
            assert.strictEqual(isValid, false);
        });

        test('should validate phone field', () => {
            const isValid = mappingsManager.validateField('phone', '123-456-7890', 'phone');
            assert.strictEqual(isValid, true);
        });

        test('should reject invalid phone', () => {
            const isValid = mappingsManager.validateField('phone', 'not-a-phone', 'phone');
            assert.strictEqual(isValid, false);
        });

        test('should validate number field', () => {
            const isValid = mappingsManager.validateField('age', 42, 'number');
            assert.strictEqual(isValid, true);
        });

        test('should reject non-number for number field', () => {
            const isValid = mappingsManager.validateField('age', 'not-a-number', 'number');
            assert.strictEqual(isValid, false);
        });

        test('should validate boolean field', () => {
            const isValid = mappingsManager.validateField('active', true, 'boolean');
            assert.strictEqual(isValid, true);
        });

        test('should reject non-boolean for boolean field', () => {
            const isValid = mappingsManager.validateField('active', 'not-a-boolean', 'boolean');
            assert.strictEqual(isValid, false);
        });

        test('should validate geo_point field', () => {
            const isValid = mappingsManager.validateField('location', { lat: 40.7128, lon: -74.0060 }, 'geo_point');
            assert.strictEqual(isValid, true);
        });

        test('should reject invalid geo_point', () => {
            const isValid = mappingsManager.validateField('location', { lat: 200, lon: 300 }, 'geo_point');
            assert.strictEqual(isValid, false);
        });
    });

    describe('Edge Cases', () => {
        test('should handle empty field name', () => {
            mappingsManager.setMapping('', { type: 'text' });
            const mapping = mappingsManager.getMapping('');
            assert.deepStrictEqual(mapping, { type: 'text' });
        });

        test('should handle null field name', () => {
            mappingsManager.setMapping(null, { type: 'text' });
            const mapping = mappingsManager.getMapping(null);
            assert.deepStrictEqual(mapping, { type: 'text' });
        });

        test('should handle undefined field name', () => {
            mappingsManager.setMapping(undefined, { type: 'text' });
            const mapping = mappingsManager.getMapping(undefined);
            assert.deepStrictEqual(mapping, { type: 'text' });
        });

        test('should handle empty mapping object', () => {
            mappingsManager.setMapping('name', {});
            const mapping = mappingsManager.getMapping('name');
            assert.deepStrictEqual(mapping, {});
        });

        test('should handle null mapping object', () => {
            const mapping = mappingsManager.getMapping(null);
            assert.strictEqual(mapping.type, 'text');
        });

        test('should not add null field name to mappings', () => {
            mappingsManager.setMapping(null, { type: 'text' });
        });
    });

    describe('Performance Tests', () => {
        test('should handle many field mappings efficiently', () => {
            const start = Date.now();

            for (let i = 0; i < 1000; i++) {
                mappingsManager.setMapping(`field${i}`, { type: 'text' });
            }

            const end = Date.now();
            assert.ok(end - start < 100); // should complete in under 100ms

            const mappings = Array.from(mappingsManager.mappings.keys());
            assert.strictEqual(mappings.length, 1000);
        });

        test('should handle many field retrievals efficiently', () => {
            // Setup
            for (let i = 0; i < 1000; i++) {
                mappingsManager.setMapping(`field${i}`, { type: 'text' });
            }

            const start = Date.now();

            for (let i = 0; i < 1000; i++) {
                mappingsManager.getMapping(`field${i}`);
            }

            const end = Date.now();
            assert.ok(end - start < 100); // should complete in under 100ms
        });
    });
}); 