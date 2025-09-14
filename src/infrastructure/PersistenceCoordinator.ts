export interface SnapshotFn {
  (indexName: string): Promise<void>;
}

interface ThrottleState {
  timer: NodeJS.Timeout | null;
  pendingDocuments: number;
  lastSnapshot: number;
}

export default class PersistenceCoordinator {
  private snapshotThrottle: Map<string, ThrottleState> = new Map();

  constructor(private readonly saveSnapshot: SnapshotFn) {}

  schedule(indexName: string, documentsAdded: number): void {
    if (!this.snapshotThrottle.has(indexName)) {
      this.snapshotThrottle.set(indexName, {
        timer: null,
        pendingDocuments: 0,
        lastSnapshot: 0
      });
    }

    const throttle = this.snapshotThrottle.get(indexName)!;
    throttle.pendingDocuments += documentsAdded;

    const now = Date.now();
    const timeSinceLastSnapshot = now - throttle.lastSnapshot;
    const minInterval = 10000;
    const maxPendingDocs = 100;

    if (throttle.timer) {
      clearTimeout(throttle.timer);
    }

    let delay: number;
    if (throttle.pendingDocuments >= maxPendingDocs) {
      delay = 0;
    } else if (timeSinceLastSnapshot < minInterval) {
      delay = minInterval - timeSinceLastSnapshot;
    } else {
      delay = 5000;
    }

    throttle.timer = setTimeout(async () => {
      try {
        await this.saveSnapshot(indexName);
        throttle.lastSnapshot = Date.now();
        throttle.pendingDocuments = 0;
        throttle.timer = null;
      } catch {
        throttle.timer = null;
      }
    }, delay);
  }

  clear(): void {
    for (const throttle of this.snapshotThrottle.values()) {
      if (throttle.timer) {
        clearTimeout(throttle.timer);
      }
    }
    this.snapshotThrottle.clear();
  }
}
