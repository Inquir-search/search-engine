import { SearchResult, FacetData, TermsAggregationResult } from '../src/application/results/SearchResult.js';
import { SearchScore } from '../src/domain/valueObjects/index.js';

// Example: E-commerce product search with facets
async function demonstrateFacets() {
    console.log('=== Facets in SearchResult Example ===\n');

    // Sample search results with facets
    const facets: FacetData = {
        // Simple facet format (field -> value -> count)
        category: {
            'Electronics': 45,
            'Clothing': 32,
            'Books': 18,
            'Home & Garden': 12
        },

        // Terms aggregation format (more detailed)
        brand: {
            buckets: [
                { key: 'Apple', doc_count: 25 },
                { key: 'Samsung', doc_count: 18 },
                { key: 'Sony', doc_count: 12 },
                { key: 'Nike', doc_count: 10 },
                { key: 'Adidas', doc_count: 8 }
            ],
            doc_count_error_upper_bound: 0,
            sum_other_doc_count: 3
        } as TermsAggregationResult,

        // Price ranges
        price_range: {
            buckets: [
                { key: '0-50', doc_count: 35 },
                { key: '50-100', doc_count: 28 },
                { key: '100-200', doc_count: 22 },
                { key: '200+', doc_count: 15 }
            ],
            doc_count_error_upper_bound: 0,
            sum_other_doc_count: 0
        } as TermsAggregationResult
    };

    // Create SearchResult with facets
    const searchResult = new SearchResult({
        hits: [
            {
                _id: 'product1',
                _score: SearchScore.fromNumber(1.5),
                _source: {
                    name: 'iPhone 15 Pro',
                    category: 'Electronics',
                    brand: 'Apple',
                    price: 999
                }
            },
            {
                _id: 'product2',
                _score: SearchScore.fromNumber(1.2),
                _source: {
                    name: 'Samsung Galaxy S24',
                    category: 'Electronics',
                    brand: 'Samsung',
                    price: 899
                }
            }
        ],
        total: 100,
        from: 0,
        size: 10,
        facets,
        took: 15
    });

    // Demonstrate facet functionality
    console.log('Has facets:', searchResult.hasFacets());
    console.log('Total results:', searchResult.total);
    console.log('Search took:', searchResult.took, 'ms\n');

    // Get category facet (simple format)
    const categoryFacet = searchResult.getFacet('category');
    console.log('Category facet:', categoryFacet);
    console.log('Category buckets:', searchResult.getFacetBuckets('category'));
    console.log();

    // Get brand facet (terms aggregation format)
    const brandFacet = searchResult.getFacet('brand');
    console.log('Brand facet:', brandFacet);
    console.log('Brand buckets:', searchResult.getFacetBuckets('brand'));
    console.log();

    // Get price range facet
    const priceRangeBuckets = searchResult.getFacetBuckets('price_range');
    console.log('Price range buckets:');
    priceRangeBuckets.forEach(bucket => {
        console.log(`  ${bucket.key}: ${bucket.doc_count} products`);
    });
    console.log();

    // Convert to JSON (for API responses)
    const jsonResult = searchResult.toJSON();
    console.log('JSON result structure:');
    console.log('- hits:', jsonResult.hits.length);
    console.log('- total:', jsonResult.total);
    console.log('- facets keys:', Object.keys(jsonResult.facets));
    console.log('- aggregations keys:', Object.keys(jsonResult.aggregations));
}

// Example: Building faceted navigation
function buildFacetedNavigation(searchResult: SearchResult) {
    console.log('\n=== Building Faceted Navigation ===\n');

    const navigation = {
        filters: {} as Record<string, Array<{ value: string | number, count: number, selected: boolean }>>
    };

    // Build navigation from all facets
    Object.keys(searchResult.facets).forEach(field => {
        const buckets = searchResult.getFacetBuckets(field);
        navigation.filters[field] = buckets.map(bucket => ({
            value: bucket.key,
            count: bucket.doc_count,
            selected: false // Would be determined by current filters
        }));
    });

    console.log('Faceted navigation structure:');
    Object.entries(navigation.filters).forEach(([field, filters]) => {
        console.log(`\n${field.toUpperCase()}:`);
        filters.forEach(filter => {
            console.log(`  ${filter.value} (${filter.count})`);
        });
    });
}

if (import.meta.url === `file://${process.argv[1]}`) {
    demonstrateFacets().then(() => {
        // Additional demonstration
        const sampleResult = new SearchResult({
            hits: [],
            total: 0,
            facets: {
                status: { 'active': 10, 'inactive': 5 },
                type: {
                    buckets: [
                        { key: 'premium', doc_count: 8 },
                        { key: 'basic', doc_count: 7 }
                    ],
                    doc_count_error_upper_bound: 0,
                    sum_other_doc_count: 0
                } as TermsAggregationResult
            }
        });

        buildFacetedNavigation(sampleResult);
    }).catch(console.error);
}

export { demonstrateFacets, buildFacetedNavigation }; 