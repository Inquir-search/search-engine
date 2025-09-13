import SearchEngine from './SearchEngine';

export class AutoPersistenceManager {
    private readonly searchEngine: SearchEngine;
    private enabled: boolean;
    private interval: number;
    private saveOnAdd: boolean;
    private saveOnShutdown: boolean;
    private batchSize: number;
    private _lastSave: number;
    private _documentsAdded: number;
    private _timer: NodeJS.Timeout | null;

    constructor(searchEngine: SearchEngine, options: any = {}) {
        this.searchEngine = searchEngine;
        this.enabled = options.enabled === true;
        this.interval = options.interval || 30000;
        this.saveOnAdd = options.saveOnAdd === true;
        this.saveOnShutdown = options.saveOnShutdown === true;
        this.batchSize = options.batchSize || 100;
        this._lastSave = Date.now();
        this._documentsAdded = 0;
        this._timer = null;

        if (this.enabled) {
            this.start();
        }
    }

    start(): void {
        if (!this.enabled || this._timer) return;
        this._timer = setInterval(async () => {
            await this.performAutoSave();
        }, this.interval);
        if (typeof this._timer.unref === 'function') {
            this._timer.unref();
        }
    }

    stop(): void {
        if (this._timer) {
            clearInterval(this._timer);
            this._timer = null;
        }
    }

    async performAutoSave(): Promise<void> {
        if (!this.enabled) return;

        const promises: Promise<void>[] = [];
        for (const indexName of this.searchEngine.listIndices()) {
            promises.push(this.searchEngine.flush(indexName).catch(error => {
                console.error(`Failed to flush index ${indexName}:`, error);
            }));
        }

        await Promise.all(promises);
        this._lastSave = Date.now();
        this._documentsAdded = 0;
    }

    checkAutoSave(): void {
        if (!this.enabled || !this.saveOnAdd) return;

        this._documentsAdded++;

        if (this._documentsAdded >= this.batchSize) {
            this.performAutoSave();
        }
    }

    get shouldSaveOnShutdown(): boolean {
        return this.enabled && this.saveOnShutdown;
    }
}