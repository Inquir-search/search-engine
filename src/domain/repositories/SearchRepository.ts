import { SearchQuery } from '../../application/queries/SearchQuery';
import { DocumentId } from '../valueObjects/DocumentId';
import { IndexName } from '../valueObjects/IndexName';
import { QueryText } from '../valueObjects/QueryText';
import { Document } from '../entities/Document';

/**
 * SearchRepository Interface
 * Defines the contract for search operations following Repository pattern
 */
export abstract class SearchRepository {
    /**
     * Search for documents
     * @param searchQuery - The search query value object
     * @returns Promise of array of document IDs
     */
    abstract search(searchQuery: SearchQuery): Promise<DocumentId[]>;

    /**
     * Find documents by IDs
     * @param documentIds - Array of document ID value objects
     * @param indexName - The index name value object
     * @returns Promise of array of document entities
     */
    abstract findByIds(documentIds: DocumentId[], indexName: IndexName): Promise<Document[]>;

    /**
     * Calculate aggregations for search results
     * @param aggregations - Aggregation configuration
     * @param documents - Document entities to aggregate
     * @param indexName - The index name value object
     * @returns Promise of aggregation results
     */
    abstract calculateAggregations(
        aggregations: Record<string, any>,
        documents: Document[],
        indexName: IndexName
    ): Promise<Record<string, any>>;

    /**
     * Get facets for documents
     * @param documents - Document entities to facet
     * @param indexName - The index name value object
     * @returns Promise of facet results
     */
    abstract getFacets(documents: Document[], indexName: IndexName): Promise<Record<string, any>>;

    /**
     * Get suggestions for a query
     * @param queryText - The query text value object
     * @param indexName - The index name value object
     * @returns Promise of array of suggestion strings
     */
    abstract getSuggestions(queryText: QueryText, indexName: IndexName): Promise<string[]>;

    /**
     * Get search statistics for an index
     * @param indexName - The index name value object
     * @returns Promise of statistics object
     */
    abstract getStatistics(indexName: IndexName): Promise<Record<string, any>>;
}