// Remove import of InvertedIndex
// For single-shard case, use this.singleIndex = new Map() where each value is a Map<docId, docInfo>
// Update addToken, getPosting, etc. to use and return Map objects

// Type definitions
export interface ShardedIndexOptions {
    numShards?: number;
    shardStrategy?: 'hash' | 'round-robin' | 'custom';
    customShardFunction?: (docId: string, numShards: number) => number;
    compressPositions?: boolean;
    positionCompressionThreshold?: number;
    compressionAlgorithm?: 'delta' | 'simple';
    enableParallelProcessing?: boolean;
    maxConcurrentShards?: number;
    shardLoadThreshold?: number;
    enableShardMonitoring?: boolean;
    monitoringInterval?: number;
}

export interface DocumentInfo {
    frequency: number;
    positions: number[];
}

export interface ShardStats {
    totalDocuments: number;
    totalTerms: number;
    shardSizes: number[];
    lastRebalance: string | null;
}

export interface ShardConfig {
    numShards: number;
    isSingleShard: boolean;
    compressPositions: boolean;
    positionCompressionThreshold: number;
    compressionAlgorithm: string;
    shardStrategy?: string;
    enableParallelProcessing?: boolean;
    maxConcurrentShards?: number;
    shardLoadThreshold?: number;
    enableShardMonitoring?: boolean;
    monitoringInterval?: number;
}

export default class ShardedInvertedIndex {
    // Core sharding properties
    private numShards: number;
    private shardStrategy: 'hash' | 'round-robin' | 'custom';
    private customShardFunction?: (docId: string, numShards: number) => number;
    private isSingleShard: boolean;

    // Index storage
    private singleIndex?: Map<string, Map<string, DocumentInfo>>;
    private shards?: Map<string, Map<string, DocumentInfo>>[];
    private shardMap!: Map<string, number>;
    private shardStats!: ShardStats;

    // Compression settings
    private compressPositions: boolean;
    private positionCompressionThreshold: number;
    private compressionAlgorithm: 'delta' | 'simple';

    // Parallel processing settings
    private enableParallelProcessing: boolean;
    private maxConcurrentShards!: number;
    private shardLoadThreshold!: number;

    // Monitoring settings
    private enableShardMonitoring: boolean;
    private monitoringInterval!: number;
    private monitoringTimer: NodeJS.Timeout | null;

    constructor(options: ShardedIndexOptions = {}) {
        // Sharding configuration
        this.numShards = options.numShards || 8;
        this.shardStrategy = options.shardStrategy || 'hash'; // 'hash', 'round-robin', 'custom'
        this.customShardFunction = options.customShardFunction; // For custom sharding strategy

        // Check if we should use single shard optimization
        this.isSingleShard = this.numShards === 1;

        if (this.isSingleShard) {
            // Single shard optimization - use regular InvertedIndex directly
            this.singleIndex = new Map();

            // Disable sharding-specific features for single shard
            this.enableShardMonitoring = false;
            this.enableParallelProcessing = false;
            this.monitoringTimer = null;

            // Compression options still apply
            this.compressPositions = options.compressPositions !== false;
            this.positionCompressionThreshold = options.positionCompressionThreshold || 100;
            this.compressionAlgorithm = options.compressionAlgorithm || 'delta';

            return; // Early return for single shard
        }

        // Multi-shard setup
        this.shards = [];
        this.shardMap = new Map(); // Maps docId to shard number
        this.shardStats = {
            totalDocuments: 0,
            totalTerms: 0,
            shardSizes: new Array(this.numShards).fill(0),
            lastRebalance: null
        };

        // Initialize shards
        for (let i = 0; i < this.numShards; i++) {
            this.shards.push(new Map());
        }

        // Set compression options
        this.compressPositions = options.compressPositions !== false;
        this.positionCompressionThreshold = options.positionCompressionThreshold || 100;
        this.compressionAlgorithm = options.compressionAlgorithm || 'delta';

        // Performance tuning settings
        this.enableParallelProcessing = options.enableParallelProcessing === true;
        this.maxConcurrentShards = options.maxConcurrentShards || 4;
        this.shardLoadThreshold = options.shardLoadThreshold || 0.8; // 80% load threshold for rebalancing

        // Advanced monitoring features
        this.enableShardMonitoring = options.enableShardMonitoring === true; // Only enable if explicitly set to true
        this.monitoringInterval = options.monitoringInterval || 60000; // 1 minute
        this.monitoringTimer = null;

        // Start monitoring if enabled
        if (this.enableShardMonitoring) {
            this._startMonitoring();
        }
    }

