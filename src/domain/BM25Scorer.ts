import { DocumentId } from './valueObjects/index.js';

/**
 * BM25Scorer Interface
 * Defines the contract for BM25 scoring algorithms
 */
export interface IBM25Scorer {
    score(token: string, docId: DocumentId, tf: number): number;
}

/**
 * BM25Scorer Configuration
 */
export interface BM25ScorerConfig {
    k1?: number;
    b?: number;
    fieldBoosts?: Record<string, number>;
}

/**
 * Index Interface for BM25 Scorer
 */
export interface IBM25Index {
    getDocFreq(token: string): number;
}

/**
 * BM25Scorer Domain Service
 * Implements the BM25 ranking algorithm for document scoring
 */
export default class BM25Scorer implements IBM25Scorer {
    private readonly totalDocs: number;
    private readonly avgDocLength: number;
    private readonly docLengths: Map<string, number>;
    private readonly index: IBM25Index;
    private readonly k1: number;
    private readonly b: number;
    private readonly fieldBoosts: Record<string, number>;

    constructor(
        totalDocs: number,
        avgDocLength: number,
        docLengths: Map<string, number>,
        index: IBM25Index,
        config: BM25ScorerConfig = {}
    ) {
        if (totalDocs < 0) {
            throw new Error('Total documents must be non-negative');
        }
        if (avgDocLength < 0) {
            throw new Error('Average document length must be non-negative');
        }
        if (!docLengths) {
            throw new Error('Document lengths map is required');
        }
        if (!index) {
            throw new Error('Index is required');
        }

        this.totalDocs = totalDocs;
        this.avgDocLength = avgDocLength;
        this.docLengths = docLengths;
        this.index = index;
        this.k1 = config.k1 ?? 1.2;
        this.b = config.b ?? 0.75;
        this.fieldBoosts = config.fieldBoosts ?? {};

        // Validate configuration
        if (this.k1 < 0) {
            throw new Error('k1 parameter must be non-negative');
        }
        if (this.b < 0 || this.b > 1) {
            throw new Error('b parameter must be between 0 and 1');
        }
    }

    /**
     * Calculate BM25 score for a token in a document
     * @param token - The search token
     * @param docId - The document ID
     * @param tf - Term frequency in the document
     * @returns BM25 score
     */
    score(token: string, docId: DocumentId, tf: number): number {
        if (!token || typeof token !== 'string') {
            return 0;
        }
        if (tf < 0) {
            return 0;
        }

        const docIdStr = docId.value;
        if (!this.docLengths.has(docIdStr)) {
            return 0;
        }

        const df = this.index.getDocFreq(token);
        if (df === 0) {
            return 0;
        }

        const idf = Math.log((this.totalDocs - df + 0.5) / (df + 0.5) + 1);
        const dl = this.docLengths.get(docIdStr) || 0;
        if (dl < 0) {
            return 0;
        }
        const avgdl = this.avgDocLength || 1;

        const field = token.split(":")[0];
        const boost = this.fieldBoosts[field] || 1.0;

        const numerator = tf * (this.k1 + 1);
        const denominator = tf + this.k1 * (1 - this.b + this.b * (dl / avgdl));
        const score = boost * idf * (numerator / denominator);

        // Ensure non-negative score
        return Math.max(0, score);
    }

    /**
     * Get configuration parameters
     */
    getConfig(): BM25ScorerConfig {
        return {
            k1: this.k1,
            b: this.b,
            fieldBoosts: { ...this.fieldBoosts }
        };
    }

    /**
     * Get statistics
     */
    getStats(): { totalDocs: number; avgDocLength: number; docCount: number } {
        return {
            totalDocs: this.totalDocs,
            avgDocLength: this.avgDocLength,
            docCount: this.docLengths.size
        };
    }
}

export { BM25Scorer };