import { IUseCase } from './IUseCase';
import { SearchQuery } from '../queries/SearchQuery';
import { SearchResult, SearchHit } from '../results/SearchResult';
import { SearchRepository } from '../../domain/repositories/SearchRepository';
import { QueryEngine } from '../../domain/QueryEngine';
import { RankingPipeline } from '../../domain/RankingPipeline';
import { Document } from '../../domain/entities/Document';

export class SearchDocumentsUseCase implements IUseCase<SearchQuery, SearchResult> {
    constructor(
        private readonly searchRepository: SearchRepository,
        private readonly queryEngine: QueryEngine,
        private readonly rankingPipeline: RankingPipeline
    ) { }

    async execute(query: SearchQuery, indexName: string): Promise<SearchResult> {
        const searchResult = await this.queryEngine.search(query.query, {
            from: query.from,
            size: query.size,
            aggregations: query.aggregations,
            sort: query.sort
        });

        const documents = await this.searchRepository.findByIds(Array.from(searchResult.documents), indexName);

        const rankedDocuments = await this.rankingPipeline.rank(
            documents,
            query.query,
        );

        const from = query.from || 0;
        const size = query.size || 10;
        const paginatedDocuments = rankedDocuments.slice(from, from + size);

        const hits: SearchHit[] = paginatedDocuments.map(doc => ({
            _id: doc.id.value,
            _score: (doc as any)._score,
            _source: doc.toPrimitives()
        }));

        return new SearchResult({
            hits: hits,
            total: documents.length,
            from,
            size,
            aggregations: searchResult.aggregations,
            facets: searchResult.facets,
            took: 0
        });
    }
}