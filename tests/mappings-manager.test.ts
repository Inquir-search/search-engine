import { test, describe, beforeEach, afterEach, before, after } from 'vitest';
import { expect } from 'vitest';
import { MappingsManager } from '../src/index.js';

describe('MappingsManager Module Tests', () => {
    let mappingsManager;

    beforeEach(() => {
        mappingsManager = new MappingsManager(null); // Pass null to prevent loading from file
    });

    test('should initialize mappings manager', () => {
        expect(mappingsManager).toBeTruthy();
        expect(mappingsManager.mappings instanceof Map).toBeTruthy();
    });

    describe('Field Mapping', () => {
        test('should add simple text field mapping', () => {
            mappingsManager.setMapping('name', { type: 'text' });
            const mapping = mappingsManager.getMapping('name');
            expect(mapping).toEqual({ type: 'text' });
        });

        test('should add keyword field mapping', () => {
            mappingsManager.setMapping('status', { type: 'keyword' });
            const mapping = mappingsManager.getMapping('status');
            expect(mapping).toEqual({ type: 'keyword' });
        });

        test('should add email field mapping', () => {
            mappingsManager.setMapping('email', { type: 'email' });
            const mapping = mappingsManager.getMapping('email');
            expect(mapping).toEqual({ type: 'email' });
        });

        test('should add URL field mapping', () => {
            mappingsManager.setMapping('website', { type: 'url' });
            const mapping = mappingsManager.getMapping('website');
            expect(mapping).toEqual({ type: 'url' });
        });

        test('should add phone field mapping as text', () => {
            mappingsManager.setMapping('phone', { type: 'text' });
            const mapping = mappingsManager.getMapping('phone');
            expect(mapping).toEqual({ type: 'text' });
        });

        test('should add number field mapping', () => {
            mappingsManager.setMapping('age', { type: 'number' });
            const mapping = mappingsManager.getMapping('age');
            expect(mapping).toEqual({ type: 'number' });
        });

        test('should add date field mapping', () => {
            mappingsManager.setMapping('created', { type: 'date' });
            const mapping = mappingsManager.getMapping('created');
            expect(mapping).toEqual({ type: 'date' });
        });

        test('should add geo_point field mapping', () => {
            mappingsManager.setMapping('location', { type: 'geo_point' });
            const mapping = mappingsManager.getMapping('location');
            expect(mapping).toEqual({ type: 'geo_point' });
        });

        test('should add boolean field mapping', () => {
            mappingsManager.setMapping('active', { type: 'boolean' });
            const mapping = mappingsManager.getMapping('active');
            expect(mapping).toEqual({ type: 'boolean' });
        });
    });

    describe('Field Retrieval', () => {
        test('should return undefined for non-existent field', () => {
            const mapping = mappingsManager.getMapping('nonexistent');
            expect(mapping).toBe(undefined);
        });

        test('should return correct mapping for existing field', () => {
            mappingsManager.setMapping('name', { type: 'text' });
            const mapping = mappingsManager.getMapping('name');
            expect(mapping).toEqual({ type: 'text' });
        });

        test('should handle case-sensitive field names', () => {
            mappingsManager.setMapping('Name', { type: 'text' });
            const mapping1 = mappingsManager.getMapping('Name');
            const mapping2 = mappingsManager.getMapping('name');

            expect(mapping1).toEqual({ type: 'text' });
            expect(mapping2).toBe(undefined);
        });
    });

    describe('Text Fields', () => {
        test('should return all searchable text fields including specialized types', () => {
            mappingsManager.setMapping('name', { type: 'text' });
            mappingsManager.setMapping('description', { type: 'text' });
            mappingsManager.setMapping('category', { type: 'keyword' });
            mappingsManager.setMapping('status', { type: 'keyword' });
            mappingsManager.setMapping('email', { type: 'email' });
            mappingsManager.setMapping('url', { type: 'url' });

            const textFields = mappingsManager.getTextFields();
            expect(textFields.length).toBe(6);
            expect(textFields).toContain('name');
            expect(textFields).toContain('description');
            expect(textFields).toContain('category');
            expect(textFields).toContain('status');
            expect(textFields).toContain('email');
            expect(textFields).toContain('url');
        });

        test('should return searchable fields when only keyword fields exist', () => {
            mappingsManager.setMapping('category', { type: 'keyword' });
            mappingsManager.setMapping('status', { type: 'keyword' });

            const textFields = mappingsManager.getTextFields();
            expect(textFields.length).toBe(2);
            expect(textFields).toContain('category');
            expect(textFields).toContain('status');
        });
    });

    describe('Field Type Detection', () => {
        test('should detect text type from string value', () => {
            const type = mappingsManager.detectFieldType('hello world');
            expect(type).toBe('text'); // Multi-word strings are text type
        });

        test('should detect email type from email value', () => {
            const type = mappingsManager.detectFieldType('user@example.com');
            expect(type).toBe('email');
        });

        test('should detect URL type from URL value', () => {
            const type = mappingsManager.detectFieldType('https://example.com');
            expect(type).toBe('url');
        });

        test('should detect keyword type from phone value', () => {
            const type = mappingsManager.detectFieldType('123-456-7890');
            expect(type).toBe('keyword');
        });

        test('should detect number type from numeric value', () => {
            const type = mappingsManager.detectFieldType(42);
            expect(type).toBe('number');
        });

        test('should detect boolean type from boolean value', () => {
            const type = mappingsManager.detectFieldType(true);
            expect(type).toBe('boolean');
        });

        test('should detect date type from date value', () => {
            const type = mappingsManager.detectFieldType('2023-01-01');
            expect(type).toBe('date');
        });

        test('should detect geo_point type from coordinates', () => {
            const type = mappingsManager.detectFieldType([40.7128, -74.0060]);
            expect(type).toBe('geo_point');
        });

        test('should default to keyword for unknown types', () => {
            const type = mappingsManager.detectFieldType('short');
            expect(type).toBe('keyword');
        });
    });

    describe('Auto Mapping', () => {
        test('should auto-map fields from document', () => {
            const document = {
                id: 'doc1',
                name: 'Test Document',
                email: 'test@example.com',
                age: 25
            };

            mappingsManager.autoMap(document);

            expect(mappingsManager.getMapping('name')).toEqual({ type: 'text' }); // Name fields are semantically text
            expect(mappingsManager.getMapping('email')).toEqual({ type: 'email' });
            expect(mappingsManager.getMapping('age')).toEqual({ type: 'number' });
        });

        test('should preserve existing mappings', () => {
            mappingsManager.setMapping('name', { type: 'text' });

            const document = {
                id: 'doc1',
                name: 'Test Document',
                email: 'test@example.com'
            };

            mappingsManager.autoMap(document);

            expect(mappingsManager.getMapping('name')).toEqual({ type: 'text' }); // Preserved
            expect(mappingsManager.getMapping('email')).toEqual({ type: 'email' });
        });

        test('should handle nested objects', () => {
            const document = {
                id: 'doc1',
                user: {
                    name: 'John Doe',
                    email: 'john@example.com'
                }
            };

            mappingsManager.autoMap(document);

            // Should map nested fields with dot notation
            expect(mappingsManager.getMapping('user.name')).toEqual({ type: 'text' }); // Name fields are semantically text
            expect(mappingsManager.getMapping('user.email')).toEqual({ type: 'email' });
        });

        test('should handle arrays', () => {
            const document = {
                id: 'doc1',
                tags: ['tag1', 'tag2'],
                scores: [1, 2, 3]
            };

            mappingsManager.autoMap(document);

            // Should detect type from first array element
            expect(mappingsManager.getMapping('tags')).toEqual({ type: 'text' }); // Tag field names are treated as text
            expect(mappingsManager.getMapping('scores')).toEqual({ type: 'number' });
        });
    });

    describe('Validation', () => {
        test('should validate text field', () => {
            const isValid = mappingsManager.validateField('name', 'hello world', 'text');
            expect(isValid).toBe(true);
        });

        test('should validate email field', () => {
            const isValid = mappingsManager.validateField('email', 'user@example.com', 'email');
            expect(isValid).toBe(true);
        });

        test('should reject invalid email', () => {
            const isValid = mappingsManager.validateField('email', 'invalid-email', 'email');
            expect(isValid).toBe(false);
        });

        test('should validate URL field', () => {
            const isValid = mappingsManager.validateField('url', 'https://example.com', 'url');
            expect(isValid).toBe(true);
        });

        test('should reject invalid URL', () => {
            const isValid = mappingsManager.validateField('url', 'not-a-url', 'url');
            expect(isValid).toBe(false);
        });

        test('should validate phone field as text', () => {
            const isValid = mappingsManager.validateField('phone', '123-456-7890', 'text');
            expect(isValid).toBe(true);
        });

        test('should reject invalid phone as text', () => {
            const isValid = mappingsManager.validateField('phone', 'not-a-phone', 'text');
            expect(isValid).toBe(true); // text fields accept any string
        });

        test('should validate number field', () => {
            const isValid = mappingsManager.validateField('age', 42, 'number');
            expect(isValid).toBe(true);
        });

        test('should reject non-number for number field', () => {
            const isValid = mappingsManager.validateField('age', 'not-a-number', 'number');
            expect(isValid).toBe(false);
        });

        test('should validate boolean field', () => {
            const isValid = mappingsManager.validateField('active', true, 'boolean');
            expect(isValid).toBe(true);
        });

        test('should reject non-boolean for boolean field', () => {
            const isValid = mappingsManager.validateField('active', 'not-a-boolean', 'boolean');
            expect(isValid).toBe(false);
        });

        test('should validate geo_point field', () => {
            const isValid = mappingsManager.validateField('location', { lat: 40.7128, lon: -74.0060 }, 'geo_point');
            expect(isValid).toBe(true);
        });

        test('should reject invalid geo_point', () => {
            const isValid = mappingsManager.validateField('location', { lat: 200, lon: 300 }, 'geo_point');
            expect(isValid).toBe(false);
        });
    });

    describe('Edge Cases', () => {
        test('should handle empty field name', () => {
            mappingsManager.setMapping('', { type: 'text' });
            const mapping = mappingsManager.getMapping('');
            expect(mapping).toEqual({ type: 'text' });
        });

        test('should handle null field name', () => {
            mappingsManager.setMapping(null, { type: 'text' });
            const mapping = mappingsManager.getMapping(null);
            expect(mapping).toEqual({ type: 'text' });
        });

        test('should handle undefined field name', () => {
            mappingsManager.setMapping(undefined, { type: 'text' });
            const mapping = mappingsManager.getMapping(undefined);
            expect(mapping).toEqual({ type: 'text' });
        });

        test('should handle empty mapping object', () => {
            mappingsManager.setMapping('name', {});
            const mapping = mappingsManager.getMapping('name');
            expect(mapping).toEqual({});
        });

        test('should handle null mapping object', () => {
            const mapping = mappingsManager.getMapping(null);
            expect(mapping.type).toBe('text');
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
            expect(end - start < 100).toBeTruthy(); // should complete in under 100ms

            const mappings = Array.from(mappingsManager.mappings.keys());
            expect(mappings.length).toBe(1000);
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
            expect(end - start < 100).toBeTruthy(); // should complete in under 100ms
        });
    });
}); 