    /**
     * Get shard number for a document ID
     */
    _getShardForDoc(docId: string): number {
        if (!this.shardMap.has(docId)) {
            let shard: number;

            switch (this.shardStrategy) {
                case 'hash':
                    shard = this._getHashShard(docId);
                    break;
                case 'round-robin':
                    shard = this._getRoundRobinShard(docId);
                    break;
                case 'custom':
                    if (this.customShardFunction) {
                        shard = this.customShardFunction(docId, this.numShards);
                    } else {
                        shard = this._getHashShard(docId);
                    }
                    break;
                default:
                    shard = this._getHashShard(docId);
            }

            this.shardMap.set(docId, shard);
        }

        return this.shardMap.get(docId)!;
    }

    _getHashShard(docId: string): number {
        const hash = this._hashString(docId);
        return hash % this.numShards;
    }

    _getRoundRobinShard(docId: string): number {
        // Simple round-robin based on total documents
        return this.shardStats.totalDocuments % this.numShards;
    }

    /**
     * Simple hash function for string
     */
    _hashString(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash);
    }

    _getShardForToken(token: string): number {
        const hash = this._hashString(token);
        return hash % this.numShards;
    }

    addToken(token: string, docId: string, position: number): void {
        if (this.isSingleShard) {
            // Single shard optimization
            if (!this.singleIndex!.has(token)) {
                this.singleIndex!.set(token, new Map());
            }
            const docInfo = this.singleIndex!.get(token)!.get(docId);
            if (!docInfo) {
                const newDocInfo: DocumentInfo = {
                    frequency: 1,
                    positions: [position]
                };
                this.singleIndex!.get(token)!.set(docId, newDocInfo);

                // Position compression for single shard
                if (this.compressPositions && typeof position === 'number') {
                    if (newDocInfo.positions.length > this.positionCompressionThreshold) {
                        const compressed = this._compressPositions(newDocInfo.positions);
                        newDocInfo.positions = compressed;
                    }
                }
            } else {
                docInfo.frequency++;
                // Only add position if it's not a duplicate
                if (!docInfo.positions.includes(position)) {
                    docInfo.positions.push(position);
                    // Keep positions sorted for consistent ordering
                    docInfo.positions.sort((a, b) => a - b);
                }
            }
            return;
        }

        // Multi-shard logic
        const shardNum = this._getShardForDoc(docId);
        const shard = this.shards![shardNum];

        if (!shard.has(token)) {
            shard.set(token, new Map());
        }

        const docInfo = shard.get(token)!.get(docId);
        if (!docInfo) {
            const newDocInfo: DocumentInfo = {
                frequency: 1,
                positions: [position]
            };
            shard.get(token)!.set(docId, newDocInfo);

            // Position compression
            if (this.compressPositions && typeof position === 'number') {
                if (newDocInfo.positions.length > this.positionCompressionThreshold) {
                    const compressed = this._compressPositions(newDocInfo.positions);
                    newDocInfo.positions = compressed;
                }
            }
        } else {
            docInfo.frequency++;
            // Only add position if it's not a duplicate
            if (!docInfo.positions.includes(position)) {
                docInfo.positions.push(position);
                // Keep positions sorted for consistent ordering
                docInfo.positions.sort((a, b) => a - b);
            }
        }

        this._updateShardStats(shardNum);
    }

    _compressPositions(positions: number[]): number[] {
        if (positions.length <= 1) return positions;

        const deltas: number[] = [];
        deltas.push(positions[0]);

        for (let i = 1; i < positions.length; i++) {
            deltas.push(positions[i] - positions[i - 1]);
        }

        return deltas;
    }

    _decompressPositions(compressed: number[]): number[] {
        if (compressed.length <= 1) return compressed;

        const positions = [compressed[0]];

        for (let i = 1; i < compressed.length; i++) {
            positions.push(positions[i - 1] + compressed[i]);
        }

        return positions;
    }

    getPosting(token: string): Map<string, DocumentInfo> {
        if (this.isSingleShard) {
            // Single shard optimization
            return this.singleIndex!.get(token) || new Map();
        }

        // Multi-shard: collect from all shards
        // Note: tokens are distributed based on document sharding, so we need to search all shards
        const merged = new Map<string, DocumentInfo>();
        for (const shard of this.shards!) {
            const posting = shard.get(token);
            if (posting) {
                for (const [docId, docInfo] of posting) {
                    if (merged.has(docId)) {
                        // Merge document info
                        const existing = merged.get(docId)!;
                        existing.frequency += docInfo.frequency;
                        existing.positions.push(...docInfo.positions);
                    } else {
                        merged.set(docId, { ...docInfo });
                    }
                }
            }
        }
        return merged;
    }

    getPositions(token: string, docId: string): number[] {
        if (this.isSingleShard) {
            // Single shard optimization
            return this.singleIndex!.get(token)?.get(docId)?.positions || [];
        }

        const shardNum = this._getShardForDoc(docId);
        const shard = this.shards![shardNum];
        const docInfo = shard.get(token)?.get(docId);

        if (!docInfo) return [];

        // Decompress if needed
        if (this.compressPositions) {
            return this._decompressPositions(docInfo.positions);
        }

        return docInfo.positions;
    }

    termFrequency(token: string, docId: string): number {
        if (this.isSingleShard) {
            // Single shard optimization
            return this.singleIndex!.get(token)?.get(docId)?.positions?.length || 0;
        }

        const shardNum = this._getShardForDoc(docId);
        const positions = this.getPositions(token, docId);
        return positions.length;
    }

    documentFrequency(token: string): number {
        if (this.isSingleShard) {
            // Single shard optimization
            return this.singleIndex!.get(token)?.size || 0;
        }

        let totalDocs = 0;
        for (const shard of this.shards!) {
            const posting = shard.get(token);
            if (posting) {
                totalDocs += posting.size;
            }
        }
        return totalDocs;
    }

    getDocFreq(token: string): number {
        if (this.isSingleShard) {
            // Single shard optimization
            return this.singleIndex!.get(token)?.size || 0;
        }

        let totalDocs = 0;
        for (const shard of this.shards!) {
            const posting = shard.get(token);
            if (posting) {
                totalDocs += posting.size;
            }
        }
        return totalDocs;
    }

    getPostingArray(token: string): Array<{ docId: string; docInfo: DocumentInfo }> {
        if (this.isSingleShard) {
            // Single shard optimization
            return Array.from(this.singleIndex!.get(token)?.values() || []).map((docInfo, index) => {
                const docId = Array.from(this.singleIndex!.get(token)?.keys() || [])[index];
                return { docId, docInfo };
            });
        }

        const mergedArray: Array<{ docId: string; docInfo: DocumentInfo }> = [];
        for (const shard of this.shards!) {
            const posting = shard.get(token);
            if (posting) {
                for (const [docId, docInfo] of posting) {
                    mergedArray.push({ docId, docInfo: posting.get(docId)! });
                }
            }
        }
        return mergedArray;
    }

    deleteDocument(docId: string): void {
        if (this.isSingleShard) {
            // Single shard: remove from all terms
            for (const [term, posting] of this.singleIndex!.entries()) {
                if (posting.has(docId)) {
                    posting.delete(docId);
                    if (posting.size === 0) {
                        this.singleIndex!.delete(term);
                    }
                }
            }
            return;
        }

        // Multi-shard: remove from specific shard
        const shardNum = this._getShardForDoc(docId);
        const shard = this.shards![shardNum];

        for (const [term, posting] of shard.entries()) {
            if (posting.has(docId)) {
                posting.delete(docId);
                if (posting.size === 0) {
                    shard.delete(term);
                }
            }
        }

        this.shardMap.delete(docId);
    }

    clear(): void {
        if (this.isSingleShard) {
            this.singleIndex!.clear();
        } else {
            for (const shard of this.shards!) {
                shard.clear();
            }
            this.shardMap.clear();
        }

        this.shardStats = {
            totalDocuments: 0,
            totalTerms: 0,
            shardSizes: new Array(this.numShards).fill(0),
            lastRebalance: null
        };
    }

    shutdown(): void {
        // Clean up single shard
        if (this.isSingleShard) {
            if (this.singleIndex) {
                this.singleIndex.clear();
            }
            return;
        }

        // Clean up multi-shard
        if (this.shards) {
            for (const shard of this.shards) {
                shard.clear();
            }
        }

        if (this.shardMap) {
            this.shardMap.clear();
        }

        this.shardStats = {
            totalDocuments: 0,
            totalTerms: 0,
            shardSizes: new Array(this.numShards).fill(0),
            lastRebalance: null
        };

        this._stopMonitoring();
    }

    rebalance(): void {
        if (this.isSingleShard) {
            return; // No rebalancing needed for single shard
        }

        // Implementation depends on specific requirements
        // This is a placeholder for shard rebalancing logic
    }

    getConfig(): ShardConfig {
        const config: ShardConfig = {
            numShards: this.numShards,
            isSingleShard: this.isSingleShard,
            compressPositions: this.compressPositions,
            positionCompressionThreshold: this.positionCompressionThreshold,
            compressionAlgorithm: this.compressionAlgorithm
        };

        if (!this.isSingleShard) {
            config.shardStrategy = this.shardStrategy;
            config.enableParallelProcessing = this.enableParallelProcessing;
            config.maxConcurrentShards = this.maxConcurrentShards;
            config.shardLoadThreshold = this.shardLoadThreshold;
            config.enableShardMonitoring = this.enableShardMonitoring;
            config.monitoringInterval = this.monitoringInterval;
        }

        return config;
    }

    _updateShardStats(shardIndex: number, increment: number = 1): void {
        this.shardStats.shardSizes[shardIndex] += increment;
        this.shardStats.totalDocuments += increment;
    }

    _startMonitoring(): void {
        this.monitoringTimer = setInterval(() => {
            this._checkShardBalance();
        }, this.monitoringInterval);
        // Allow process to exit even if timer is active
        if (typeof this.monitoringTimer.unref === 'function') {
            this.monitoringTimer.unref();
        }
    }

    _stopMonitoring(): void {
        if (this.monitoringTimer) {
            clearInterval(this.monitoringTimer);
            this.monitoringTimer = null;
        }
    }

    _checkShardBalance(): void {
        const stats = this.getShardStats();
        const maxLoad = Math.max(...stats.shardSizes);
        const minLoad = Math.min(...stats.shardSizes);
        const avgShardSize = stats.totalTerms / this.numShards;

        // Calculate imbalance ratio
        const imbalance = maxLoad / (minLoad || 1);

        // Trigger rebalancing if imbalance is too high
        if (imbalance > 2 || maxLoad > this.shardLoadThreshold) {
            this._rebalanceShards();
        }
    }

    _rebalanceShards(): void {
        if (this.isSingleShard) return;

        // Collect all terms from all shards
        const allTerms = new Map<string, Map<string, DocumentInfo>>();

        for (let i = 0; i < this.shards!.length; i++) {
            const shard = this.shards![i];
            for (const [term, posting] of shard.entries()) {
                allTerms.set(term, posting);
            }
        }

        // Clear existing shards
        for (const shard of this.shards!) {
            shard.clear();
        }

        // Redistribute terms
        let shardIndex = 0;
        for (const [term, posting] of allTerms.entries()) {
            this.shards![shardIndex].set(term, posting);
            shardIndex = (shardIndex + 1) % this.numShards;
        }

        // Update stats
        this.shardStats.lastRebalance = new Date().toISOString();
        this._updateShardStats(0);
    }

    /**
     * Get comprehensive statistics about shard distribution
     */
    getShardStats(): any {
        if (this.isSingleShard) {
            return {
                totalShards: 1,
                activeShards: 1,
                shardSizes: [this.singleIndex!.size],
                totalTerms: this.singleIndex!.size,
                totalDocuments: this._countDocumentsInSingleShard(),
                compressionEnabled: this.compressPositions,
                compressionAlgorithm: this.compressionAlgorithm,
                averageShardSize: this.singleIndex!.size,
                maxShardSize: this.singleIndex!.size,
                minShardSize: this.singleIndex!.size,
                loadDistribution: ['100%']
            };
        }

        const stats = {
            totalShards: this.numShards,
            activeShards: 0,
            shardSizes: [] as number[],
            totalTerms: 0,
            totalDocuments: this.shardStats.totalDocuments,
            shardStrategy: this.shardStrategy,
            compressionEnabled: this.compressPositions,
            compressionAlgorithm: this.compressionAlgorithm,
            parallelProcessing: this.enableParallelProcessing,
            monitoringEnabled: this.enableShardMonitoring,
            lastRebalance: this.shardStats.lastRebalance,
            loadDistribution: [] as string[]
        };

        for (let i = 0; i < this.shards!.length; i++) {
            const shard = this.shards![i];
            const shardSize = shard.size;
            stats.shardSizes.push(shardSize);
            stats.totalTerms += shardSize;

            if (shardSize > 0) {
                stats.activeShards++;
            }
        }

        if (stats.totalTerms > 0) {
            const avgShardSize = stats.totalTerms / this.numShards;
            stats.loadDistribution = stats.shardSizes.map(size =>
                `${((size / avgShardSize) * 100).toFixed(1)}%`
            );
        }

        return stats;
    }

    _countDocumentsInSingleShard(): number {
        let totalDocs = 0;
        for (const posting of this.singleIndex!.values()) {
            totalDocs += posting.size;
        }
        return totalDocs;
    }

    /**
     * Get all unique tokens across all shards
     */
    getAllTokens(): string[] {
        if (this.isSingleShard) {
            // Single shard optimization
            return Array.from(this.singleIndex!.keys());
        }

        const uniqueTokens = new Set<string>();
        for (const shard of this.shards!) {
            for (const token of shard.keys()) {
                uniqueTokens.add(token);
            }
        }
        return Array.from(uniqueTokens);
    }

    /**
     * Backwards compatibility getter for index access
     */
    get index(): Map<string, Map<string, DocumentInfo>> | Map<string, Map<string, DocumentInfo>>[] {
        if (this.isSingleShard) {
            return this.singleIndex!;
        }

        // For multi-shard, return format depends on usage
        if (arguments.length === 0) {
            // Return all shards
            const combined = new Map<string, Map<string, DocumentInfo>>();
            if (this.shards) {
                for (const shard of this.shards) {
                    for (const [token, posting] of shard.entries()) {
                        if (combined.has(token)) {
                            // Merge postings
                            const existingPosting = combined.get(token)!;
                            for (const [docId, docInfo] of posting.entries()) {
                                if (existingPosting.has(docId)) {
                                    const existing = existingPosting.get(docId)!;
                                    existing.frequency += docInfo.frequency;
                                    existing.positions.push(...docInfo.positions);
                                } else {
                                    existingPosting.set(docId, { ...docInfo });
                                }
                            }
                        } else {
                            combined.set(token, new Map(posting));
                        }
                    }
                }
            }
            return combined;
        } else {
            // Return specific shard or combined index
            const entries: Array<[string, string, DocumentInfo]> = [];
            if (this.shards) {
                for (const shard of this.shards) {
                    for (const [token, posting] of shard.entries()) {
                        for (const [docId, docInfo] of posting.entries()) {
                            entries.push([token, docId, docInfo]);
                        }
                    }
                }
            }
        }

        return this.shards!;
    }

    /**
     * Load state from snapshot
     */
    load(snapshot: any): void {
        if (this.isSingleShard) {
            if (snapshot.singleIndex) {
                this.singleIndex = new Map();
                for (const [token, postings] of Object.entries(snapshot.singleIndex)) {
                    this.singleIndex.set(token, new Map());
                    for (const [docId, docInfo] of Object.entries(postings as any)) {
                        this.singleIndex.get(token)!.set(docId, {
                            ...docInfo as DocumentInfo,
                            positions: Array.isArray((docInfo as DocumentInfo).positions) ? (docInfo as DocumentInfo).positions : []
                        });
                    }
                }
            }
        } else {
            if (snapshot.shards && Array.isArray(snapshot.shards)) {
                this.shards = [];
                for (let i = 0; i < this.numShards; i++) {
                    this.shards.push(new Map());
                }

                for (let shardNum = 0; shardNum < snapshot.shards.length; shardNum++) {
                    const shardData = snapshot.shards[shardNum];
                    if (shardNum < this.shards.length) {
                        for (const [token, postings] of Object.entries(shardData as any)) {
                            this.shards[shardNum].set(token, new Map());
                            for (const [docId, docInfo] of Object.entries(postings as any)) {
                                this.shards[shardNum].get(token)!.set(docId, {
                                    ...docInfo as DocumentInfo,
                                    positions: Array.isArray((docInfo as DocumentInfo).positions) ? (docInfo as DocumentInfo).positions : []
                                });
                            }
                        }
                    }
                }
            }

            if (snapshot.shardMap) {
                this.shardMap = new Map(Object.entries(snapshot.shardMap));
            }

            if (snapshot.shardStats) {
                this.shardStats = {
                    totalDocuments: snapshot.shardStats.totalDocuments || 0,
                    totalTerms: snapshot.shardStats.totalTerms || 0,
                    shardSizes: Array.isArray(snapshot.shardStats.shardSizes)
                        ? snapshot.shardStats.shardSizes
                        : new Array(this.numShards).fill(0),
                    lastRebalance: snapshot.shardStats.lastRebalance || null
                };
            }
        }
    }

    /**
     * Get all document IDs for a given field and token
     */
    getDocuments(field: string, token: string): string[] {
        // The token key is already in the format "field:token" from indexing
        // so we just need to use the composite key directly
        const key = `${field}:${token}`;
        const posting = this.getPosting(key);
        return posting ? Array.from(posting.keys()) : [];
    }

    /**
     * Get all tokens for a given field
     */
    getFieldTokens(field: string): string[] {
        const prefix = `${field}:`;
        const allTokens = this.getAllTokens();
        return allTokens
            .filter(token => token.startsWith(prefix))
            .map(token => token.substring(prefix.length));
    }
}

export { ShardedInvertedIndex };