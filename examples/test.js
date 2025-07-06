async function indexRickAndMorty() {
    const BASE_URL = 'http://localhost:3000';

    // Check if server is running
    try {
        const healthResponse = await fetch(`${BASE_URL}/`);
        if (!healthResponse.ok) {
            throw new Error('Server not responding');
        }
        console.log('✅ Server is running');
    } catch (error) {
        console.error('❌ Server is not running. Please start the server first with: node server.js');
        return;
    }

    let page = 1;
    let results = [];
    let totalAdded = 0;

    console.log('🚀 Starting to index Rick and Morty characters...');

    do {
        console.log(`📥 Fetching page ${page}...`);
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
                };

                const addResponse = await fetch(`${BASE_URL}/add`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(doc)
                });

                if (addResponse.ok) {
                    totalAdded++;
                    if (totalAdded % 50 === 0) {
                        console.log(`📝 Added ${totalAdded} characters...`);
                    }
                } else {
                    console.error(`Failed to add character ${character.name}`);
                }
            } catch (error) {
                console.error(`Error adding character ${character.name}:`, error.message);
            }
        }

        page++;
    } while (results.length > 0);

    console.log(`✅ Successfully indexed ${totalAdded} Rick and Morty characters!`);

    // Test the search functionality
    console.log('\n🔍 Testing search functionality...');
    try {
        const searchResponse = await fetch(`${BASE_URL}/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: {
                    bool: {
                        must: [
                            { match: { field: 'name', value: 'Rick' } }
                        ]
                    }
                }
            })
        });

        const searchResult = await searchResponse.json();
        console.log(`Found ${searchResult.hits.length} characters named Rick`);
        if (searchResult.hits.length > 0) {
            console.log('First result:', searchResult.hits[0].doc.name);
        }
    } catch (error) {
        console.error('Search test failed:', error.message);
    }
}

indexRickAndMorty().catch(console.error);
