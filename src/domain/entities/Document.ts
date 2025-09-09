import { DocumentId, IndexName } from '../valueObjects/index.js';

/**
 * Document Entity
 * Represents a document in the search engine with behavior and identity
 */
export class Document {
    public readonly documentId: DocumentId;
    public data: Record<string, any>;
    public readonly indexName: IndexName;
    public readonly createdAt: Date;
    public updatedAt: Date;
    public version: number;

    constructor(documentId: DocumentId, data: Record<string, any>, indexName: IndexName, createdAt: Date = new Date()) {
        if (!(documentId instanceof DocumentId)) {
            throw new Error('documentId must be a DocumentId instance');
        }

        if (!(indexName instanceof IndexName)) {
            throw new Error('indexName must be an IndexName instance');
        }

        if (!data || typeof data !== 'object') {
            throw new Error('Document data must be an object');
        }

        this.documentId = documentId;
        this.data = { ...data };
        this.indexName = indexName;
        this.createdAt = createdAt;
        this.updatedAt = createdAt;
        this.version = 1;

        // Ensure the data has the ID field
        this.data.id = documentId.value;
    }

    getId(): DocumentId {
        return this.documentId;
    }

    getData(): Record<string, any> {
        return { ...this.data };
    }

    getIndexName(): IndexName {
        return this.indexName;
    }

    getCreatedAt(): Date {
        return this.createdAt;
    }

    getUpdatedAt(): Date {
        return this.updatedAt;
    }

    getVersion(): number {
        return this.version;
    }

    update(newData: Record<string, any>): Document {
        if (!newData || typeof newData !== 'object') {
            throw new Error('Document data must be an object');
        }

        this.data = { ...newData };
        this.data.id = this.documentId.value;
        this.updatedAt = new Date();
        this.version++;

        return this;
    }

    getField(fieldName: string): any {
        return this.data[fieldName];
    }

    hasField(fieldName: string): boolean {
        return fieldName in this.data;
    }

    getFieldNames(): string[] {
        return Object.keys(this.data);
    }

    equals(other: Document): boolean {
        if (!(other instanceof Document)) {
            return false;
        }

        return this.documentId.equals(other.documentId) &&
            this.indexName.equals(other.indexName);
    }

    toString(): string {
        return `Document(${this.documentId.value}, ${this.indexName.value})`;
    }

    toJSON(): DocumentJSON {
        return {
            id: this.documentId.value,
            data: this.data,
            indexName: this.indexName.value,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            version: this.version
        };
    }

    static fromJSON(json: DocumentJSON): Document {
        return new Document(
            new DocumentId(json.id),
            json.data,
            new IndexName(json.indexName),
            new Date(json.createdAt)
        );
    }
}

export interface DocumentJSON {
    id: string;
    data: Record<string, any>;
    indexName: string;
    createdAt: Date;
    updatedAt: Date;
    version: number;
}