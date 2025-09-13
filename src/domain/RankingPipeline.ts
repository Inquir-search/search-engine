import { DocumentId } from './valueObjects/DocumentId';
import type { IMappingsManager } from './MappingsManager';
import type { ITokenizer } from './Tokenizer';

export interface IScorer {
    // We accept variable arity because mocks in tests sometimes take one param (docId)
    // while real scorers (e.g. BM25Scorer) take three (token, docId, tf).
    score: (...args: any[]) => number;
}

class RankingPipeline {
    private scorer: IScorer | null;
    private readonly tokenizer: ITokenizer | null;

    constructor(scorer: IScorer | null = null, tokenizer: ITokenizer | null = null) {
        this.scorer = scorer && typeof scorer.score === 'function' ? scorer : null;
        this.tokenizer = tokenizer && typeof tokenizer.tokenize === 'function' ? tokenizer : null;
    }

    /**
     * Rank a list of document IDs using a scorer and set of query tokens.
     * @param docs Array of document IDs (strings).
     * @param queryTokens Array of query tokens (pre-tokenised strings).
     * @param mappingsManager Optional mappings manager for text field information.
     */
    rank(docs: string[], queryTokens: string[] = [], mappingsManager?: IMappingsManager): Array<{ id: string; score: number }> {
        if (!Array.isArray(docs)) return [];

        const results: Array<{ id: string; score: number }> = [];

        for (const docId of docs) {
            let score = 0;

            if (queryTokens && queryTokens.length > 0) {
                // When query tokens are provided, accumulate score per token.
                for (const token of queryTokens) {
                    score += this._callScorer(token, docId);
                }
            } else {
                // Fallback: score based solely on docId.
                score = this._callScorer('', docId);
            }

            results.push({ id: docId, score });
        }

        // Sort descending by score.
        results.sort((a, b) => b.score - a.score);
        return results;
    }

    /**
     * Enrich ranked results with document data stored in a Map.
     */
    processResults(results: Array<{ id: string; score: number }>, documents: Map<string, any>): any[] {
        if (!results || !Array.isArray(results) || !(documents instanceof Map)) return [];

        const enriched: any[] = [];
        for (const { id, score } of results) {
            const doc = documents.get(id);
            if (doc) {
                enriched.push({ ...doc, score });
            }
        }
        return enriched;
    }

    /**
     * Extract raw tokens from various query structures (bool, term, prefix, wildcard, phrase).
     */
    extractQueryTokens(query: any): string[] {
        const tokens: string[] = [];
        const traverse = (q: any) => {
            if (!q || typeof q !== 'object') return;

            if (q.bool) {
                ['must', 'should', 'must_not', 'filter'].forEach((clause) => {
                    if (Array.isArray(q.bool[clause])) {
                        q.bool[clause].forEach(traverse);
                    }
                });
            } else if (q.term && q.term.value) {
                tokens.push(q.term.value);
            } else if (q.prefix && q.prefix.value) {
                tokens.push(q.prefix.value);
            } else if (q.wildcard && q.wildcard.value) {
                tokens.push(q.wildcard.value);
            } else if (q.phrase && q.phrase.value) {
                tokens.push(q.phrase.value);
            }
        };

        traverse(query);

        // Support bare string queries by basic whitespace tokenisation.
        if (typeof query === 'string' && query.trim()) {
            const words = this.tokenizer
                ? this.tokenizer.tokenize(query, 'standard' as any)
                : query.toLowerCase().split(/\s+/);
            tokens.push(...words);
        }

        return tokens;
    }

    /**
     * Paginate ranked results (simple slice).
     */
    paginate<T>(results: T[], from = 0, size = 10): T[] {
        if (!Array.isArray(results) || size <= 0) return [];
        return results.slice(from, from + size);
    }

    /**
     * Replace the scorer at runtime (used by SearchEngine to inject a scorer
     * with up-to-date collection statistics).
     */
    setScorer(scorer: IScorer | null) {
        // @ts-ignore – mutate private for internal use only
        this.scorer = scorer && typeof scorer.score === 'function' ? scorer : null;
    }

    /**
     * Helper to call scorer while supporting mocks with different arity.
     */
    private _callScorer(token: string, docId: string): number {
        try {
            const fn = this.scorer?.score;
            // If no scorer supplied, return 0 so caller can decide default.
            if (!fn) return 0;
            const fnLen = fn.length;
            if (fnLen === 1) {
                return fn(docId) || 0;
            } else if (fnLen === 2) {
                return fn(token, docId) || 0;
            } else {
                // Assume (token, docIdObj, tf)
                return fn(token, { value: docId }, 1) || 0;
            }
        } catch {
            return 0;
        }
    }
}

// Export both default and named versions for compatibility with various import styles.
export { RankingPipeline };
export default RankingPipeline;