/**
 * SharedMemoryStore - Wrapper around SearchEngine for shared memory operations
 * Provides a simplified interface for worker threads to access search functionality
 */

import SearchEngine from '../domain/SearchEngine';
import { MappingsManager } from '../domain/MappingsManager';
import { Tokenizer } from '../domain/Tokenizer';
import { StopwordsManager } from './StopwordsManager';

export interface ISearchEngine {
    listIndices(): string[];
    ensureIndex(indexName: string, options?: any): void;
    add(doc: any, indexName?: string): void;
    search(query: any, context?: any, indexName?: string): any;
}

// Type definitions for shared memory store
export interface SharedMemoryStoreOptions {
    indexName?: string;
    sharedBuffer?: SharedArrayBuffer;
    bufferSize?: number;
    maxDocuments?: number;
    maxTerms?: number;
    stemming?: boolean;
    stemmingOptions?: any;
    tokenCacheSize?: number;
    defaultAnalyzer?: string;
    fieldAnalyzers?: Record<string, string>;
    searchEngine?: ISearchEngine;
    engineFactory?: () => ISearchEngine;
}

export interface MemoryLayout {
    readonly MUTEX_OFFSET: number;
    readonly DOCUMENT_COUNT_OFFSET: number;
    readonly TERM_COUNT_OFFSET: number;
    readonly NEXT_DOC_ID_OFFSET: number;
    readonly INDEX_VERSION_OFFSET: number;
    readonly NEXT_DOC_OFFSET: number;
    readonly NEXT_INDEX_OFFSET: number;
    readonly DOCUMENTS_OFFSET: number;
    readonly DOCUMENTS_SIZE: number;
    readonly INVERTED_INDEX_OFFSET: number;
    readonly INVERTED_INDEX_SIZE: number;
}

export interface StoreStats {
    totalDocs: number;
    totalTerms: number;
    bufferSize: number;
    memory: {
        documentsUsed: number;
        indexUsed: number;
        totalUsed: number;
        documentsPercent: number;
        indexPercent: number;
        totalPercent: number;
    };
    performance: {
        averageDocumentSize: number;
        averageTermsPerDocument: number;
        hashCollisions: number;
    };
}

export interface SearchOptions {
    from?: number;
    size?: number;
    indexName?: string;
    aggregations?: Record<string, any>;
    aggs?: Record<string, any>;
}

export interface SearchResult {
    hits: any[];
    total: number;
    from: number;
    size: number;
    allMatches?: any[];
    aggregations?: Record<string, any>;
    facets?: Record<string, any>;
}

export interface DocumentAddResult {
    docId: number;
    wasAdded: boolean;
}

export default class SharedMemoryStore {
    private readonly searchEngine: ISearchEngine;
    private readonly documents: Map<string, any> = new Map();
    private readonly indexName: string;

    constructor(options: SharedMemoryStoreOptions = {}) {
        this.indexName = options.indexName || 'default';

        if (options.searchEngine) {
            this.searchEngine = options.searchEngine;
        } else if (options.engineFactory) {
            this.searchEngine = options.engineFactory();
        } else {
            const mappingsManager = new MappingsManager();
            const stopwordsManager = new StopwordsManager();
            const tokenizer = new Tokenizer(stopwordsManager, {
                stemming: true,
                stemmingOptions: { language: 'en', aggressive: false }
            });

            this.searchEngine = new SearchEngine({
                mappingsManager,
                tokenizer,
                indexName: this.indexName
            });
        }
    }

