export default class FacetEngine {
    constructor(facetFields = []) {
        this.facetFields = facetFields;
        this.facetIndex = new Map();
    }

    add(doc) {
        for (const field of this.facetFields) {
            const value = doc[field];
            if (value) {
                if (!this.facetIndex.has(field)) {
                    this.facetIndex.set(field, new Map());
                }
                const fieldMap = this.facetIndex.get(field);
                if (!fieldMap.has(value)) {
                    fieldMap.set(value, new Set());
                }
                fieldMap.get(value).add(doc.id);
            }
        }
    }

    calculate(docIds) {
        const facets = {};
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
}
