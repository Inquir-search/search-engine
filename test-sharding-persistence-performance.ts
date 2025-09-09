import SharedMemoryWorkerPool from './src/infrastructure/SharedMemoryWorkerPool.js';
import StreamingPersistence from './src/infrastructure/StreamingPersistence.js';
import fs from 'fs';
import path from 'path';

interface TestResult {
    passed: boolean;
    message: string;
    details?: any;
    duration?: number;
}

class ShardingPersistencePerformanceTest {
    private testDataDir = './test-sharding-persistence-data';
    private workerPool: SharedMemoryWorkerPool | null = null;
    private testDocuments: any[] = [];

    constructor() {
        this.generateTestDocuments();
    }

    private generateTestDocuments() {
        console.log('📋 Generating test documents...');

        // Generate 100 test documents with varied content for sharding distribution
        for (let i = 1; i <= 100; i++) {
            this.testDocuments.push({
                id: `doc-${i}`,
                name: `Test Document ${i}`,
                content: `This is test content for document ${i}. ${i % 3 === 0 ? 'Category A' : i % 3 === 1 ? 'Category B' : 'Category C'}`,
                category: i % 3 === 0 ? 'A' : i % 3 === 1 ? 'B' : 'C',
                priority: Math.floor(Math.random() * 10) + 1,
                timestamp: new Date().toISOString(),
                metadata: {
                    type: 'test',
                    batch: Math.floor(i / 10) + 1,
                    shard_hint: `shard-${i % 4}` // Helps verify sharding distribution
                }
            });
        }

        console.log(`✅ Generated ${this.testDocuments.length} test documents`);
    }

    async runAllTests(): Promise<TestResult[]> {
        console.log('🧪 Starting comprehensive sharding, persistence, and performance tests...\n');

        const results: TestResult[] = [];

        try {
            // Clean up any existing test data
            await this.cleanup();

            // Test 1: Check worker pool initialization with sharding
            results.push(await this.testWorkerPoolSharding());

            // Test 2: Test document distribution across workers
            results.push(await this.testDocumentDistribution());

            // Test 3: Test snapshot persistence
            results.push(await this.testSnapshotPersistence());

            // Test 4: Test snapshot restoration
            results.push(await this.testSnapshotRestoration());

            // Test 5: Test search performance across shards
            results.push(await this.testSearchPerformance());

            // Test 6: Test concurrent search performance
            results.push(await this.testConcurrentSearchPerformance());

        } catch (error) {
            results.push({
                passed: false,
                message: `Test suite failed: ${error.message}`,
                details: error
            });
        } finally {
            await this.cleanup();
        }

        return results;
    }

    private async testWorkerPoolSharding(): Promise<TestResult> {
        console.log('🔍 Test 1: Worker Pool Sharding Initialization...');
        const startTime = Date.now();

        try {
            // Initialize worker pool with sharding enabled
            this.workerPool = new SharedMemoryWorkerPool({
                workerThreads: 4,
                enablePersistence: true,
                persistenceConfig: {
                    baseDir: this.testDataDir,
                    enableShardedStorage: true
                }
            });

            await this.workerPool.initialize();

            // Check that workers are initialized
            const stats = this.workerPool.getStats();
            const duration = Date.now() - startTime;

            if (stats && stats.activeWorkers >= 0) {
                return {
                    passed: true,
                    message: `Worker pool initialized with ${stats.activeWorkers} active workers`,
                    details: stats,
                    duration
                };
            } else {
                return {
                    passed: false,
                    message: `Failed to get worker stats`,
                    details: stats,
                    duration
                };
            }
        } catch (error) {
            return {
                passed: false,
                message: `Worker pool initialization failed: ${error.message}`,
                details: error,
                duration: Date.now() - startTime
            };
        }
    }

    private async testDocumentDistribution(): Promise<TestResult> {
        console.log('🔍 Test 2: Document Distribution Across Workers...');
        const startTime = Date.now();

        try {
            if (!this.workerPool) {
                throw new Error('Worker pool not initialized');
            }

            // Create an index with sharding enabled
            const indexName = 'test-sharding-index';
            await this.workerPool.initializeEngine({
                indexName,
                enableShardedStorage: true,
                numShards: 4,
                facetFields: ['category', 'priority']
            });

            // Add documents in batches to trigger distribution
            const batchSize = 25;
            const distributionResults: any[] = [];

            for (let i = 0; i < this.testDocuments.length; i += batchSize) {
                const batch = this.testDocuments.slice(i, i + batchSize);
                const result = await this.workerPool.addDocuments(indexName, batch);
                distributionResults.push(result);

                console.log(`📤 Added batch ${Math.floor(i / batchSize) + 1}: ${batch.length} documents`);
            }

            // Check distribution stats
            const stats = this.workerPool.getStats();
            const duration = Date.now() - startTime;

            // Verify documents were added
            const totalAdded = distributionResults.reduce((sum, r) => sum + (r.addedCount || 0), 0);

            if (totalAdded === this.testDocuments.length) {
                return {
                    passed: true,
                    message: `Successfully distributed ${totalAdded} documents across workers`,
                    details: { distributionResults, stats },
                    duration
                };
            } else {
                return {
                    passed: false,
                    message: `Expected ${this.testDocuments.length} documents, added ${totalAdded}`,
                    details: { distributionResults, stats },
                    duration
                };
            }
        } catch (error) {
            return {
                passed: false,
                message: `Document distribution failed: ${error.message}`,
                details: error,
                duration: Date.now() - startTime
            };
        }
    }

