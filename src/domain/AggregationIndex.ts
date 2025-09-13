/**
 * AggregationIndex - Efficient aggregation using inverted indices
 *
 * This class creates specialized inverted indices for aggregation fields,
 * similar to how Elasticsearch uses doc values and field data.
 */

// Type definitions
export interface TermsOptions {
    size?: number;
    min_doc_count?: number;
}

export interface RangeDefinition {
    from?: number;
    to?: number;
    key?: string;
}

export interface TermBucket {
    key: string;
    doc_count: number;
}

export interface HistogramBucket {
    key: number;
    doc_count: number;
}

export interface RangeBucket {
    key: string;
    from?: number;
    to?: number;
    doc_count: number;
}

export interface AggregationStats {
    totalFields: number;
    totalValues: number;
    totalDocuments: number;
    fieldStats: Record<string, {
        uniqueValues: number;
        totalDocuments: number;
    }>;
}

export interface SerializedAggregationIndex {
    fieldValueIndex: Record<string, Record<string, string[]>>;
    docFieldIndex: Record<string, Record<string, any>>;
    globalOrdinals: Record<string, Record<string, number>>;
    reverseOrdinals: Record<string, Record<string, string>>;
    ordinalCounters: Record<string, number>;
    aggregationFields: string[];
}

export default class AggregationIndex {
    // Map of field -> value -> Set of document IDs
    private fieldValueIndex: Map<string, Map<string, Set<string>>>;

    // Map of field -> document ID -> value (for fast document lookup)
    private docFieldIndex: Map<string, Map<string, any>>;

    // Global ordinals: field -> value -> numeric ID
    private globalOrdinals: Map<string, Map<string, number>>;

    // Reverse ordinals: field -> numeric ID -> value
    private reverseOrdinals: Map<string, Map<number, string>>;

    // Counter for assigning ordinal IDs
    private ordinalCounters: Map<string, number>;

    // Fields to index for aggregations
    private aggregationFields: Set<string>;

    constructor(aggregationFields: string[] = []) {
        // Map of field -> value -> Set of document IDs
        this.fieldValueIndex = new Map();

        // Map of field -> document ID -> value (for fast document lookup)
        this.docFieldIndex = new Map();

        // Global ordinals: field -> value -> numeric ID
        this.globalOrdinals = new Map();

        // Reverse ordinals: field -> numeric ID -> value
        this.reverseOrdinals = new Map();

        // Counter for assigning ordinal IDs
        this.ordinalCounters = new Map();

        // Fields to index for aggregations
        this.aggregationFields = new Set(aggregationFields);
    }

    /**
     * Add a document to the aggregation index
     */
    add(doc: Record<string, any>, docId: string): void {
        for (const field of this.aggregationFields) {
            const value = this._extractFieldValue(doc, field);
            if (value !== null && value !== undefined) {
                this._indexFieldValue(field, value, docId);
            }
        }
    }

    /**
     * Remove a document from the aggregation index
     */
    remove(docId: string): void {
        for (const [field, docFieldMap] of this.docFieldIndex) {
            if (docFieldMap.has(docId)) {
                const value = docFieldMap.get(docId);

                // Remove from field-value index
                const fieldValueMap = this.fieldValueIndex.get(field);
                if (fieldValueMap && fieldValueMap.has(String(value))) {
                    const docSet = fieldValueMap.get(String(value));
                    if (docSet) {
                        docSet.delete(docId);
                        if (docSet.size === 0) {
                            fieldValueMap.delete(String(value));
                        }
                    }
                }

                // Remove from doc-field index
                docFieldMap.delete(docId);
            }
        }
    }

    /**
     * Calculate terms aggregation
     */
    calculateTerms(docIds: string[], field: string, options: TermsOptions = {}): TermBucket[] {
        const { size = 10, min_doc_count = 1 } = options;

        if (!this.fieldValueIndex.has(field)) {
            return [];
        }

        const fieldValueMap = this.fieldValueIndex.get(field)!;
        const docIdSet = new Set(docIds);
        const termCounts = new Map<string, number>();

        for (const [value, documentIds] of fieldValueMap) {
            let count = 0;
            for (const docId of documentIds) {
                if (docIdSet.has(docId)) {
                    count++;
                }
            }

            if (count >= min_doc_count) {
                termCounts.set(value, count);
            }
        }

        // Sort by count (descending) and return top results
        return Array.from(termCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, size)
            .map(([key, doc_count]) => ({ key, doc_count }));
    }

