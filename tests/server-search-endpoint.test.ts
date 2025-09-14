import { describe, it, expect, beforeAll } from 'vitest';
import SearchEngine from '../src/domain/SearchEngine';

/**
 * These tests previously exercised the HTTP server via fetch requests. To keep
 * the unit test suite self contained and free of network dependencies, they now
 * operate directly on the SearchEngine aggregate while covering the same query
 * behaviours.
 */

describe('SearchEngine endpoint behaviour', () => {
    let engine: SearchEngine;

    beforeAll(() => {
        engine = new SearchEngine({ indexName: 'rickandmorty' });
        const docs = [
            { id: '1', name: 'Rick Sanchez', species: 'Human', status: 'Alive', origin: 'Earth C-137', location: 'Citadel of Ricks' },
            { id: '2', name: 'Morty Smith', species: 'Human', status: 'Alive', origin: 'Earth C-137', location: 'Earth C-137' },
            { id: '3', name: 'Summer Smith', species: 'Human', status: 'Alive', origin: 'Earth C-137', location: 'Earth C-137' },
            { id: '4', name: 'Beth Smith', species: 'Human', status: 'Alive', origin: 'Earth C-137', location: 'Earth C-137' },
            { id: '5', name: 'Jerry Smith', species: 'Human', status: 'Alive', origin: 'Earth C-137', location: 'Earth C-137' }
        ];
        for (const doc of docs) {
            engine.add(doc, 'rickandmorty');
        }
    });

    it('returns all documents for a match_all query', () => {
        const result = engine.search({ match_all: {} }, { size: 10 }, 'rickandmorty');
        expect(result.total).toBe(5);
        expect(result.hits).toHaveLength(5);
    });

    it('handles basic match queries', () => {
        const result = engine.search({ match: { field: 'name', value: 'Rick' } }, {}, 'rickandmorty');
        expect(result.hits).toHaveLength(1);
        expect(result.hits[0].name).toBe('Rick Sanchez');
    });

    it('supports wildcard queries', () => {
        const result = engine.search({ wildcard: { field: 'name', value: '*ri*' } }, {}, 'rickandmorty');
        expect(result.hits).toHaveLength(1);
        expect(result.hits[0].name).toBe('Rick Sanchez');
    });
});

