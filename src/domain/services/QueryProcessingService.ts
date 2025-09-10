/**
 * Domain Service for Query Processing
 * 
 * This service encapsulates the business logic for processing queries
 * and eliminates code duplication across the domain layer.
 */

import { ITokenizer } from '../Tokenizer';
import { AnalyzerType } from '../Tokenizer';
import { DocumentProcessingService } from './DocumentProcessingService';

export interface QueryProcessingResult {
    tokens: string[];
    hasValidTokens: boolean;
    processedQuery: any;
}

/**
 * Domain Service for Query Processing
 * 
 * Encapsulates business logic for:
 * - Query tokenization
 * - Query validation
 * - Query normalization
 * - Stopword filtering
 */
export class QueryProcessingService {
    constructor(
        private readonly tokenizer?: ITokenizer,
        private readonly documentProcessor?: DocumentProcessingService
    ) { }

    /**
     * Process a query string into tokens
     * @param query - The query string to process
     * @param analyzer - The analyzer type to use
     * @param stopwords - Optional set of stopwords to filter
     * @returns Query processing result
     */
    processQueryString(query: string, analyzer: AnalyzerType = AnalyzerType.STANDARD, stopwords?: Set<string>): QueryProcessingResult {
        if (!query || typeof query !== 'string') {
            return { tokens: [], hasValidTokens: false, processedQuery: query };
        }

        // Tokenize the query
        const tokens = this.tokenizer
            ? this.tokenizer.tokenize(query, analyzer)
            : query.toLowerCase().split(/\s+/);

        // Filter out stopwords if provided
        const filteredTokens = stopwords
            ? tokens.filter(token => !stopwords.has(token.toLowerCase()))
            : tokens;

        // Filter out empty tokens
        const validTokens = filteredTokens.filter(token => token && token.trim().length > 0);

        return {
            tokens: validTokens,
            hasValidTokens: validTokens.length > 0,
            processedQuery: query
        };
    }

    /**
     * Process a complex query object
     * @param query - The query object to process
     * @param analyzer - The analyzer type to use
     * @param stopwords - Optional set of stopwords to filter
     * @returns Query processing result
     */
    processQueryObject(query: any, analyzer: AnalyzerType = AnalyzerType.STANDARD, stopwords?: Set<string>): QueryProcessingResult {
        if (!query || typeof query !== 'object') {
            return { tokens: [], hasValidTokens: false, processedQuery: query };
        }

        const allTokens: string[] = [];

        // Process different query types
        if (query.match && query.match.query) {
            const result = this.processQueryString(query.match.query, analyzer, stopwords);
            allTokens.push(...result.tokens);
        }

        if (query.multi_match && query.multi_match.query) {
            const result = this.processQueryString(query.multi_match.query, analyzer, stopwords);
            allTokens.push(...result.tokens);
        }

        if (query.bool) {
            const boolTokens = this.processBoolQuery(query.bool, analyzer, stopwords);
            allTokens.push(...boolTokens);
        }

        // Remove duplicates
        const uniqueTokens = [...new Set(allTokens)];

        return {
            tokens: uniqueTokens,
            hasValidTokens: uniqueTokens.length > 0,
            processedQuery: query
        };
    }

    /**
     * Process a boolean query
     * @param boolQuery - The boolean query to process
     * @param analyzer - The analyzer type to use
     * @param stopwords - Optional set of stopwords to filter
     * @returns Array of tokens
     */
    private processBoolQuery(boolQuery: any, analyzer: AnalyzerType, stopwords?: Set<string>): string[] {
        const tokens: string[] = [];

        // Process must clauses
        if (boolQuery.must && Array.isArray(boolQuery.must)) {
            for (const clause of boolQuery.must) {
                const result = this.processQueryObject(clause, analyzer, stopwords);
                tokens.push(...result.tokens);
            }
        }

        // Process should clauses
        if (boolQuery.should && Array.isArray(boolQuery.should)) {
            for (const clause of boolQuery.should) {
                const result = this.processQueryObject(clause, analyzer, stopwords);
                tokens.push(...result.tokens);
            }
        }

        // Process filter clauses
        if (boolQuery.filter && Array.isArray(boolQuery.filter)) {
            for (const clause of boolQuery.filter) {
                const result = this.processQueryObject(clause, analyzer, stopwords);
                tokens.push(...result.tokens);
            }
        }

        return tokens;
    }

    /**
     * Validate a query object
     * @param query - The query to validate
     * @returns True if the query is valid
     */
    validateQuery(query: any): boolean {
        if (!query) return false;

        // String query is always valid
        if (typeof query === 'string') return true;

        // Object query validation
        if (typeof query === 'object') {
            // Must have at least one valid clause
            return !!(
                query.match ||
                query.multi_match ||
                query.term ||
                query.terms ||
                query.prefix ||
                query.wildcard ||
                query.fuzzy ||
                query.range ||
                query.bool ||
                query.match_all
            );
        }

        return false;
    }

    /**
     * Normalize a query for processing
     * @param query - The query to normalize
     * @returns Normalized query
     */
    normalizeQuery(query: any): any {
        if (typeof query === 'string') {
            return { match: { query: query } };
        }

        if (typeof query === 'object' && query !== null) {
            // If it's already a proper query object, return as is
            if (query.match || query.multi_match || query.term || query.bool) {
                return query;
            }

            // If it's a simple object, convert to match query
            const fields = Object.keys(query).filter(key => key !== 'id');
            if (fields.length === 1) {
                return {
                    match: {
                        [fields[0]]: query[fields[0]]
                    }
                };
            } else if (fields.length > 1) {
                return {
                    multi_match: {
                        query: Object.values(query).join(' '),
                        fields: fields
                    }
                };
            }
        }

        return query;
    }

    /**
     * Extract searchable text from a query
     * @param query - The query to extract text from
     * @returns Array of searchable text strings
     */
    extractSearchableText(query: any): string[] {
        const texts: string[] = [];

        if (typeof query === 'string') {
            texts.push(query);
        } else if (typeof query === 'object' && query !== null) {
            if (query.match && query.match.query) {
                texts.push(query.match.query);
            }
            if (query.multi_match && query.multi_match.query) {
                texts.push(query.multi_match.query);
            }
            if (query.bool) {
                const boolTexts = this.extractBoolQueryText(query.bool);
                texts.push(...boolTexts);
            }
        }

        return texts;
    }

    /**
     * Extract text from boolean query
     * @param boolQuery - The boolean query to extract text from
     * @returns Array of text strings
     */
    private extractBoolQueryText(boolQuery: any): string[] {
        const texts: string[] = [];

        if (boolQuery.must && Array.isArray(boolQuery.must)) {
            for (const clause of boolQuery.must) {
                texts.push(...this.extractSearchableText(clause));
            }
        }

        if (boolQuery.should && Array.isArray(boolQuery.should)) {
            for (const clause of boolQuery.should) {
                texts.push(...this.extractSearchableText(clause));
            }
        }

        if (boolQuery.filter && Array.isArray(boolQuery.filter)) {
            for (const clause of boolQuery.filter) {
                texts.push(...this.extractSearchableText(clause));
            }
        }

        return texts;
    }
}