    /**
     * Calculate histogram aggregation
     */
    calculateHistogram(docIds: string[], field: string, interval: number): HistogramBucket[] {
        if (!this.fieldValueIndex.has(field)) {
            return [];
        }

        const fieldValueMap = this.fieldValueIndex.get(field)!;
        const docIdSet = new Set(docIds);
        const buckets = new Map<number, number>();

        for (const [value, documentIds] of fieldValueMap) {
            const numericValue = Number(value);
            if (isNaN(numericValue)) continue;

            const bucketKey = Math.floor(numericValue / interval) * interval;

            let count = 0;
            for (const docId of documentIds) {
                if (docIdSet.has(docId)) {
                    count++;
                }
            }

            if (count > 0) {
                buckets.set(bucketKey, (buckets.get(bucketKey) || 0) + count);
            }
        }

        // Sort by bucket key and return
        return Array.from(buckets.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([key, doc_count]) => ({ key, doc_count }));
    }

    /**
     * Calculate range aggregation
     */
    calculateRange(docIds: string[], field: string, ranges: RangeDefinition[] = []): RangeBucket[] {
        if (!this.fieldValueIndex.has(field)) {
            return [];
        }

        const fieldValueMap = this.fieldValueIndex.get(field)!;
        const docIdSet = new Set(docIds);
        const rangeBuckets = new Map<string, number>();

        for (const range of ranges) {
            let key: string;
            if (range.from !== undefined && range.to !== undefined) {
                key = `${range.from}-${range.to}`;
            } else if (range.from !== undefined) {
                key = `${range.from}-*`;
            } else if (range.to !== undefined) {
                key = `*-${range.to}`;
            } else {
                key = '*';
            }

            for (const [value, documentIds] of fieldValueMap) {
                const numericValue = Number(value);
                if (!isNaN(numericValue)) {
                    const withinRange = (range.from === undefined || numericValue >= range.from) &&
                        (range.to === undefined || numericValue < range.to);

                    if (withinRange) {
                        let count = 0;
                        for (const docId of documentIds) {
                            if (docIdSet.has(docId)) {
                                count++;
                            }
                        }
                        rangeBuckets.set(key, (rangeBuckets.get(key) || 0) + count);
                    }
                }
            }
        }

        return ranges.map(range => {
            let key: string;
            if (range.from !== undefined && range.to !== undefined) {
                key = `${range.from}-${range.to}`;
            } else if (range.from !== undefined) {
                key = `${range.from}-*`;
            } else if (range.to !== undefined) {
                key = `*-${range.to}`;
            } else {
                key = '*';
            }

            return {
                key: range.key || key,
                from: range.from,
                to: range.to,
                doc_count: rangeBuckets.get(key) || 0
            };
        });
    }

    /**
     * Get all values for a field
     */
    getFieldValues(field: string): string[] {
        const fieldValueMap = this.fieldValueIndex.get(field);
        return fieldValueMap ? Array.from(fieldValueMap.keys()) : [];
    }

    /**
     * Get all documents for a specific field value
     */
    getDocumentsForValue(field: string, value: string): string[] {
        const fieldValueMap = this.fieldValueIndex.get(field);
        if (!fieldValueMap) return [];

        const docSet = fieldValueMap.get(value);
        return docSet ? Array.from(docSet) : [];
    }

    /**
     * Extract field value from document
     */
    private _extractFieldValue(doc: Record<string, any>, field: string): any {
        const parts = field.split('.');
        let value = doc;

        for (const part of parts) {
            if (value && typeof value === 'object' && part in value) {
                value = value[part];
            } else {
                return null;
            }
        }

        return value;
    }

    /**
     * Index a field value for a document
     */
    private _indexFieldValue(field: string, value: any, docId: string): void {
        if (!this.fieldValueIndex.has(field)) {
            this.fieldValueIndex.set(field, new Map());
            this.docFieldIndex.set(field, new Map());
            this.globalOrdinals.set(field, new Map());
            this.reverseOrdinals.set(field, new Map());
            this.ordinalCounters.set(field, 0);
        }

        const fieldValueMap = this.fieldValueIndex.get(field)!;
        const docFieldMap = this.docFieldIndex.get(field)!;

        const stringValue = String(value);

        // Add to field-value index
        if (!fieldValueMap.has(stringValue)) {
            fieldValueMap.set(stringValue, new Set());

            // Assign global ordinal
            const ordinalsMap = this.globalOrdinals.get(field)!;
            const reverseOrdinalsMap = this.reverseOrdinals.get(field)!;
            const counter = this.ordinalCounters.get(field)!;

            ordinalsMap.set(stringValue, counter);
            reverseOrdinalsMap.set(counter, stringValue);
            this.ordinalCounters.set(field, counter + 1);
        }

        fieldValueMap.get(stringValue)!.add(docId);

        // Add to doc-field index
        docFieldMap.set(docId, value);
    }