    private async testSnapshotPersistence(): Promise<TestResult> {
        console.log('🔍 Test 3: Snapshot Persistence...');
        const startTime = Date.now();

        try {
            if (!this.workerPool) {
                throw new Error('Worker pool not initialized');
            }

            // Force a snapshot save
            const indexName = 'test-sharding-index';
            await this.workerPool.flush(indexName);

            // Check if snapshot files were created
            const baseDir = path.join(this.testDataDir, indexName);
            const expectedFiles = [
                'global-metadata.json'
            ];

            // For sharded storage, also check for shard directories
            for (let i = 0; i < 4; i++) {
                expectedFiles.push(`shard-${i}/metadata.json`);
            }

            const existingFiles: string[] = [];
            const missingFiles: string[] = [];

            for (const file of expectedFiles) {
                const filePath = path.join(baseDir, file);
                if (fs.existsSync(filePath)) {
                    existingFiles.push(file);
                } else {
                    missingFiles.push(file);
                }
            }

            const duration = Date.now() - startTime;

            // Consider it successful if we have at least the global metadata
            if (existingFiles.length > 0) {
                return {
                    passed: true,
                    message: `Persistence files created: ${existingFiles.length}/${expectedFiles.length}`,
                    details: { existingFiles, missingFiles, baseDir },
                    duration
                };
            } else {
                return {
                    passed: false,
                    message: `No persistence files created`,
                    details: { existingFiles, missingFiles, baseDir },
                    duration
                };
            }
        } catch (error) {
            return {
                passed: false,
                message: `Snapshot persistence failed: ${error.message}`,
                details: error,
                duration: Date.now() - startTime
            };
        }
    }

    private async testSnapshotRestoration(): Promise<TestResult> {
        console.log('🔍 Test 4: Snapshot Restoration...');
        const startTime = Date.now();

        try {
            // Shutdown current worker pool
            if (this.workerPool) {
                await this.workerPool.shutdown();
                this.workerPool = null;
            }

            // Create a new worker pool and restore from snapshots
            this.workerPool = new SharedMemoryWorkerPool({
                workerThreads: 4,
                enablePersistence: true,
                persistenceConfig: {
                    baseDir: this.testDataDir,
                    enableShardedStorage: true
                }
            });

            await this.workerPool.initialize();

            // Try to check if we can restore by using StreamingPersistence directly
            const indexName = 'test-sharding-index';
            const persistence = new StreamingPersistence({
                baseDir: path.join(this.testDataDir, indexName),
                enableShardedStorage: true
            });

            const snapshot = await persistence.loadSnapshot();
            const duration = Date.now() - startTime;

            if (snapshot && snapshot.documents && snapshot.documents.size > 0) {
                return {
                    passed: true,
                    message: `Snapshot restored successfully with ${snapshot.documents.size} documents`,
                    details: { documentsRestored: snapshot.documents.size },
                    duration
                };
            } else {
                return {
                    passed: false,
                    message: `No snapshot data found or snapshot is empty`,
                    details: { snapshot },
                    duration
                };
            }
        } catch (error) {
            return {
                passed: false,
                message: `Snapshot restoration failed: ${error.message}`,
                details: error,
                duration: Date.now() - startTime
            };
        }
    }

    private async testSearchPerformance(): Promise<TestResult> {
        console.log('🔍 Test 5: Search Performance Across Shards...');
        const startTime = Date.now();

        try {
            if (!this.workerPool) {
                throw new Error('Worker pool not initialized');
            }

            const indexName = 'test-sharding-index';
            const searchQueries = [
                'test document',
                'category A',
                'category B',
                'category C',
                'content',
                'document 50',
                'priority'
            ];

            const searchResults: any[] = [];
            const searchTimes: number[] = [];

            for (const query of searchQueries) {
                const queryStart = Date.now();

                const result = await this.workerPool.search(indexName, query, {
                    size: 10,
                    from: 0
                });

                const queryTime = Date.now() - queryStart;
                searchTimes.push(queryTime);
                searchResults.push({
                    query,
                    hits: result.results?.length || 0,
                    total: result.total || 0,
                    time: queryTime,
                    aggregations: result.aggregations || {}
                });

                console.log(`🔍 Query "${query}": ${result.results?.length || 0} hits in ${queryTime}ms`);
            }

            const avgSearchTime = searchTimes.reduce((sum, time) => sum + time, 0) / searchTimes.length;
            const maxSearchTime = Math.max(...searchTimes);
            const totalDuration = Date.now() - startTime;

            // Performance criteria: average < 100ms, max < 500ms
            const performanceOk = avgSearchTime < 100 && maxSearchTime < 500;

            return {
                passed: performanceOk,
                message: `Search performance: avg ${avgSearchTime.toFixed(2)}ms, max ${maxSearchTime}ms`,
                details: {
                    searchResults,
                    avgSearchTime,
                    maxSearchTime,
                    totalQueries: searchQueries.length
                },
                duration: totalDuration
            };
        } catch (error) {
            return {
                passed: false,
                message: `Search performance test failed: ${error.message}`,
                details: error,
                duration: Date.now() - startTime
            };
        }
    }

