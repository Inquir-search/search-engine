/**
 * Error handling utilities to eliminate code duplication
 */

/**
 * Safely extracts error message from any error type
 * @param error - The error to extract message from
 * @returns String representation of the error message
 */
export function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}

/**
 * Safely extracts error message with fallback
 * @param error - The error to extract message from
 * @param fallback - Fallback message if error is not extractable
 * @returns String representation of the error message or fallback
 */
export function getErrorMessageWithFallback(error: unknown, fallback: string): string {
    if (error instanceof Error) {
        return error.message;
    }
    if (error && typeof error === 'string') {
        return error;
    }
    return fallback;
}

/**
 * Creates a standardized error object for operation results
 * @param error - The error that occurred
 * @param operation - The operation that failed
 * @returns Standardized error result object
 */
export function createErrorResult(error: unknown, operation: string): { success: false; error: string } {
    return {
        success: false,
        error: `${operation} failed: ${getErrorMessage(error)}`
    };
}

/**
 * Logs error with standardized format
 * @param message - The log message
 * @param error - The error to log
 * @param context - Optional context information
 */
export function logError(message: string, error: unknown, context?: string): void {
    const errorMsg = getErrorMessage(error);
    const contextStr = context ? ` [${context}]` : '';
    console.error(`${message}${contextStr}:`, errorMsg);
}

/**
 * Wraps async operations with standardized error handling
 * @param operation - The async operation to wrap
 * @param operationName - Name of the operation for error messages
 * @returns Promise that resolves to operation result or error result
 */
export async function withErrorHandling<T>(
    operation: () => Promise<T>,
    operationName: string
): Promise<T | { success: false; error: string }> {
    try {
        return await operation();
    } catch (error) {
        logError(`Operation failed: ${operationName}`, error);
        return createErrorResult(error, operationName);
    }
}
