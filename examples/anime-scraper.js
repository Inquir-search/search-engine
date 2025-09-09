const API_BASE = 'http://localhost:3000';

// Configuration
const CONFIG = {
    maxPages: 20,           // Number of pages to scrape (25 anime per page = 500 total)
    rateLimitMs: 200,       // Delay between individual anime requests (milliseconds)
    pageDelayMs: 1000,      // Delay between pages (milliseconds)
    enableShardedStorage: true,
    numShards: 4            // Reasonable shards for data
};



async function scrapeAnimeData() {
    console.log('🎌 Starting anime data scraping...');

    try {
        // Check if server is running and get available indices
        const healthResponse = await fetch(`${API_BASE}/`);
        if (!healthResponse.ok) {
            throw new Error('Server not responding');
        }
        const healthData = await healthResponse.json();
        console.log('✓ Server is running');
        console.log('Available indices:', healthData.indices || 'None');

        // Fetch top anime from Jikan API across multiple pages
        console.log('📡 Fetching top anime from Jikan API...');
        console.log(`📊 Configuration: ${CONFIG.maxPages} pages, ${CONFIG.rateLimitMs}ms rate limit, ${CONFIG.pageDelayMs}ms page delay`);

        const allAnimeData = [];
        const limit = 25; // Jikan API limit per page
        let page = 1;

        do {
            try {
                console.log(`📄 Fetching page ${page}...`);
                const response = await fetch(`https://api.jikan.moe/v4/top/anime?limit=${limit}&page=${page}`);

                if (!response.ok) {
                    if (response.status === 404) {
                        console.log(`✓ Reached end of data at page ${page}`);
                        break;
                    }
                    throw new Error(`API error: ${response.status}`);
                }

                const pageData = await response.json();

                if (!pageData.data || !Array.isArray(pageData.data)) {
                    console.error(`❌ Page ${page} has invalid data format`);
                    break;
                }

                if (pageData.data.length === 0) {
                    console.log(`✓ No more data on page ${page}, stopping...`);
                    break;
                }

                allAnimeData.push(...pageData.data);
                console.log(`✓ Page ${page}: Added ${pageData.data.length} anime (Total: ${allAnimeData.length})`);

                page++;

                // Rate limiting between pages - be respectful to Jikan API
                await new Promise(resolve => setTimeout(resolve, CONFIG.pageDelayMs));

            } catch (error) {
                console.error(`❌ Error fetching page ${page}:`, error.message);
                break;
            }
        } while (page <= CONFIG.maxPages);

        console.log(`📚 Total anime collected: ${allAnimeData.length} titles`);

        // Create anime index if it doesn't exist
        try {
            const createIndexResponse = await fetch(`${API_BASE}/index`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    indexName: 'anime',
                    enableShardedStorage: CONFIG.enableShardedStorage,
                    numShards: CONFIG.numShards,
                    facetFields: ['type', 'status', 'genres', 'studios', 'rating', 'themes', 'demographics', 'source', 'season']
                })
            });

            if (createIndexResponse.ok) {
                console.log('✓ Created anime index');
            } else if (createIndexResponse.status === 409) {
                console.log('✓ anime index already exists');
            } else {
                const errorText = await createIndexResponse.text();
                console.warn('⚠️ Index creation warning:', errorText);
            }
        } catch (error) {
            console.warn('⚠️ Could not create index:', error.message);
        }

        let successCount = 0;
        let errorCount = 0;
        let totalProcessed = 0;

        // Process each anime
        for (const anime of allAnimeData) {
            try {
                totalProcessed++;
                // Transform anime data to our format with enhanced fields
                const animeDoc = {
                    id: `anime_${anime.mal_id}`,
                    name: anime.title,
                    english_name: anime.title_english || anime.title,
                    japanese_name: anime.title_japanese || anime.title,
                    title_synonyms: anime.title_synonyms || [],
                    type: anime.type || 'Unknown',
                    status: anime.status || 'Unknown',
                    season: anime.season || 'Unknown',
                    year: anime.year || 0,
                    rating: anime.rating || 'Unknown',
                    score: anime.score || 0,
                    scored_by: anime.scored_by || 0,
                    rank: anime.rank || 0,
                    popularity: anime.popularity || 0,
                    members: anime.members || 0,
                    favorites: anime.favorites || 0,
                    synopsis: anime.synopsis || '',
                    background: anime.background || '',
                    genres: anime.genres?.map(g => g.name) || [],
                    themes: anime.themes?.map(t => t.name) || [],
                    demographics: anime.demographics?.map(d => d.name) || [],
                    studios: anime.studios?.map(s => s.name) || [],
                    producers: anime.producers?.map(p => p.name) || [],
                    licensors: anime.licensors?.map(l => l.name) || [],
                    duration: anime.duration || 'Unknown',
                    episodes: anime.episodes || 0,
                    source: anime.source || 'Unknown',
                    aired: {
                        from: anime.aired?.from || null,
                        to: anime.aired?.to || null,
                        string: anime.aired?.string || ''
                    },
                    broadcast: {
                        day: anime.broadcast?.day || null,
                        time: anime.broadcast?.time || null,
                        timezone: anime.broadcast?.timezone || null,
                        string: anime.broadcast?.string || ''
                    },
                    images: {
                        jpg: {
                            image_url: anime.images?.jpg?.image_url || '',
                            small_image_url: anime.images?.jpg?.small_image_url || '',
                            large_image_url: anime.images?.jpg?.large_image_url || ''
                        },
                        webp: {
                            image_url: anime.images?.webp?.image_url || '',
                            small_image_url: anime.images?.webp?.small_image_url || '',
                            large_image_url: anime.images?.webp?.large_image_url || ''
                        }
                    },
                    image_url: anime.images?.jpg?.image_url || '',
                    trailer: {
                        youtube_id: anime.trailer?.youtube_id || '',
                        url: anime.trailer?.url || '',
                        embed_url: anime.trailer?.embed_url || ''
                    },
                    trailer_url: anime.trailer?.url || '',
                    url: anime.url || '',
                    mal_id: anime.mal_id,
                    approved: anime.approved || false,
                    titles: anime.titles || [],

                    // Additional computed fields for better search
                    all_genres: [
                        ...(anime.genres?.map(g => g.name) || []),
                        ...(anime.themes?.map(t => t.name) || []),
                        ...(anime.demographics?.map(d => d.name) || [])
                    ],
                    all_studios: [
                        ...(anime.studios?.map(s => s.name) || []),
                        ...(anime.producers?.map(p => p.name) || []),
                        ...(anime.licensors?.map(l => l.name) || [])
                    ],
                    search_text: [
                        anime.title,
                        anime.title_english,
                        anime.title_japanese,
                        ...(anime.title_synonyms || []),
                        ...(anime.genres?.map(g => g.name) || []),
                        ...(anime.studios?.map(s => s.name) || []),
                        anime.synopsis
                    ].filter(Boolean).join(' ').toLowerCase()
                };

                // Add to anime index using the new multi-index API
                const addResponse = await fetch(`${API_BASE}/index/anime/documents`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ documents: [animeDoc] })
                });

                if (addResponse.ok) {
                    const result = await addResponse.json();
                    successCount += result.addedCount || 1;
                    console.log(`✓ Added anime: ${anime.title} (Score: ${anime.score}) [${totalProcessed}/${allAnimeData.length}]`);
                } else {
                    const error = await addResponse.text();
                    console.error(`❌ Failed to add anime ${anime.title}:`, error);
                    errorCount++;
                }

                // Rate limiting - be nice to the Jikan API
                await new Promise(resolve => setTimeout(resolve, CONFIG.rateLimitMs));

            } catch (error) {
                console.error(`❌ Error processing anime ${anime.title}:`, error.message);
                errorCount++;
            }
        }

        console.log('\n📊 Scraping Summary:');
        console.log(`Total anime fetched: ${allAnimeData.length}`);
        console.log(`Total anime processed: ${totalProcessed}`);
        console.log(`Successfully indexed: ${successCount} anime`);
        console.log(`Errors: ${errorCount} anime`);

        // Test search functionality
        console.log('\n🔍 Testing search functionality...');

        // Test 1: Search for all anime
        const searchResponse1 = await fetch(`${API_BASE}/search/anime`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                query: { match_all: {} },
                size: 5
            })
        });

        if (searchResponse1.ok) {
            const searchResult1 = await searchResponse1.json();
            console.log(`✓ Found ${searchResult1.total} anime total`);
            console.log('Top 3 anime:');
            searchResult1.hits.slice(0, 3).forEach((hit, index) => {
                console.log(`  ${index + 1}. ${hit.name} (Score: ${hit.score}) - ${hit.type}`);
            });
        }

        // Test 2: Search for specific anime by name
        const searchResponse2 = await fetch(`${API_BASE}/search/anime`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                query: {
                    bool: {
                        must: [
                            { match: { field: 'name', value: 'Naruto' } }
                        ]
                    }
                },
                size: 5
            })
        });

        if (searchResponse2.ok) {
            const searchResult2 = await searchResponse2.json();
            console.log(`✓ Found ${searchResult2.hits.length} anime matching "Naruto"`);
            if (searchResult2.hits.length > 0) {
                console.log('Naruto search results:');
                searchResult2.hits.forEach((hit, index) => {
                    console.log(`  ${index + 1}. ${hit.name} (Score: ${hit.score})`);
                });
            }
        }

        // Test 3: Test aggregations (new aggregations API) with enhanced fields
        const aggregationsResponse = await fetch(`${API_BASE}/search/anime`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: { match_all: {} },
                size: 0, // Only need aggregations
                aggs: {
                    type_breakdown: { terms: { field: 'type', size: 10 } },
                    status_breakdown: { terms: { field: 'status', size: 10 } },
                    rating_breakdown: { terms: { field: 'rating', size: 10 } },
                    season_breakdown: { terms: { field: 'season', size: 10 } },
                    source_breakdown: { terms: { field: 'source', size: 10 } },
                    genres_breakdown: { terms: { field: 'genres', size: 20 } },
                    themes_breakdown: { terms: { field: 'themes', size: 15 } },
                    demographics_breakdown: { terms: { field: 'demographics', size: 10 } }
                }
            })
        });

        if (aggregationsResponse.ok) {
            const aggregationsResult = await aggregationsResponse.json();
            console.log('✓ New aggregations API test successful');
            if (aggregationsResult.aggregations) {
                console.log('Type breakdown:');
                aggregationsResult.aggregations.type_breakdown.buckets.forEach(bucket => {
                    console.log(`  - ${bucket.key}: ${bucket.doc_count}`);
                });
                console.log('Top genres:');
                aggregationsResult.aggregations.genres_breakdown.buckets.slice(0, 10).forEach(bucket => {
                    console.log(`  - ${bucket.key}: ${bucket.doc_count}`);
                });
                console.log('Themes:');
                aggregationsResult.aggregations.themes_breakdown.buckets.slice(0, 5).forEach(bucket => {
                    console.log(`  - ${bucket.key}: ${bucket.doc_count}`);
                });
            }
        }

        // Test 4: Legacy facets endpoint (for backward compatibility)
        const facetsResponse = await fetch(`${API_BASE}/facets/anime`);
        if (facetsResponse.ok) {
            const facets = await facetsResponse.json();
            console.log('✓ Legacy facets endpoint still works:', Object.keys(facets.facets || {}));
        }

        // Test 5: Get index stats
        const statsResponse = await fetch(`${API_BASE}/index/anime/stats`);
        if (statsResponse.ok) {
            const stats = await statsResponse.json();
            console.log('✓ Anime index stats:');
            console.log(`  - Documents: ${stats.documents}`);
            console.log(`  - Tokens: ${stats.tokens}`);
            console.log(`  - Memory usage: ${stats.memoryUsage}`);
        }

        console.log('\n🎉 Anime indexing completed successfully!');

    } catch (error) {
        console.error('❌ Failed to scrape anime data:', error.message);
        process.exit(1);
    }
}

// Run the scraper
scrapeAnimeData(); 