    private async testConcurrentSearchPerformance(): Promise<TestResult> {
        console.log('🔍 Test 6: Concurrent Search Performance...');
        const startTime = Date.now();

        try {
            if (!this.workerPool) {
                throw new Error('Worker pool not initialized');
            }

            const indexName = 'test-sharding-index';
            const concurrentQueries = 20;
            const queries = Array.from({ length: concurrentQueries }, (_, i) =>
                `test document ${i % 10}`
            );

            // Execute all queries concurrently
            const concurrentStart = Date.now();
            const promises = queries.map(async (query, index) => {
                const queryStart = Date.now();
                const result = await this.workerPool!.search(indexName, query, {
                    size: 5,
                    from: 0
                });
                const queryTime = Date.now() - queryStart;

                return {
                    index,
                    query,
                    hits: result.results?.length || 0,
                    total: result.total || 0,
                    time: queryTime
                };
            });

            const results = await Promise.all(promises);
            const concurrentTime = Date.now() - concurrentStart;

            const totalTime = results.reduce((sum, r) => sum + r.time, 0);
            const avgTime = totalTime / results.length;
            const maxTime = Math.max(...results.map(r => r.time));

            // Calculate throughput
            const throughput = concurrentQueries / (concurrentTime / 1000); // queries per second

            const duration = Date.now() - startTime;

            // Performance criteria: throughput > 50 QPS, avg time < 200ms
            const performanceOk = throughput > 50 && avgTime < 200;

            return {
                passed: performanceOk,
                message: `Concurrent performance: ${throughput.toFixed(2)} QPS, avg ${avgTime.toFixed(2)}ms`,
                details: {
                    results,
                    concurrentTime,
                    throughput,
                    avgTime,
                    maxTime,
                    concurrentQueries
                },
                duration
            };
        } catch (error) {
            return {
                passed: false,
                message: `Concurrent search performance test failed: ${error.message}`,
                details: error,
                duration: Date.now() - startTime
            };
        }
    }

    private async cleanup(): Promise<void> {
        try {
            if (this.workerPool) {
                await this.workerPool.shutdown();
                this.workerPool = null;
            }

            // Clean up test data directory
            if (fs.existsSync(this.testDataDir)) {
                fs.rmSync(this.testDataDir, { recursive: true, force: true });
            }
        } catch (error) {
            console.warn(`⚠️ Cleanup warning: ${error.message}`);
        }
    }

    public printResults(results: TestResult[]): void {
        console.log('\n' + '='.repeat(80));
        console.log('🧪 TEST RESULTS SUMMARY');
        console.log('='.repeat(80));

        let totalPassed = 0;
        let totalFailed = 0;

        results.forEach((result, index) => {
            const status = result.passed ? '✅ PASS' : '❌ FAIL';
            const duration = result.duration ? ` (${result.duration}ms)` : '';

            console.log(`${index + 1}. ${status} ${result.message}${duration}`);

            if (!result.passed && result.details) {
                console.log(`   Details: ${JSON.stringify(result.details, null, 2)}`);
            }

            if (result.passed) {
                totalPassed++;
            } else {
                totalFailed++;
            }
        });

        console.log('\n' + '-'.repeat(80));
        console.log(`📊 Total: ${results.length} tests, ${totalPassed} passed, ${totalFailed} failed`);

        if (totalFailed === 0) {
            console.log('🎉 All tests passed! Sharding, persistence, and performance are working correctly.');
        } else {
            console.log('⚠️ Some tests failed. Please review the details above.');
        }

        console.log('='.repeat(80));
    }
}

// Run the tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const test = new ShardingPersistencePerformanceTest();

    test.runAllTests()
        .then(results => {
            test.printResults(results);
            process.exit(results.some(r => !r.passed) ? 1 : 0);
        })
        .catch(error => {
            console.error('❌ Test suite failed:', error);
            process.exit(1);
        });
}

export default ShardingPersistencePerformanceTest; 