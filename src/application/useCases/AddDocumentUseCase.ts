import { IUseCase } from './IUseCase';
import { AddDocumentCommand } from '../commands/AddDocumentCommand';
import { DocumentRepository } from '../../domain/repositories/DocumentRepository';
import { QueryEngine } from '../../domain/QueryEngine';
import { Document } from '../../domain/entities/Document';
import { DocumentId, IndexName } from '../../domain/valueObjects/index';

interface AddDocumentResult {
    success: boolean;
    documentId: string;
    indexName: string;
}

export class AddDocumentUseCase implements IUseCase<AddDocumentCommand, AddDocumentResult> {
    constructor(
        private readonly documentRepository: DocumentRepository,
        private readonly queryEngine: QueryEngine
    ) { }

    async execute(command: AddDocumentCommand, indexName: string): Promise<AddDocumentResult> {
        let docToSave: Document;
        if (command.document instanceof Document) {
            docToSave = command.document as Document;
        } else {
            // Wrap plain JS object into domain Document entity
            const id = new DocumentId(command.document.id || command.document.documentId || command.document.document_id || '');
            const idxName = new IndexName(command.indexName || indexName);
            docToSave = new Document(id, { ...command.document }, idxName);
        }

        // Persist via repository (DDD boundary)
        if (typeof this.documentRepository.save === 'function') {
            await this.documentRepository.save(docToSave);
        }

        // Index for search – QueryEngine operates on in-memory store used in tests
        if (typeof this.queryEngine.add === 'function') {
            this.queryEngine.add({ ...command.document });
        }

        return {
            success: true,
            documentId: docToSave.getId ? docToSave.getId().value : (command.document.id || ''),
            indexName
        };
    }
}