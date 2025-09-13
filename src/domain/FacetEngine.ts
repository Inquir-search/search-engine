// Type definitions for FacetEngine
export interface FacetCalculationOptions {
    size?: number;
    min_doc_count?: number;
}

export interface FacetBucket {
    key: string | number;
    doc_count: number;
}

export interface TermsAggregationResult {
    buckets: FacetBucket[];
    doc_count_error_upper_bound: number;
    sum_other_doc_count: number;
}

export interface HistogramAggregationResult {
    buckets: FacetBucket[];
}

export interface DateHistogramAggregationResult {
    buckets: Array<{
        key: string;
        key_as_string: string;
        doc_count: number;
    }>;
}

export interface RangeDefinition {
    from?: number;
    to?: number;
    key?: string;
}

export interface RangeBucket {
    key: string;
    from?: number;
    to?: number;
    doc_count: number;
}

export interface RangeAggregationResult {
    buckets: RangeBucket[];
}

export interface NestedAggregationResult {
    doc_count: number;
    [key: string]: any;
}

export interface FacetResults {
    [field: string]: {
        [value: string]: number;
    };
}

export interface DocumentLike {
    id: string;
    [field: string]: any;
}

export interface MappingsManagerLike {
    getFieldType(field: string): string | undefined;
}

export interface FacetEngineSnapshot {
    facetFields: string[];
    facetIndex: Record<string, Record<string, string[]>>;
}

export default class FacetEngine {
    private facetFields: string[];
    private facetIndex: Map<string, Map<string, Set<string>>>;
    private mappingsManager: MappingsManagerLike | null;

    constructor(facetFields: string[] = [], mappingsManager: MappingsManagerLike | null = null) {
        // CRITICAL FIX: Ensure facetFields is properly handled
        if (!Array.isArray(facetFields)) {
            facetFields = [];
        }

        // CRITICAL FIX: Prevent string iteration bug
        if (typeof facetFields === 'string') {
            facetFields = (facetFields as string).split(',').map(f => f.trim()).filter(f => f) as string[];
        }

        this.facetFields = facetFields;
        this.facetIndex = new Map();
        this.mappingsManager = mappingsManager;
    }

    add(doc: DocumentLike): void {
        // CRITICAL FIX: Prevent iteration over non-array
        if (!Array.isArray(this.facetFields)) {
            console.error('FacetEngine.add: facetFields is not an array!', typeof this.facetFields, this.facetFields);
            return;
        }

        for (const field of this.facetFields) {
            const value = doc[field];
            if (value) {
                // Only allow faceting on keyword fields for proper UI support
                if (this.mappingsManager) {
                    const fieldType = this.mappingsManager.getFieldType(field);
                    if (fieldType !== 'keyword') {
                        console.warn(`FacetEngine.add: Field '${field}' has type '${fieldType}'. Only 'keyword' fields can be used for faceting.`);
                        continue;
                    }
                }

                if (!this.facetIndex.has(field)) {
                    this.facetIndex.set(field, new Map());
                }
                const fieldMap = this.facetIndex.get(field)!;
                if (!fieldMap.has(String(value))) {
                    fieldMap.set(String(value), new Set());
                }
                fieldMap.get(String(value))!.add(doc.id);
            }
        }
    }

    calculate(docIds: Set<string>): FacetResults {
        const facets: FacetResults = {};
        for (const [field, valuesMap] of this.facetIndex.entries()) {
            facets[field] = {};
            for (const [value, ids] of valuesMap.entries()) {
                const intersection = new Set([...ids].filter(id => docIds.has(id)));
                if (intersection.size > 0) {
                    facets[field][value] = intersection.size;
                }
            }
        }
        return facets;
    }

    // Alias for backward compatibility
    getFacets(docs: DocumentLike[] | Set<string>): FacetResults {
        if (Array.isArray(docs)) {
            const docIds = new Set(docs.map(doc => typeof doc === 'string' ? doc : doc.id));
            return this.calculate(docIds);
        }
        return this.calculate(docs as Set<string>);
    }

