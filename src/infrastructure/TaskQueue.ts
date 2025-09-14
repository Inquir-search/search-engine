export default class TaskQueue<T> {
    private queue: T[] = [];

    enqueue(task: T): void {
        this.queue.push(task);
    }

    enqueueFront(task: T): void {
        this.queue.unshift(task);
    }

    dequeue(): T | undefined {
        return this.queue.shift();
    }

    get length(): number {
        return this.queue.length;
    }

    clear(): void {
        this.queue.length = 0;
    }
}
