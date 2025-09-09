/**
 * SharedMemoryStore - Wrapper around SearchEngine for shared memory operations
 * Provides a simplified interface for worker threads to access search functionality
 */

import SearchEngine from '../domain/SearchEngine';
import { MappingsManager } from '../domain/MappingsManager';
import { Tokenizer } from '../domain/Tokenizer';
import { StopwordsManager } from './StopwordsManager';
import { getConfigManager } from './ConfigManager';

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
}

export interface SearchResult {
    hits: any[];
    total: number;
    from: number;
    size: number;
    allMatches?: any[];
}

export interface DocumentAddResult {
    docId: number;
    wasAdded: boolean;
}

export default class SharedMemoryStore {
    private readonly searchEngine: SearchEngine;
    private readonly documents: Map<string, any> = new Map();
    private readonly indexName: string;

    constructor(options: SharedMemoryStoreOptions = {}) {
        this.indexName = options.indexName || 'default';

        // Initialize the domain SearchEngine with proper dependencies
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

    /**
     * Add a document to the search engine
     */
    addDocument(doc: any): DocumentAddResult {
        try {
            // Create composite key for multi-index support
            const indexName = doc.indexName || this.indexName;
            const compositeKey = `${indexName}:${doc.id}`;

            // Check if document already exists with the same composite key
            if (this.documents.has(compositeKey)) {
                return { docId: this.documents.size, wasAdded: false };
            }

            // Add document to SearchEngine with composite ID to prevent conflicts
            const docForSearchEngine = {
                ...doc,
                id: compositeKey // Use composite key as the document ID in SearchEngine
            };
            this.searchEngine.add(docForSearchEngine);

            // Store in local map for quick access using composite key
            this.documents.set(compositeKey, doc);

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
            // Filter results by indexName if specified
            const indexName = options.indexName;
            if (indexName) {
                // For index-specific searches, we need to get ALL results first, then filter
                // Use a large size to get all results, then apply filtering and pagination
                const result = this.searchEngine.search(query, {
                    from: 0,
                    size: 10000, // Large size to get all results
                    aggregations: options.aggregations || options.aggs
                });

                const allHits = result.hits || [];
                const filteredHits = allHits.filter((doc: any) => {
                    return doc.indexName === indexName;
                }).map((doc: any) => {
                    // Restore original document ID by removing the indexName prefix
                    const originalId = doc.id.replace(`${indexName}:`, '');
                    return {
                        ...doc,
                        id: originalId
                    };
                });

                // Apply pagination to filtered results
                const from = options.from || 0;
                const size = options.size || 10;
                const paginatedHits = filteredHits.slice(from, from + size);

                return {
                    hits: paginatedHits,
                    total: filteredHits.length, // Total count of filtered results
                    from: from,
                    size: size,
                    aggregations: result.aggregations || {},
                    facets: result.facets || {}
                };
            }

            // For non-index-specific searches, use normal pagination
            const result = this.searchEngine.search(query, {
                from: options.from || 0,
                size: options.size || 10,
                aggregations: options.aggregations || options.aggs
            });

            return {
                hits: result.hits || [],
                total: result.total || 0,
                from: result.from || 0,
                size: result.size || 10,
                aggregations: result.aggregations || {},
                facets: result.facets || {}
            };
        } catch (error) {
            console.error('Search error in SharedMemoryStore:', error);
            return {
                hits: [],
                total: 0,
                from: 0,
                size: 0
            };
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
}