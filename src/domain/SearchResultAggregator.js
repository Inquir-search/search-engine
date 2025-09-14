export function mergeSearchResults(results, { from = 0, size = 10 } = {}) {
    const hits = results.flatMap(r => r.hits);
    hits.sort((a, b) => b._score - a._score);
    const paginatedHits = hits.slice(from, from + size);

    const facets = {};
    for (const r of results) {
        for (const [field, values] of Object.entries(r.facets || {})) {
            if (!facets[field]) facets[field] = {};
            for (const [val, count] of Object.entries(values)) {
                facets[field][val] = (facets[field][val] || 0) + count;
            }
        }
    }
    const total = results.reduce((sum, r) => sum + r.total, 0);
    return { hits: paginatedHits, facets, total, from, size };
}
