export default class TaskQueue<T> {
    private queue: { item: T; priority: number }[] = [];
    private waitingResolvers: Array<(value: T) => void> = [];

    constructor(private readonly capacity?: number) {}

    enqueue(task: T, priority = 0): boolean {
        if (this.capacity && this.queue.length >= this.capacity) {
            return false;
        }
        const entry = { item: task, priority };
        const index = this.queue.findIndex(e => priority > e.priority);
        if (index === -1) this.queue.push(entry); else this.queue.splice(index, 0, entry);
        this.resolveNext();
        return true;
    }

    enqueueFront(task: T): boolean {
        return this.enqueue(task, Infinity);
    }

    dequeue(): T | undefined {
        const entry = this.queue.shift();
        return entry?.item;
    }

    async dequeueAsync(): Promise<T> {
        const item = this.dequeue();
        if (item !== undefined) return item;
        return new Promise<T>(resolve => this.waitingResolvers.push(resolve));
    }

    get length(): number {
        return this.queue.length;
    }

    clear(): void {
        this.queue.length = 0;
    }

    private resolveNext(): void {
        if (this.waitingResolvers.length > 0 && this.queue.length > 0) {
            const resolver = this.waitingResolvers.shift()!;
            const value = this.dequeue()!;
            resolver(value);
        }
    }
}
