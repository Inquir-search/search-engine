import { Document } from '../../domain/entities/Document';

export interface AddDocumentCommand {
    document: Document;
}