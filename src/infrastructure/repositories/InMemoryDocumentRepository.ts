import { DocumentRepository } from '../../domain/repositories/DocumentRepository';
import { Document } from '../../domain/entities/Document';
import { DocumentId, IndexName } from '../../domain/valueObjects/index';

/**
 * InMemoryDocumentRepository
 * In-memory implementation of DocumentRepository for testing and development
 * Uses DDD patterns with proper type safety
 */
export class InMemoryDocumentRepository extends DocumentRepository {
    // Map<IndexName, Map<DocumentId, Document>>
    private readonly documents: Map<string, Map<string, Document>>;

    constructor() {
        super();
        this.documents = new Map();
    }

    async save(document: Document): Promise<void> {
        if (!(document instanceof Document)) {
            throw new Error('document must be a Document instance');
        }

        const indexName = document.getIndexName().value;
        const documentId = document.getId().value;

        if (!this.documents.has(indexName)) {
            this.documents.set(indexName, new Map());
        }

        const indexDocuments = this.documents.get(indexName)!;
        indexDocuments.set(documentId, document);
    }

    async findById(documentId: DocumentId, indexName: IndexName): Promise<Document | null> {
        if (!(documentId instanceof DocumentId)) {
            throw new Error('documentId must be a DocumentId instance');
        }

        if (!(indexName instanceof IndexName)) {
            throw new Error('indexName must be an IndexName instance');
        }

        const indexDocuments = this.documents.get(indexName.value);
        if (!indexDocuments) {
            return null;
        }

        return indexDocuments.get(documentId.value) || null;
    }

    async findByIds(documentIds: DocumentId[], indexName: IndexName): Promise<Document[]> {
        if (!(indexName instanceof IndexName)) {
            throw new Error('indexName must be an IndexName instance');
        }

        const indexDocuments = this.documents.get(indexName.value);
        if (!indexDocuments) {
            return [];
        }

        const results: Document[] = [];
        for (const docId of documentIds) {
            if (!(docId instanceof DocumentId)) {
                throw new Error('All documentIds must be DocumentId instances');
            }

            const document = indexDocuments.get(docId.value);
            if (document) {
                results.push(document);
            }
        }

        return results;
    }

    async deleteById(documentId: DocumentId, indexName: IndexName): Promise<boolean> {
        if (!(documentId instanceof DocumentId)) {
            throw new Error('documentId must be a DocumentId instance');
        }

        if (!(indexName instanceof IndexName)) {
            throw new Error('indexName must be an IndexName instance');
        }

        const indexDocuments = this.documents.get(indexName.value);
        if (!indexDocuments) {
            return false;
        }

        return indexDocuments.delete(documentId.value);
    }

    async update(document: Document): Promise<void> {
        if (!(document instanceof Document)) {
            throw new Error('document must be a Document instance');
        }

        const indexName = document.getIndexName().value;
        const documentId = document.getId().value;

        const indexDocuments = this.documents.get(indexName);
        if (!indexDocuments || !indexDocuments.has(documentId)) {
            throw new Error(`Document with ID ${documentId} not found in index ${indexName}`);
        }

        indexDocuments.set(documentId, document);
    }

    async exists(documentId: DocumentId, indexName: IndexName): Promise<boolean> {
        if (!(documentId instanceof DocumentId)) {
            throw new Error('documentId must be a DocumentId instance');
        }

        if (!(indexName instanceof IndexName)) {
            throw new Error('indexName must be an IndexName instance');
        }

        const indexDocuments = this.documents.get(indexName.value);
        if (!indexDocuments) {
            return false;
        }

        return indexDocuments.has(documentId.value);
    }

    async count(indexName: IndexName): Promise<number> {
        if (!(indexName instanceof IndexName)) {
            throw new Error('indexName must be an IndexName instance');
        }

        const indexDocuments = this.documents.get(indexName.value);
        return indexDocuments ? indexDocuments.size : 0;
    }

    async findAll(indexName: IndexName): Promise<Document[]> {
        if (!(indexName instanceof IndexName)) {
            throw new Error('indexName must be an IndexName instance');
        }

        const indexDocuments = this.documents.get(indexName.value);
        return indexDocuments ? Array.from(indexDocuments.values()) : [];
    }

    async clear(indexName: IndexName): Promise<void> {
        if (!(indexName instanceof IndexName)) {
            throw new Error('indexName must be an IndexName instance');
        }

        this.documents.delete(indexName.value);
    }

    getAllIndices(): string[] {
        return Array.from(this.documents.keys());
    }

    getTotalDocumentCount(): number {
        let total = 0;
        for (const indexDocuments of this.documents.values()) {
            total += indexDocuments.size;
        }
        return total;
    }

    clearAll(): void {
        this.documents.clear();
    }
}