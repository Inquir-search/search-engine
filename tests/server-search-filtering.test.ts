import { describe, it, expect, beforeAll } from 'vitest';
import SearchEngine from '../src/domain/SearchEngine';

/**
 * Simplified versions of the original server filtering tests that exercised the
 * HTTP layer through fetch. These tests now target the SearchEngine directly to
 * verify index scoping and complex query evaluation without any network calls.
 */

describe('SearchEngine index filtering', () => {
    let engine: SearchEngine;

    beforeAll(() => {
        engine = new SearchEngine({ indexName: 'rickandmorty' });
        engine.ensureIndex('anime');

        const rickDocs = [
            { id: '1', name: 'Rick Sanchez', species: 'Human', status: 'Alive', origin: 'Earth C-137', location: 'Citadel of Ricks' },
            { id: '2', name: 'Morty Smith', species: 'Human', status: 'Alive', origin: 'Earth C-137', location: 'Earth C-137' },
            { id: '3', name: 'Summer Smith', species: 'Human', status: 'Alive', origin: 'Earth C-137', location: 'Earth C-137' },
            { id: '4', name: 'Beth Smith', species: 'Human', status: 'Alive', origin: 'Earth C-137', location: 'Earth C-137' },
            { id: '5', name: 'Jerry Smith', species: 'Human', status: 'Alive', origin: 'Earth C-137', location: 'Earth C-137' }
        ];

        const animeDocs = [
            { id: '1', name: 'Naruto Uzumaki', series: 'Naruto', status: 'Alive', village: 'Konoha', occupation: 'Hokage' },
            { id: '2', name: 'Goku', series: 'Dragon Ball', status: 'Alive', planet: 'Earth', occupation: 'Fighter' },
            { id: '3', name: 'Luffy', series: 'One Piece', status: 'Alive', crew: 'Straw Hat Pirates', occupation: 'Pirate' },
            { id: '4', name: 'Ichigo', series: 'Bleach', status: 'Alive', occupation: 'Soul Reaper', location: 'Karakura Town' }
        ];

        for (const doc of rickDocs) engine.add(doc, 'rickandmorty');
        for (const doc of animeDocs) engine.add(doc, 'anime');
    });

    it('filters match_all queries by index name', () => {
        const rickResult = engine.search({ match_all: {} }, {}, 'rickandmorty');
        expect(rickResult.total).toBe(5);

        const animeResult = engine.search({ match_all: {} }, {}, 'anime');
        expect(animeResult.total).toBe(4);
    });

    it('filters string queries by index name', () => {
        const rickSearch = engine.search({ match: { field: 'name', value: 'Rick' } }, {}, 'rickandmorty');
        expect(rickSearch.hits).toHaveLength(1);
        expect(rickSearch.hits[0].name).toBe('Rick Sanchez');

        const animeSearch = engine.search({ match: { field: 'name', value: 'Naruto' } }, {}, 'anime');
        expect(animeSearch.hits).toHaveLength(1);
        expect(animeSearch.hits[0].name).toBe('Naruto Uzumaki');
    });

    it('filters wildcard queries by index name', () => {
        const rickWildcard = engine.search({ wildcard: { field: 'name', value: '*' } }, {}, 'rickandmorty');
        expect(rickWildcard.total).toBe(5);

        const animeWildcard = engine.search({ wildcard: { field: 'name', value: '*' } }, {}, 'anime');
        expect(animeWildcard.total).toBe(4);
    });

    it('handles complex bool queries with proper filtering', () => {
        const complexQuery = {
            bool: {
                should: [
                    { match: { field: 'name', value: 'ri', boost: 4 } },
                    { match: { field: 'species', value: 'ri', boost: 3 } },
                    { wildcard: { field: 'name', value: '*ri*', boost: 2.5 } },
                    { wildcard: { field: 'species', value: '*ri*', boost: 2 } }
                ],
                minimum_should_match: 1
            }
        };

        const rickSearch = engine.search(complexQuery, {}, 'rickandmorty');
        expect(rickSearch.hits).toHaveLength(1);
        expect(rickSearch.hits[0].name).toBe('Rick Sanchez');

        const animeSearch = engine.search(complexQuery, {}, 'anime');
        expect(animeSearch.hits).toHaveLength(0);
    });
});