    /**
     * Add a document to the search engine
     */
    addDocument(doc: any): DocumentAddResult {
        try {
            const indexName = doc.indexName || this.indexName;
            const key = `${indexName}:${doc.id}`;

            if (this.documents.has(key)) {
                return { docId: this.documents.size, wasAdded: false };
            }

            this.searchEngine.ensureIndex(indexName, {});
            this.searchEngine.add({ ...doc, indexName }, indexName);

            this.documents.set(key, { ...doc, indexName });

            return { docId: this.documents.size, wasAdded: true };
        } catch (error) {
            throw new Error(`Failed to add document: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Search documents using SearchEngine
     */
    search(query: any, options: SearchOptions = {}): SearchResult {
        try {
            const indexName = options.indexName;
            const ctx = { from: options.from || 0, size: options.size || 10, aggregations: options.aggregations || options.aggs };

            if (indexName) {
                return this.searchEngine.search(query, ctx, indexName);
            }

            const indices = this.searchEngine.listIndices();
            let allHits: any[] = [];
            let aggregations: Record<string, any> = {};
            let facets: Record<string, any> = {};

            for (const idx of indices) {
                const res = this.searchEngine.search(query, { from: 0, size: ctx.from + ctx.size, aggregations: ctx.aggregations }, idx);
                allHits = allHits.concat(res.hits || []);
                if (res.aggregations) {
                    aggregations = this.mergeAggregations(aggregations, res.aggregations);
                }
                if (res.facets) {
                    facets = this.mergeFacets(facets, res.facets);
                }
            }

            const paginatedHits = allHits.slice(ctx.from, ctx.from + ctx.size);

            return {
                hits: paginatedHits,
                total: allHits.length,
                from: ctx.from,
                size: ctx.size,
                allMatches: allHits,
                aggregations: Object.keys(aggregations).length ? aggregations : undefined,
                facets: Object.keys(facets).length ? facets : undefined
            };
        } catch (error) {
            throw new Error(`Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Delete a document by ID
     */
    async deleteDocument(docId: string): Promise<boolean> {
        try {
            // Remove from local map
            const existed = this.documents.has(docId);
            this.documents.delete(docId);

            // Delete from SearchEngine
            await this.searchEngine.delete(docId);

            return existed;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get statistics about the search engine
     */
    getStats(): StoreStats {
        const totalDocs = this.documents.size;

        return {
            totalDocs,
            totalTerms: 0, // Not tracked in this simplified version
            bufferSize: 0, // Not applicable
            memory: {
                documentsUsed: 0,
                indexUsed: 0,
                totalUsed: 0,
                documentsPercent: 0,
                indexPercent: 0,
                totalPercent: 0
            },
            performance: {
                averageDocumentSize: 0,
                averageTermsPerDocument: 0,
                hashCollisions: 0
            }
        };
    }

    /**
     * Get all documents (for debugging and persistence)
     */
    extractAllDocuments(): Map<string, any> {
        return new Map(this.documents);
    }

    /**
     * Get documents for a specific index
     */
    extractDocumentsForIndex(indexName: string): Map<string, any> {
        const result = new Map<string, any>();
        for (const [id, doc] of this.documents) {
            if (doc.indexName === indexName) {
                result.set(id, doc);
            }
        }
        return result;
    }

    /**
     * Find documents containing a specific token (simplified)
     */
    findDocumentsForToken(token: string): number[] {
        // This is a simplified implementation
        // In a real implementation, this would use the SearchEngine's inverted index
        return [];
    }

    /**
     * Find documents containing specific tokens (simplified)
     */
    findDocumentsForTokens(tokens: string[]): number[] {
        // This is a simplified implementation
        return [];
    }

    /**
     * Get document by ID
     */
    getDocument(docId: string): any | null {
        return this.documents.get(docId) || null;
    }

    /**
     * Extract inverted index for persistence (simplified)
     */
    extractInvertedIndex(): Map<string, Map<number, any>> {
        // This is a simplified implementation
        // In a real implementation, this would extract from SearchEngine
        return new Map();
    }

    /**
     * Extract document lengths for persistence (simplified)
     */
    extractDocLengths(): Map<string, number> {
        // This is a simplified implementation
        const docLengths = new Map<string, number>();
        for (const [id, doc] of this.documents) {
            // Simple length calculation
            const text = JSON.stringify(doc).length;
            docLengths.set(id, text);
        }
        return docLengths;
    }

    /**
     * Calculate aggregations for a specific index based on filtered results
     */
    private calculateAggregationsForIndex(aggregationsConfig: any, filteredHits: any[], indexName: string): any {
        const aggregations: any = {};

        for (const [aggName, aggConfig] of Object.entries(aggregationsConfig)) {
            if (aggConfig && typeof aggConfig === 'object' && 'terms' in aggConfig && aggConfig.terms) {
                const termsConfig = aggConfig.terms as any;
                const field = termsConfig.field;
                const size = termsConfig.size || 10;

                // Count field values across filtered documents only
                const fieldCounts: Map<string, number> = new Map();

                for (const doc of filteredHits) {
                    let fieldValues: any[] = [];

                    if (doc[field]) {
                        if (Array.isArray(doc[field])) {
                            fieldValues = doc[field];
                        } else {
                            fieldValues = [doc[field]];
                        }
                    }

                    for (const value of fieldValues) {
                        if (value && value.toString().trim()) {
                            const key = value.toString();
                            fieldCounts.set(key, (fieldCounts.get(key) || 0) + 1);
                        }
                    }
                }

                // Sort by count descending and take top N
                const buckets = Array.from(fieldCounts.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, size)
                    .map(([key, count]) => ({
                        key: key,
                        doc_count: count
                    }));

                aggregations[aggName] = { buckets };
            }
        }

        return aggregations;
    }

    /**
     * Calculate facets for a specific index based on filtered results
     */
    private calculateFacetsForIndex(originalFacets: any, filteredHits: any[], indexName: string): any {
        const facets: any = {};

        // Recalculate facets based on filtered results
        for (const [field, counts] of Object.entries(originalFacets)) {
            const fieldCounts: Record<string, number> = {};

            for (const doc of filteredHits) {
                let fieldValues: any[] = [];

                if (doc[field]) {
                    if (Array.isArray(doc[field])) {
                        fieldValues = doc[field];
                    } else {
                        fieldValues = [doc[field]];
                    }
                }

                for (const value of fieldValues) {
                    if (value && value.toString().trim()) {
                        const key = value.toString();
                        fieldCounts[key] = (fieldCounts[key] || 0) + 1;
                    }
                }
            }

            if (Object.keys(fieldCounts).length > 0) {
                facets[field] = fieldCounts;
            }
        }

        return facets;
    }

    private mergeAggregations(target: any, source: any): any {
        const result = { ...target };
        for (const [agg, data] of Object.entries(source)) {
            if (!result[agg]) {
                result[agg] = data;
            } else if (data && data.buckets) {
                const existing = result[agg].buckets || [];
                const merged = [...existing];
                for (const bucket of data.buckets as any[]) {
                    const found = merged.find((b: any) => b.key === bucket.key);
                    if (found) found.doc_count += bucket.doc_count; else merged.push({ ...bucket });
                }
                result[agg] = { buckets: merged };
            }
        }
        return result;
    }

    private mergeFacets(target: any, source: any): any {
        const result = { ...target };
        for (const [field, counts] of Object.entries(source)) {
            if (!result[field]) result[field] = {};
            for (const [val, count] of Object.entries(counts as any)) {
                result[field][val] = (result[field][val] || 0) + (count as number);
            }
        }
        return result;
    }
}