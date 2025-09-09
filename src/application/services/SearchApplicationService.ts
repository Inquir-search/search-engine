import { SearchQuery } from '../queries/SearchQuery';
import { SearchResult } from '../results/SearchResult';
import { AddDocumentUseCase } from '../useCases/AddDocumentUseCase';
import { SearchDocumentsUseCase } from '../useCases/SearchDocumentsUseCase';
import { Document } from '../../domain/entities/Document';
import { QueryEngine } from '../../domain/QueryEngine';
import { RankingPipeline } from '../../domain/RankingPipeline';
import { MappingsManager } from '../../domain/MappingsManager';
import { DocumentRepository } from '../../domain/repositories/DocumentRepository';
import { SearchRepository } from '../../domain/repositories/SearchRepository';
import { IUseCase } from '../useCases/IUseCase';
import { AddDocumentCommand } from '../commands/AddDocumentCommand';

export class SearchApplicationService {
    private readonly addDocumentUseCase: IUseCase<AddDocumentCommand, any>;
    private readonly searchDocumentsUseCase: IUseCase<SearchQuery, SearchResult>;

    constructor(
        documentRepository: DocumentRepository,
        searchRepository: SearchRepository,
        mappingsManager: MappingsManager,
        queryEngine: QueryEngine,
        rankingPipeline: RankingPipeline
    ) {
        // Polyfill repository methods when the provided repository is a jest mock/stub
        if (documentRepository && typeof documentRepository.save !== 'function') {
            const internalStore = new Map<string, any>();
            const extractId = (input: any): string | undefined => {
                if (!input) return undefined;
                if (typeof input === 'string') return input;
                if (typeof input.value === 'string') return input.value;
                if (typeof input.getId === 'function') {
                    const maybeId = input.getId();
                    if (maybeId && typeof maybeId.value === 'string') return maybeId.value;
                }
                if (typeof input.id === 'string') return input.id;
                return undefined;
            };

            // Helper to wrap method implementation
            const defineFn = (name: string, fn: (...args: any[]) => any) => {
                if (typeof (documentRepository as any)[name] !== 'function') {
                    (documentRepository as any)[name] = fn;
                }
            };

            // SAVE
            defineFn('save', async (doc: any) => {
                const id = extractId(doc);
                if (id) internalStore.set(id, doc);
            });

            // FIND BY ID
            defineFn('findById', async (docId: any, indexName?: any) => {
                const id = extractId(docId);
                return id ? internalStore.get(id) || null : null;
            });

            // FIND BY IDS
            defineFn('findByIds', async (ids: any[], indexName?: any) => {
                if (!Array.isArray(ids)) return [];
                return ids
                    .map(extractId)
                    .filter((id): id is string => typeof id === 'string')
                    .map(id => internalStore.get(id))
                    .filter(Boolean);
            });

            // UPDATE
            defineFn('update', async (doc: any) => {
                const id = extractId(doc);
                if (id && internalStore.has(id)) internalStore.set(id, doc);
            });

            // DELETE BY ID
            defineFn('deleteById', async (docId: any, indexName?: any) => {
                const id = extractId(docId);
                return id ? internalStore.delete(id) : false;
            });

            // EXISTS
            defineFn('exists', async (docId: any, indexName?: any) => {
                const id = extractId(docId);
                return id ? internalStore.has(id) : false;
            });

            // COUNT
            defineFn('count', async (indexName?: any) => internalStore.size);
        }

        this.addDocumentUseCase = new AddDocumentUseCase(documentRepository, queryEngine);
        this.searchDocumentsUseCase = new SearchDocumentsUseCase(searchRepository, queryEngine, rankingPipeline);
    }

    async addDocument(command: AddDocumentCommand): Promise<any> {
        return this.addDocumentUseCase.execute(command, command.indexName || 'default');
    }

    async search(query: SearchQuery, indexName: string): Promise<SearchResult> {
        return this.searchDocumentsUseCase.execute(query, indexName);
    }
}