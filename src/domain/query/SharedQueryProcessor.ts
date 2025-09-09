/**
 * Shared query processing utilities that can be used by both QueryProcessor and SharedMemoryWorkerPool
 * to avoid code duplication.
 */

export interface QueryProcessingOptions {
    documents: Map<string, any> | any[];
    tokenizer?: any;
    mappingsManager?: any;
}

export class SharedQueryProcessor {
    private documents: Map<string, any> | any[];

    constructor(options: QueryProcessingOptions) {
        this.documents = options.documents;
    }

    /**
     * Process a bool query with filters, must, should, must_not clauses
     */
    processBoolQuery(boolQuery: any): any[] {
        const docs = this.getDocumentsArray();
        let results = docs;

        // Process filter clauses first (mandatory)
        if (boolQuery.filter && Array.isArray(boolQuery.filter)) {
            for (const filterClause of boolQuery.filter) {
                results = this.processQueryClause(results, filterClause);
            }
        }

        // Process must clauses (mandatory)
        if (boolQuery.must && Array.isArray(boolQuery.must)) {
            for (const mustClause of boolQuery.must) {
                results = this.processQueryClause(results, mustClause);
            }
        }

        // Process should clauses (optional, but at least one must match if minimum_should_match is set)
        if (boolQuery.should && Array.isArray(boolQuery.should) && boolQuery.should.length > 0) {
            const shouldResults = [];
            for (const shouldClause of boolQuery.should) {
                const clauseResults = this.processQueryClause(docs, shouldClause);
                shouldResults.push(...clauseResults);
            }
            
            // Remove duplicates from should results
            const uniqueShouldResults = shouldResults.filter((doc, index, self) => 
                self.findIndex(d => d.id === doc.id) === index
            );

            if (boolQuery.minimum_should_match && boolQuery.minimum_should_match > 0) {
                // If minimum_should_match is set, intersect results with should results
                results = results.filter(doc => 
                    uniqueShouldResults.some(shouldDoc => shouldDoc.id === doc.id)
                );
            } else if (!boolQuery.must && (!boolQuery.filter || boolQuery.filter.length === 0)) {
                // If only should clauses, use should results
                results = uniqueShouldResults;
            }
        }

        // Process must_not clauses (exclusions)
        if (boolQuery.must_not && Array.isArray(boolQuery.must_not)) {
            for (const mustNotClause of boolQuery.must_not) {
                const excludeResults = this.processQueryClause(docs, mustNotClause);
                results = results.filter(doc => 
                    !excludeResults.some(excludeDoc => excludeDoc.id === doc.id)
                );
            }
        }

        return results;
    }

    /**
     * Process individual query clauses (match, term, prefix, wildcard, fuzzy, bool)
     */
    processQueryClause(docs: any[], clause: any): any[] {
        if (clause.match_all) {
            return docs;
        }
        
        if (clause.match && clause.match.field && clause.match.value !== undefined) {
            const field = clause.match.field;
            const value = clause.match.value.toString().toLowerCase();
            return docs.filter(doc => {
                const fieldValue = this.getFieldValue(doc, field);
                if (fieldValue === undefined || fieldValue === null) return false;
                return fieldValue.toString().toLowerCase() === value;
            });
        }

        if (clause.term && clause.term.field && clause.term.value !== undefined) {
            const field = clause.term.field;
            const value = clause.term.value.toString().toLowerCase();
            return docs.filter(doc => {
                const fieldValue = this.getFieldValue(doc, field);
                if (fieldValue === undefined || fieldValue === null) return false;
                return fieldValue.toString().toLowerCase() === value;
            });
        }

        if (clause.prefix && clause.prefix.field && clause.prefix.value !== undefined) {
            const field = clause.prefix.field;
            const value = clause.prefix.value.toString().toLowerCase();
            return docs.filter(doc => {
                const fieldValue = this.getFieldValue(doc, field);
                if (fieldValue === undefined || fieldValue === null) return false;
                return fieldValue.toString().toLowerCase().startsWith(value);
            });
        }

        if (clause.wildcard && clause.wildcard.field && clause.wildcard.value !== undefined) {
            const field = clause.wildcard.field;
            const value = clause.wildcard.value.toString().toLowerCase();
            const regex = new RegExp(value.replace(/\*/g, '.*').replace(/\?/g, '.'), 'i');
            return docs.filter(doc => {
                const fieldValue = this.getFieldValue(doc, field);
                if (fieldValue === undefined || fieldValue === null) return false;
                return regex.test(fieldValue.toString());
            });
        }

        if (clause.fuzzy && clause.fuzzy.field && clause.fuzzy.value !== undefined) {
            const field = clause.fuzzy.field;
            const value = clause.fuzzy.value.toString().toLowerCase();
            return docs.filter(doc => {
                const fieldValue = this.getFieldValue(doc, field);
                if (fieldValue === undefined || fieldValue === null) return false;
                const docValue = fieldValue.toString().toLowerCase();
                // Simple fuzzy matching - check if value is contained in field value
                return docValue.includes(value) || value.includes(docValue);
            });
        }

        if (clause.bool) {
            return this.processBoolQuery(clause.bool);
        }

        // Default: return all documents if clause type is not recognized
        return docs;
    }

    /**
     * Get field value from document, supporting dot notation
     */
    private getFieldValue(obj: any, path: string): any {
        if (!path) return undefined;
        const parts = path.split('.');
        let cur: any = obj;
        for (const p of parts) {
            if (cur == null) return undefined;
            cur = cur[p];
        }
        return cur;
    }

    /**
     * Get documents as array, handling both Map and Array formats
     */
    private getDocumentsArray(): any[] {
        if (Array.isArray(this.documents)) {
            return this.documents;
        } else if (this.documents instanceof Map) {
            return Array.from(this.documents.values());
        }
        return [];
    }
}