    /**
     * Calculate terms aggregation (most common aggregation type)
     * Similar to OpenSearch terms aggregation
     */
    calculateTerms(docs: DocumentLike[], field: string, options: FacetCalculationOptions = {}): TermsAggregationResult {
        if (!docs || docs.length === 0) return { buckets: [], doc_count_error_upper_bound: 0, sum_other_doc_count: 0 };

        const { size = 10, min_doc_count = 1 } = options;
        const fieldCounts = new Map<string, number>();

        // Count occurrences of each field value
        for (const doc of docs) {
            const value = doc[field];
            if (value !== undefined && value !== null) {
                const stringValue = String(value);
                const count = fieldCounts.get(stringValue) || 0;
                fieldCounts.set(stringValue, count + 1);
            }
        }

        // Convert to buckets format and sort by doc_count (descending)
        const buckets = Array.from(fieldCounts.entries())
            .filter(([, count]) => count >= min_doc_count)
            .sort((a, b) => b[1] - a[1])
            .slice(0, size)
            .map(([key, doc_count]) => ({ key, doc_count }));

        return {
            buckets,
            doc_count_error_upper_bound: 0,
            sum_other_doc_count: Math.max(0, fieldCounts.size - size)
        };
    }

    /**
     * Calculate histogram aggregation for numeric fields
     */
    calculateHistogram(docs: DocumentLike[], field: string, interval: number): HistogramAggregationResult {
        if (!docs || docs.length === 0) return { buckets: [] };

        const buckets = new Map<number, number>();

        for (const doc of docs) {
            const value = doc[field];
            if (typeof value === 'number') {
                // Calculate bucket key based on interval
                const bucketKey = Math.floor(value / interval) * interval;
                const count = buckets.get(bucketKey) || 0;
                buckets.set(bucketKey, count + 1);
            }
        }

        // Sort buckets by key and convert to array
        const sortedBuckets = Array.from(buckets.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([key, doc_count]) => ({ key, doc_count }));

        return { buckets: sortedBuckets };
    }

    /**
     * Calculate date histogram aggregation
     */
    calculateDateHistogram(docs: DocumentLike[], field: string, interval: string): DateHistogramAggregationResult {
        if (!docs || docs.length === 0) return { buckets: [] };

        const buckets = new Map<string, number>();

        // Parse interval (e.g., "1d", "1h", "1M")
        const intervalMap: Record<string, number> = {
            '1s': 1000,
            '1m': 60 * 1000,
            '1h': 60 * 60 * 1000,
            '1d': 24 * 60 * 60 * 1000,
            '1w': 7 * 24 * 60 * 60 * 1000,
            '1M': 30 * 24 * 60 * 60 * 1000, // Approximate month
            '1y': 365 * 24 * 60 * 60 * 1000 // Approximate year
        };

        const intervalMs = intervalMap[interval] || intervalMap['1d'];

        for (const doc of docs) {
            const value = doc[field];
            let date: Date;

            if (value instanceof Date) {
                date = value;
            } else if (typeof value === 'string') {
                date = new Date(value);
            } else if (typeof value === 'number') {
                date = new Date(value);
            } else {
                continue; // Skip invalid dates
            }

            if (isNaN(date.getTime())) continue; // Skip invalid dates

            // Round down to the nearest interval
            const bucketTime = Math.floor(date.getTime() / intervalMs) * intervalMs;
            const bucketDate = new Date(bucketTime);
            const bucketKey = bucketDate.toISOString();

            const count = buckets.get(bucketKey) || 0;
            buckets.set(bucketKey, count + 1);
        }

        // Sort buckets by key and convert to array
        const sortedBuckets = Array.from(buckets.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([key, doc_count]) => ({
                key,
                key_as_string: key,
                doc_count
            }));

        return { buckets: sortedBuckets };
    }

