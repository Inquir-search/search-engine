import { DocumentId, IndexName } from '../valueObjects/index.js';

/**
 * DocumentAddedEvent
 * Domain event published when a document is added to an index
 */
export class DocumentAddedEvent {
    public readonly documentId: DocumentId;
    public readonly indexName: IndexName;
    public readonly occurredAt: Date;
    public readonly eventType: string;
    public readonly eventId: string;

    constructor(documentId: DocumentId, indexName: IndexName, occurredAt: Date = new Date()) {
        if (!(documentId instanceof DocumentId)) {
            throw new Error('documentId must be a DocumentId instance');
        }

        if (!(indexName instanceof IndexName)) {
            throw new Error('indexName must be an IndexName instance');
        }

        this.documentId = documentId;
        this.indexName = indexName;
        this.occurredAt = occurredAt;
        this.eventType = 'DocumentAdded';
        this.eventId = this._generateEventId();

        Object.freeze(this);
    }

    getDocumentId(): DocumentId {
        return this.documentId;
    }

    getIndexName(): IndexName {
        return this.indexName;
    }

    getOccurredAt(): Date {
        return this.occurredAt;
    }

    getEventType(): string {
        return this.eventType;
    }

    getEventId(): string {
        return this.eventId;
    }

    private _generateEventId(): string {
        return `${this.eventType}-${this.documentId.value}-${this.indexName.value}-${Date.now()}`;
    }

    toJSON(): DocumentAddedEventJSON {
        return {
            eventId: this.eventId,
            eventType: this.eventType,
            documentId: this.documentId.value,
            indexName: this.indexName.value,
            occurredAt: this.occurredAt.toISOString()
        };
    }

    static fromJSON(json: DocumentAddedEventJSON): DocumentAddedEvent {
        return new DocumentAddedEvent(
            new DocumentId(json.documentId),
            new IndexName(json.indexName),
            new Date(json.occurredAt)
        );
    }
}

export interface DocumentAddedEventJSON {
    eventId: string;
    eventType: string;
    documentId: string;
    indexName: string;
    occurredAt: string;
}