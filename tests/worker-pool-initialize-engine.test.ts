import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import SharedMemoryWorkerPool from '../src/infrastructure/SharedMemoryWorkerPool';

const DATA_DIR = path.join('.', '.tmp-worker-pool');

describe('SharedMemoryWorkerPool initializeEngine', () => {
    let pool: SharedMemoryWorkerPool;

    beforeEach(async () => {
        fs.rmSync(DATA_DIR, { recursive: true, force: true });
        pool = new SharedMemoryWorkerPool({
            workerThreads: 2,
            taskTimeout: 5000,
            enablePersistence: true,
            persistenceConfig: { baseDir: DATA_DIR }
        });
        await pool.initialize();
    });

    afterEach(async () => {
        if (pool) {
            await pool.shutdown();
        }
        fs.rmSync(DATA_DIR, { recursive: true, force: true });
    });

    it('initializes metadata, workers, and persistence', async () => {
        const result = await pool.initializeEngine({
            indexName: 'init-test',
            enableShardedStorage: false,
            facetFields: ['category']
        });

        expect(result.success).toBe(true);
        expect(result.initializedWorkers).toBe(2);

        // metadata stored
        const meta = (pool as any).indexMetadata.get('init-test');
        expect(meta).toBeDefined();
        expect(meta.facetFields).toEqual(['category']);

        // persistence directories created
        const dir = path.join(DATA_DIR, 'init-test');
        expect(fs.existsSync(dir)).toBe(true);
    });
});
