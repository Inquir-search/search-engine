import { Document } from '../entities/Document.js';
import { DocumentId, IndexName } from '../valueObjects/index.js';

/**
 * DocumentRepository Interface
 * Defines the contract for document data access operations
 */
export abstract class DocumentRepository {
    /**
     * Save a document to the repository
     * @param document - The document to save
     * @returns Promise<void>
     */
    abstract save(document: Document): Promise<void>;

    /**
     * Find a document by ID
     * @param documentId - The document ID
     * @param indexName - The index name
     * @returns Promise<Document|null>
     */
    abstract findById(documentId: DocumentId, indexName: IndexName): Promise<Document | null>;

    /**
     * Find documents by IDs
     * @param documentIds - Array of document IDs
     * @param indexName - The index name
     * @returns Promise<Document[]>
     */
    abstract findByIds(documentIds: DocumentId[], indexName: IndexName): Promise<Document[]>;

    /**
     * Delete a document by ID
     * @param documentId - The document ID
     * @param indexName - The index name
     * @returns Promise<boolean>
     */
    abstract deleteById(documentId: DocumentId, indexName: IndexName): Promise<boolean>;

    /**
     * Update a document
     * @param document - The document to update
     * @returns Promise<void>
     */
    abstract update(document: Document): Promise<void>;

    /**
     * Check if a document exists
     * @param documentId - The document ID
     * @param indexName - The index name
     * @returns Promise<boolean>
     */
    abstract exists(documentId: DocumentId, indexName: IndexName): Promise<boolean>;

    /**
     * Get total document count for an index
     * @param indexName - The index name
     * @returns Promise<number>
     */
    abstract count(indexName: IndexName): Promise<number>;

    /**
     * Get all documents for an index (use with caution)
     * @param indexName - The index name
     * @returns Promise<Document[]>
     */
    abstract findAll(indexName: IndexName): Promise<Document[]>;

    /**
     * Clear all documents from an index
     * @param indexName - The index name
     * @returns Promise<void>
     */
    abstract clear(indexName: IndexName): Promise<void>;
}