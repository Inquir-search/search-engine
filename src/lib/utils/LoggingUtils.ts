/**
 * Logging utilities to standardize console output and eliminate duplication
 */

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3
}

export interface LogContext {
    component?: string;
    operation?: string;
    indexName?: string;
    documentId?: string;
    workerId?: string;
    taskId?: string | number;
    [key: string]: unknown;
}

class Logger {
    private level: LogLevel = LogLevel.INFO;
    private prefix: string = '';

    setLevel(level: LogLevel): void {
        this.level = level;
    }

    setPrefix(prefix: string): void {
        this.prefix = prefix;
    }

    private shouldLog(level: LogLevel): boolean {
        return level >= this.level;
    }

    private formatMessage(level: string, message: string, context?: LogContext): string {
        const timestamp = new Date().toISOString();
        const contextStr = context ? ` [${Object.entries(context).map(([k, v]) => `${k}=${v}`).join(', ')}]` : '';
        const prefixStr = this.prefix ? `[${this.prefix}] ` : '';
        return `${prefixStr}${timestamp} [${level}] ${message}${contextStr}`;
    }

    debug(message: string, context?: LogContext): void {
        if (this.shouldLog(LogLevel.DEBUG)) {
            console.debug(this.formatMessage('DEBUG', message, context));
        }
    }

    info(message: string, context?: LogContext): void {
        if (this.shouldLog(LogLevel.INFO)) {
            console.log(this.formatMessage('INFO', message, context));
        }
    }

    warn(message: string, context?: LogContext): void {
        if (this.shouldLog(LogLevel.WARN)) {
            console.warn(this.formatMessage('WARN', message, context));
        }
    }

    error(message: string, error?: unknown, context?: LogContext): void {
        if (this.shouldLog(LogLevel.ERROR)) {
            const errorMsg = error ? (error instanceof Error ? error.message : String(error)) : '';
            const fullMessage = errorMsg ? `${message}: ${errorMsg}` : message;
            console.error(this.formatMessage('ERROR', fullMessage, context));
        }
    }

    // Specialized logging methods for common patterns
    operationStart(operation: string, context?: LogContext): void {
        this.info(`Starting ${operation}`, { ...context, operation });
    }

    operationComplete(operation: string, duration?: number, context?: LogContext): void {
        const message = duration ? `Completed ${operation} in ${duration}ms` : `Completed ${operation}`;
        this.info(message, { ...context, operation, duration });
    }

    operationFailed(operation: string, error: unknown, context?: LogContext): void {
        this.error(`Failed ${operation}`, error, { ...context, operation });
    }

    // Search engine specific logging
    searchQuery(query: string, indexName: string, context?: LogContext): void {
        this.debug(`Search query: ${query}`, { ...context, operation: 'search', indexName, query });
    }

    searchResults(count: number, indexName: string, context?: LogContext): void {
        this.info(`Search returned ${count} results`, { ...context, operation: 'search', indexName, resultCount: count });
    }

    documentAdded(documentId: string, indexName: string, context?: LogContext): void {
        this.info(`Document added: ${documentId}`, { ...context, operation: 'addDocument', indexName, documentId });
    }

    documentDeleted(documentId: string, indexName: string, context?: LogContext): void {
        this.info(`Document deleted: ${documentId}`, { ...context, operation: 'deleteDocument', indexName, documentId });
    }

    workerTask(taskId: string | number, operation: string, workerId: string, context?: LogContext): void {
        this.debug(`Worker task: ${operation}`, { ...context, operation, workerId, taskId });
    }

    performanceMetric(metric: string, value: number, unit: string = 'ms', context?: LogContext): void {
        this.debug(`Performance: ${metric} = ${value}${unit}`, { ...context, metric, value, unit });
    }

    // Batch operations
    batchStart(operation: string, count: number, context?: LogContext): void {
        this.info(`Starting batch ${operation} for ${count} items`, { ...context, operation, batchSize: count });
    }

    batchProgress(operation: string, processed: number, total: number, context?: LogContext): void {
        const percentage = Math.round((processed / total) * 100);
        this.debug(`Batch ${operation} progress: ${processed}/${total} (${percentage}%)`, {
            ...context,
            operation,
            processed,
            total,
            percentage
        });
    }

    batchComplete(operation: string, processed: number, failed: number, context?: LogContext): void {
        this.info(`Batch ${operation} completed: ${processed} processed, ${failed} failed`, {
            ...context,
            operation,
            processed,
            failed
        });
    }
}

// Export singleton instance
export const logger = new Logger();

// Export convenience functions
export const logDebug = (message: string, context?: LogContext) => logger.debug(message, context);
export const logInfo = (message: string, context?: LogContext) => logger.info(message, context);
export const logWarn = (message: string, context?: LogContext) => logger.warn(message, context);
export const logError = (message: string, error?: unknown, context?: LogContext) => logger.error(message, error, context);

// Export specialized functions
export const logOperationStart = (operation: string, context?: LogContext) => logger.operationStart(operation, context);
export const logOperationComplete = (operation: string, duration?: number, context?: LogContext) => logger.operationComplete(operation, duration, context);
export const logOperationFailed = (operation: string, error: unknown, context?: LogContext) => logger.operationFailed(operation, error, context);

export const logSearchQuery = (query: string, indexName: string, context?: LogContext) => logger.searchQuery(query, indexName, context);
export const logSearchResults = (count: number, indexName: string, context?: LogContext) => logger.searchResults(count, indexName, context);
export const logDocumentAdded = (documentId: string, indexName: string, context?: LogContext) => logger.documentAdded(documentId, indexName, context);
export const logDocumentDeleted = (documentId: string, indexName: string, context?: LogContext) => logger.documentDeleted(documentId, indexName, context);
export const logWorkerTask = (taskId: string | number, operation: string, workerId: string, context?: LogContext) => logger.workerTask(taskId, operation, workerId, context);
export const logPerformanceMetric = (metric: string, value: number, unit?: string, context?: LogContext) => logger.performanceMetric(metric, value, unit, context);

export const logBatchStart = (operation: string, count: number, context?: LogContext) => logger.batchStart(operation, count, context);
export const logBatchProgress = (operation: string, processed: number, total: number, context?: LogContext) => logger.batchProgress(operation, processed, total, context);
export const logBatchComplete = (operation: string, processed: number, failed: number, context?: LogContext) => logger.batchComplete(operation, processed, failed, context);