    /**
     * Clear all data
     */
    clear(): void {
        this.fieldValueIndex.clear();
        this.docFieldIndex.clear();
        this.globalOrdinals.clear();
        this.reverseOrdinals.clear();
        this.ordinalCounters.clear();
    }

    /**
     * Get aggregation statistics
     */
    getStats(): AggregationStats {
        const stats: AggregationStats = {
            totalFields: this.fieldValueIndex.size,
            totalValues: 0,
            totalDocuments: 0,
            fieldStats: {}
        };

        for (const [field, fieldValueMap] of this.fieldValueIndex) {
            let uniqueValues = 0;
            let totalDocuments = 0;

            for (const docSet of fieldValueMap.values()) {
                uniqueValues++;
                totalDocuments += docSet.size;
            }

            stats.fieldStats[field] = {
                uniqueValues,
                totalDocuments
            };

            stats.totalValues += uniqueValues;
            stats.totalDocuments += totalDocuments;
        }

        return stats;
    }

    /**
     * Serialize the index for persistence
     */
    serialize(): SerializedAggregationIndex {
        const fieldValueIndexObj: Record<string, Record<string, string[]>> = {};
        for (const [field, valueMap] of this.fieldValueIndex) {
            fieldValueIndexObj[field] = {};
            for (const [value, docSet] of valueMap) {
                fieldValueIndexObj[field][value] = Array.from(docSet);
            }
        }

        const docFieldIndexObj: Record<string, Record<string, any>> = {};
        for (const [field, docObj] of this.docFieldIndex) {
            docFieldIndexObj[field] = {};
            for (const [docId, value] of docObj) {
                docFieldIndexObj[field][docId] = value;
            }
        }

        const globalOrdinalsObj: Record<string, Record<string, number>> = {};
        for (const [field, ordinalMap] of this.globalOrdinals) {
            globalOrdinalsObj[field] = {};
            for (const [value, ordinal] of ordinalMap) {
                globalOrdinalsObj[field][value] = ordinal;
            }
        }

        const reverseOrdinalsObj: Record<string, Record<string, string>> = {};
        for (const [field, reverseMap] of this.reverseOrdinals) {
            reverseOrdinalsObj[field] = {};
            for (const [ordinal, value] of reverseMap) {
                reverseOrdinalsObj[field][String(ordinal)] = value;
            }
        }

        const ordinalCountersObj: Record<string, number> = {};
        for (const [field, counter] of this.ordinalCounters) {
            ordinalCountersObj[field] = counter;
        }

        return {
            fieldValueIndex: fieldValueIndexObj,
            docFieldIndex: docFieldIndexObj,
            globalOrdinals: globalOrdinalsObj,
            reverseOrdinals: reverseOrdinalsObj,
            ordinalCounters: ordinalCountersObj,
            aggregationFields: Array.from(this.aggregationFields)
        };
    }

    /**
     * Deserialize and load index data
     */
    deserialize(data: SerializedAggregationIndex): void {
        this.clear();

        // Restore field-value index
        for (const [field, valueObj] of Object.entries(data.fieldValueIndex)) {
            const valueMap = new Map<string, Set<string>>();
            for (const [value, docIds] of Object.entries(valueObj)) {
                valueMap.set(value, new Set(docIds));
            }
            this.fieldValueIndex.set(field, valueMap);
        }

        // Restore doc-field index
        for (const [field, docObj] of Object.entries(data.docFieldIndex)) {
            const docMap = new Map<string, any>();
            for (const [docId, value] of Object.entries(docObj)) {
                docMap.set(docId, value);
            }
            this.docFieldIndex.set(field, docMap);
        }

        // Restore global ordinals
        for (const [field, ordinalObj] of Object.entries(data.globalOrdinals)) {
            const ordinalMap = new Map<string, number>();
            for (const [value, ordinal] of Object.entries(ordinalObj)) {
                ordinalMap.set(value, ordinal);
            }
            this.globalOrdinals.set(field, ordinalMap);
        }

        // Restore reverse ordinals
        for (const [field, reverseObj] of Object.entries(data.reverseOrdinals)) {
            const reverseMap = new Map<number, string>();
            for (const [ordinal, value] of Object.entries(reverseObj)) {
                reverseMap.set(Number(ordinal), value);
            }
            this.reverseOrdinals.set(field, reverseMap);
        }

        // Restore ordinal counters
        for (const [field, counter] of Object.entries(data.ordinalCounters)) {
            this.ordinalCounters.set(field, counter);
        }

        // Restore aggregation fields
        this.aggregationFields = new Set(data.aggregationFields);
    }
}