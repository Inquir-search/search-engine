import { Document } from '../../domain/entities/Document';

export interface AddDocumentCommand {
    document: Document | any; // Allow both Document entity and plain objects
    indexName?: string;
}