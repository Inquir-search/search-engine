async function indexRickAndMorty() {
    const BASE_URL = 'http://localhost:3000';

    // Check if server is running and get available indices
    try {
        const healthResponse = await fetch(`${BASE_URL}/`);
        if (!healthResponse.ok) {
            throw new Error('Server not responding');
        }
        const healthData = await healthResponse.json();
        console.log('✓ Server is running');
        console.log('Available indices:', healthData.indices || 'None');

    } catch (error) {
        console.error('❌ Server not accessible:', error.message);
        console.log('Please start the server with: node server.js');
        return;
    }

    console.log('🚀 Starting Rick and Morty character indexing...');

    // Create rickandmorty index if it doesn't exist
    try {
        const createIndexResponse = await fetch(`${BASE_URL}/index`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                indexName: 'rickandmorty',
                enableShardedStorage: true,
                numShards: 4,
                facetFields: ['status', 'species', 'gender']
            })
        });

        if (createIndexResponse.ok) {
            console.log('✓ Created rickandmorty index');
        } else if (createIndexResponse.status === 409) {
            console.log('✓ rickandmorty index already exists');
        } else {
            const errorText = await createIndexResponse.text();
            console.warn('⚠️ Index creation warning:', errorText);
        }
    } catch (error) {
        console.warn('⚠️ Could not create index:', error.message);
    }

    let page = 1;
    let results = [];
    let totalAdded = 0;
    let totalProcessed = 0;

    do {
        try {
            console.log(`📄 Fetching page ${page}...`);
            const res = await fetch(`https://rickandmortyapi.com/api/character?page=${page}`);
            if (!res.ok) throw new Error(`API error: ${res.status}`);
            const data = await res.json();
            results = data.results;

            for (const character of results) {
                try {
                    const doc = {
                        id: character.id.toString(),
                        name: character.name,
                        status: character.status,
                        species: character.species,
                        gender: character.gender,
                        origin: character.origin?.name,
                        location: character.location?.name,
                        image: character.image
                    };

                    // Add to rickandmorty index using the new multi-index API
                    const addResponse = await fetch(`${BASE_URL}/index/rickandmorty/documents`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ documents: [doc] })
                    });

                    if (addResponse.ok) {
                        const result = await addResponse.json();
                        totalAdded += result.addedCount || 1;
                        console.log(`✓ Added: ${character.name} (${character.species})`);
                    } else {
                        const errorText = await addResponse.text();
                        console.error(`❌ Failed to add character ${character.name}:`, errorText);
                    }

                    totalProcessed++;

                } catch (error) {
                    console.error(`❌ Error adding character ${character.name}:`, error.message);
                }
            }

            page++;

            // Rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));

        } catch (error) {
            console.error(`❌ Error fetching page ${page}:`, error.message);
            break;
        }

    } while (results.length > 0);

    console.log('\n📊 Rick and Morty indexing completed!');
    console.log(`Total characters processed: ${totalProcessed}`);
    console.log(`Total characters indexed: ${totalAdded}`);

    // Test the search functionality
    console.log('\n🔍 Testing search functionality...');

    try {
        // Test 1: Search for Rick characters
        const searchResponse = await fetch(`${BASE_URL}/search/rickandmorty`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: {
                    bool: {
                        must: [
                            { match: { field: 'name', value: 'Rick' } }
                        ]
                    }
                },
                size: 5
            })
        });

        const searchResult = await searchResponse.json();

        if (searchResult.hits && searchResult.hits.length > 0) {
            console.log(`✓ Found ${searchResult.hits.length} characters matching "Rick"`);
            console.log('Top 3 Rick characters:');
            searchResult.hits.slice(0, 3).forEach((hit, index) => {
                console.log(`  ${index + 1}. ${hit.name} (${hit.species}) - Status: ${hit.status}`);
            });
        } else {
            console.log('❌ No Rick characters found');
        }

        // Test 2: Search for all characters
        const allResponse = await fetch(`${BASE_URL}/search/rickandmorty`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: { match_all: {} },
                size: 5
            })
        });

        const allResult = await allResponse.json();
        console.log(`✓ Total characters in index: ${allResult.total}`);

        // Test 3: Test aggregations (new aggregations API)
        const aggregationsResponse = await fetch(`${BASE_URL}/search/rickandmorty`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: { match_all: {} },
                size: 0, // Only need aggregations
                aggs: {
                    species_breakdown: { terms: { field: 'species', size: 5 } },
                    status_breakdown: { terms: { field: 'status', size: 5 } }
                }
            })
        });

        if (aggregationsResponse.ok) {
            const aggregationsResult = await aggregationsResponse.json();
            console.log('✓ New aggregations API test successful');
            if (aggregationsResult.aggregations) {
                console.log('Species breakdown:');
                aggregationsResult.aggregations.species_breakdown.buckets.forEach(bucket => {
                    console.log(`  - ${bucket.key}: ${bucket.doc_count}`);
                });
                console.log('Status breakdown:');
                aggregationsResult.aggregations.status_breakdown.buckets.forEach(bucket => {
                    console.log(`  - ${bucket.key}: ${bucket.doc_count}`);
                });
            }
        }

        // Test 4: Legacy facets endpoint (for backward compatibility)
        const facetsResponse = await fetch(`${BASE_URL}/facets/rickandmorty`);
        if (facetsResponse.ok) {
            const facets = await facetsResponse.json();
            console.log('✓ Legacy facets endpoint still works:', Object.keys(facets.facets || {}));
        }

        // Test 5: Get index stats
        const statsResponse = await fetch(`${BASE_URL}/index/rickandmorty/stats`);
        if (statsResponse.ok) {
            const stats = await statsResponse.json();
            console.log('✓ Rick and Morty index stats:');
            console.log(`  - Documents: ${stats.documents}`);
            console.log(`  - Tokens: ${stats.tokens}`);
            console.log(`  - Memory usage: ${stats.memoryUsage}`);
        }

    } catch (error) {
        console.error('❌ Search test failed:', error.message);
    }

    console.log('\n🎉 Rick and Morty indexing and testing completed successfully!');
}

indexRickAndMorty().catch((error) => {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
});
