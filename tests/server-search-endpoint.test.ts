/**
 * Test server search endpoint functionality
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import { promisify } from 'util';

describe('Server Search Endpoint Tests', () => {
    let serverProcess: any;
    const serverUrl = 'http://localhost:3000';

    beforeAll(async () => {
        // Start the server
        serverProcess = spawn('npm', ['start'], {
            stdio: 'pipe',
            shell: true
        });

        // Wait for server to start with better error handling
        let attempts = 0;
        const maxAttempts = 30; // 30 seconds total

        while (attempts < maxAttempts) {
            try {
                const response = await fetch(`${serverUrl}/`);
                if (response.ok) {
                    console.log('Server started successfully');
                    break;
                }
            } catch (error) {
                // Server not ready yet, wait and retry
            }

            await new Promise(resolve => setTimeout(resolve, 1000));
            attempts++;
        }

        if (attempts >= maxAttempts) {
            throw new Error('Server failed to start within 30 seconds');
        }

        // Add test data
        await addTestData();

        // Wait a bit for data to be processed
        await new Promise(resolve => setTimeout(resolve, 1000));
    }, 60000);

    afterAll(async () => {
        if (serverProcess) {
            serverProcess.kill();
        }
    });

    async function addTestData() {
        // Clear any existing data first
        console.log('Clearing existing data...');
        try {
            await fetch(`${serverUrl}/index/rickandmorty`, { method: 'DELETE' });
        } catch (error) {
            console.log('Error clearing data (expected if index doesn\'t exist):', error.message);
        }

        const rickDocs = [
            { id: '1', name: 'Rick Sanchez', species: 'Human', status: 'Alive', origin: 'Earth C-137', location: 'Citadel of Ricks' },
            { id: '2', name: 'Morty Smith', species: 'Human', status: 'Alive', origin: 'Earth C-137', location: 'Earth C-137' },
            { id: '3', name: 'Summer Smith', species: 'Human', status: 'Alive', origin: 'Earth C-137', location: 'Earth C-137' },
            { id: '4', name: 'Beth Smith', species: 'Human', status: 'Alive', origin: 'Earth C-137', location: 'Earth C-137' },
            { id: '5', name: 'Jerry Smith', species: 'Human', status: 'Alive', origin: 'Earth C-137', location: 'Earth C-137' }
        ];

        // Add rickandmorty data
        const rickResponse = await fetch(`${serverUrl}/index/rickandmorty/documents`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ documents: rickDocs })
        });
        const rickResult = await rickResponse.json();
        console.log('Rick documents added:', rickResult);
        expect(rickResponse.ok).toBe(true);
    }

    it('should test server health endpoint', async () => {
        try {
            const response = await fetch(`${serverUrl}/`);
            const data = await response.json();

            console.log('Health endpoint response:', data);
            expect(response.ok).toBe(true);
        } catch (error) {
            console.error('Health endpoint test failed:', error);
            throw error;
        }
    });

    it('should test server search endpoint with match_all query', async () => {
        try {
            const searchRequest = {
                query: { match_all: {} },
                size: 1
            };

            const response = await fetch(`${serverUrl}/search/rickandmorty`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(searchRequest)
            });

            const data = await response.json();

            console.log('Search endpoint response:', {
                status: response.status,
                ok: response.ok,
                data: data
            });

            expect(response.ok).toBe(true);
            expect(data).toBeDefined();
            expect(data.total).toBeGreaterThan(0);
            expect(data.hits).toBeDefined();
        } catch (error) {
            console.error('Search endpoint test failed:', error);
            throw error;
        }
    });

    it('should test server search endpoint with string query', async () => {
        try {
            const searchRequest = {
                query: { match: { field: 'name', value: 'Rick' } },
                size: 1
            };

            const response = await fetch(`${serverUrl}/search/rickandmorty`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(searchRequest)
            });

            const data = await response.json();

            console.log('String search response:', {
                status: response.status,
                ok: response.ok,
                data: data
            });

            // Debug: Check if data was added properly
            const healthResponse = await fetch(`${serverUrl}/`);
            const healthData = await healthResponse.json();
            console.log('Health check after data setup:', healthData);

            expect(response.ok).toBe(true);
            expect(data).toBeDefined();
            expect(data.total).toBeGreaterThan(0);
            expect(data.hits).toBeDefined();
        } catch (error) {
            console.error('String search test failed:', error);
            throw error;
        }
    });

    it('should test server search endpoint with wildcard query', async () => {
        try {
            const searchRequest = {
                query: { wildcard: { field: '*', value: '*' } },
                size: 1
            };

            const response = await fetch(`${serverUrl}/search/rickandmorty`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(searchRequest)
            });

            const data = await response.json();

            console.log('Wildcard search response:', {
                status: response.status,
                ok: response.ok,
                data: data
            });

            // Debug: Check if data was added properly
            const healthResponse = await fetch(`${serverUrl}/`);
            const healthData = await healthResponse.json();
            console.log('Health check after data setup:', healthData);

            expect(response.ok).toBe(true);
            expect(data).toBeDefined();
            expect(data.total).toBeGreaterThan(0);
            expect(data.hits).toBeDefined();
        } catch (error) {
            console.error('Wildcard search test failed:', error);
            throw error;
        }
    });

    it('should debug server search processing', async () => {
        try {
            // Test with a simple query to see what's happening
            const searchRequest = {
                query: { match_all: {} },
                size: 5
            };

            const response = await fetch(`${serverUrl}/search/rickandmorty`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(searchRequest)
            });

            const data = await response.json();

            console.log('Debug search response:', {
                status: response.status,
                ok: response.ok,
                data: data,
                hasHits: data.hits && Object.keys(data.hits).length > 0,
                total: data.total,
                from: data.from,
                size: data.size
            });

            // Even if search returns 0 results, we should get a valid response structure
            expect(response.ok).toBe(true);
            expect(data).toBeDefined();
            expect(typeof data.total).toBe('number');
            expect(Array.isArray(data.hits) || typeof data.hits === 'object').toBe(true);
        } catch (error) {
            console.error('Debug search test failed:', error);
            throw error;
        }
    });
});