    /**
     * Calculate range aggregation
     */
    calculateRange(docs: DocumentLike[], field: string, ranges: RangeDefinition[] = []): RangeAggregationResult {
        if (!docs || docs.length === 0) return { buckets: [] };

        const buckets: RangeBucket[] = [];

        for (const range of ranges) {
            let doc_count = 0;
            const key = range.key || this._generateRangeKey(range);

            for (const doc of docs) {
                const value = doc[field];
                if (typeof value === 'number') {
                    const inRange = this._isValueInRange(value, range);
                    if (inRange) {
                        doc_count++;
                    }
                }
            }

            buckets.push({
                key,
                from: range.from,
                to: range.to,
                doc_count
            });
        }

        return { buckets };
    }

    /**
     * Calculate nested aggregation
     */
    calculateNested(docs: DocumentLike[], path: string, subAggregations: Record<string, any> = {}): NestedAggregationResult {
        if (!docs || docs.length === 0) return { doc_count: 0 };

        // Filter documents that have the nested path
        const nestedDocs = docs.filter(doc => {
            const nestedValue = this._getNestedValue(doc, path);
            return nestedValue !== undefined && nestedValue !== null;
        });

        const result: NestedAggregationResult = {
            doc_count: nestedDocs.length
        };

        // Process sub-aggregations if provided
        for (const [aggName, aggConfig] of Object.entries(subAggregations)) {
            if (aggConfig.terms) {
                const field = aggConfig.terms.field;
                const nestedField = field.startsWith(path + '.') ? field : `${path}.${field}`;
                result[aggName] = this.calculateTerms(nestedDocs, nestedField, aggConfig.terms);
            }
            // Add more sub-aggregation types as needed
        }

        return result;
    }

    /**
     * Save facet index state
     */
    save(): FacetEngineSnapshot {
        const snapshot: FacetEngineSnapshot = {
            facetFields: [...this.facetFields],
            facetIndex: {}
        };

        for (const [field, valueMap] of this.facetIndex.entries()) {
            snapshot.facetIndex[field] = {};
            for (const [value, docIds] of valueMap.entries()) {
                snapshot.facetIndex[field][value] = Array.from(docIds);
            }
        }

        return snapshot;
    }

    /**
     * Load facet index state from snapshot
     */
    load(snapshot: FacetEngineSnapshot): void {
        this.facetFields = [...snapshot.facetFields];
        this.facetIndex.clear();

        for (const [field, valueObj] of Object.entries(snapshot.facetIndex)) {
            const valueMap = new Map<string, Set<string>>();
            for (const [value, docIds] of Object.entries(valueObj)) {
                valueMap.set(value, new Set(docIds));
            }
            this.facetIndex.set(field, valueMap);
        }
    }

    /**
     * Clear all facet data
     */
    clear(): void {
        this.facetIndex.clear();
    }

    /**
     * Get facet fields
     */
    getFacetFields(): string[] {
        return [...this.facetFields];
    }

    /**
     * Helper method to generate range key
     */
    private _generateRangeKey(range: RangeDefinition): string {
        if (range.from !== undefined && range.to !== undefined) {
            return `${range.from}-${range.to}`;
        } else if (range.from !== undefined) {
            return `${range.from}-*`;
        } else if (range.to !== undefined) {
            return `*-${range.to}`;
        } else {
            return '*';
        }
    }

    /**
     * Helper method to check if value is in range
     */
    private _isValueInRange(value: number, range: RangeDefinition): boolean {
        const fromCheck = range.from === undefined || value >= range.from;
        const toCheck = range.to === undefined || value < range.to;
        return fromCheck && toCheck;
    }

    /**
     * Helper method to get nested value from document
     */
    private _getNestedValue(doc: DocumentLike, path: string): any {
        const parts = path.split('.');
        let value: any = doc;

        for (const part of parts) {
            if (value && typeof value === 'object' && part in value) {
                value = value[part];
            } else {
                return undefined;
            }
        }

        return value;
    }
}
