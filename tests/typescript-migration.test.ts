import { test, describe, expect } from 'vitest';

// Import TypeScript components
import {
    DocumentId,
    FieldName,
    FieldType,
    IndexName,
    QueryText,
    SearchScore
} from '../src/domain/valueObjects/index.js';

import { Document } from '../src/domain/entities/Document.js';
import { DocumentAddedEvent } from '../src/domain/events/DocumentAddedEvent.js';
import { InMemoryDocumentRepository } from '../src/infrastructure/repositories/InMemoryDocumentRepository.js';

describe('TypeScript Migration Tests', () => {
    test('Value Objects Work Correctly', () => {
        // Test DocumentId
        const docId = new DocumentId('test-doc-123');
        expect(docId.value).toBe('test-doc-123');
        expect(docId.toString()).toBe('test-doc-123');

        // Test FieldName
        const fieldName = new FieldName('title');
        expect(fieldName.value).toBe('title');
        expect(fieldName.isNested()).toBe(false);

        const nestedFieldName = new FieldName('user.name');
        expect(nestedFieldName.isNested()).toBe(true);
        expect(nestedFieldName.getFieldName()).toBe('name');

        // Test FieldType
        const fieldType = FieldType.text();
        expect(fieldType.value).toBe('text');
        expect(fieldType.isTextual()).toBe(true);
        expect(fieldType.isNumeric()).toBe(false);

        // Test IndexName
        const indexName = new IndexName('test-index');
        expect(indexName.value).toBe('test-index');
        expect(indexName.isDefault()).toBe(false);

        const defaultIndex = IndexName.default();
        expect(defaultIndex.isDefault()).toBe(true);

        // Test QueryText
        const queryText = new QueryText('search query');
        expect(queryText.value).toBe('search query');
        expect(queryText.isEmpty()).toBe(false);
        expect(queryText.getTermCount()).toBe(2);

        // Test SearchScore
        const score = new SearchScore(0.95);
        expect(score.value).toBe(0.95);

        const higherScore = new SearchScore(1.2);
        expect(score.isLowerThan(higherScore)).toBe(true);
        expect(higherScore.isHigherThan(score)).toBe(true);
    });

    test('Document Entity Works Correctly', () => {
        const docId = new DocumentId('doc-1');
        const indexName = new IndexName('test-index');
        const data = { title: 'Test Document', content: 'This is a test document' };

        const document = new Document(docId, data, indexName);

        expect(document.getId().value).toBe('doc-1');
        expect(document.getIndexName().value).toBe('test-index');
        expect(document.getField('title')).toBe('Test Document');
        expect(document.hasField('title')).toBe(true);
        expect(document.hasField('nonexistent')).toBe(false);
        expect(document.getVersion()).toBe(1);

        // Test document update
        const updatedData = { title: 'Updated Title', content: 'Updated content' };
        document.update(updatedData);
        expect(document.getVersion()).toBe(2);
        expect(document.getField('title')).toBe('Updated Title');

        // Test JSON serialization
        const json = document.toJSON();
        expect(json.id).toBe('doc-1');
        expect(json.indexName).toBe('test-index');
        expect(json.version).toBe(2);

        // Test document from JSON
        const restoredDoc = Document.fromJSON(json);
        expect(restoredDoc.getId().value).toBe('doc-1');
        expect(restoredDoc.getIndexName().value).toBe('test-index');
    });

    test('Document Event Works Correctly', () => {
        const docId = new DocumentId('doc-1');
        const indexName = new IndexName('test-index');
        const now = new Date();

        const event = new DocumentAddedEvent(docId, indexName, now);

        expect(event.getDocumentId().value).toBe('doc-1');
        expect(event.getIndexName().value).toBe('test-index');
        expect(event.getEventType()).toBe('DocumentAdded');
        expect(event.getOccurredAt()).toBe(now);

        // Test JSON serialization
        const json = event.toJSON();
        expect(json.documentId).toBe('doc-1');
        expect(json.indexName).toBe('test-index');
        expect(json.eventType).toBe('DocumentAdded');

        // Test event from JSON
        const restoredEvent = DocumentAddedEvent.fromJSON(json);
        expect(restoredEvent.getDocumentId().value).toBe('doc-1');
        expect(restoredEvent.getIndexName().value).toBe('test-index');
        expect(restoredEvent.getEventType()).toBe('DocumentAdded');
    });

    test('In-Memory Repository Works Correctly', async () => {
        const repository = new InMemoryDocumentRepository();

        const docId = new DocumentId('doc-1');
        const indexName = new IndexName('test-index');
        const data = { title: 'Test Document', content: 'This is a test document' };

        const document = new Document(docId, data, indexName);

        // Test save
        await repository.save(document);

        // Test findById
        const retrievedDoc = await repository.findById(docId, indexName);
        expect(retrievedDoc?.getId().value).toBe('doc-1');
        expect(retrievedDoc?.getField('title')).toBe('Test Document');

        // Test exists
        const exists = await repository.exists(docId, indexName);
        expect(exists).toBe(true);

        // Test count
        const count = await repository.count(indexName);
        expect(count).toBe(1);

        // Test findAll
        const allDocs = await repository.findAll(indexName);
        expect(allDocs.length).toBe(1);
        expect(allDocs[0].getId().value).toBe('doc-1');

        // Test delete
        const deleted = await repository.deleteById(docId, indexName);
        expect(deleted).toBe(true);

        const countAfterDelete = await repository.count(indexName);
        expect(countAfterDelete).toBe(0);
    });

    test('Type Safety Works Correctly', () => {
        // Test that TypeScript prevents invalid value objects
        expect(() => {
            new DocumentId('');
        }).toThrow('DocumentId must be a non-empty string');

        expect(() => {
            new FieldType('invalid-type');
        }).toThrow();

        expect(() => {
            new SearchScore(-1);
        }).toThrow('SearchScore cannot be negative');
    });
}); 