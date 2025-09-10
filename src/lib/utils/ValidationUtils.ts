/**
 * Validation utilities to eliminate code duplication
 */

/**
 * Validates that a value is not null or undefined
 * @param value - The value to validate
 * @param name - The name of the parameter for error messages
 * @throws Error if value is null or undefined
 */
export function validateRequired<T>(value: T | null | undefined, name: string): asserts value is T {
    if (value === null || value === undefined) {
        throw new Error(`${name} is required`);
    }
}

/**
 * Validates that a string is not empty
 * @param value - The string to validate
 * @param name - The name of the parameter for error messages
 * @throws Error if value is empty or whitespace
 */
export function validateNonEmptyString(value: string | null | undefined, name: string): asserts value is string {
    validateRequired(value, name);
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`${name} must be a non-empty string`);
    }
}

/**
 * Validates that a value is a positive number
 * @param value - The value to validate
 * @param name - The name of the parameter for error messages
 * @throws Error if value is not a positive number
 */
export function validatePositiveNumber(value: number | null | undefined, name: string): asserts value is number {
    validateRequired(value, name);
    if (typeof value !== 'number' || value <= 0) {
        throw new Error(`${name} must be a positive number`);
    }
}

/**
 * Validates that a value is an array
 * @param value - The value to validate
 * @param name - The name of the parameter for error messages
 * @throws Error if value is not an array
 */
export function validateArray<T>(value: T[] | null | undefined, name: string): asserts value is T[] {
    validateRequired(value, name);
    if (!Array.isArray(value)) {
        throw new Error(`${name} must be an array`);
    }
}

/**
 * Validates that a value is an object
 * @param value - The value to validate
 * @param name - The name of the parameter for error messages
 * @throws Error if value is not an object
 */
export function validateObject(value: unknown, name: string): asserts value is Record<string, unknown> {
    validateRequired(value, name);
    if (typeof value !== 'object' || value === null) {
        throw new Error(`${name} must be an object`);
    }
}

/**
 * Validates that a value is a function
 * @param value - The value to validate
 * @param name - The name of the parameter for error messages
 * @throws Error if value is not a function
 */
export function validateFunction(value: unknown, name: string): asserts value is Function {
    validateRequired(value, name);
    if (typeof value !== 'function') {
        throw new Error(`${name} must be a function`);
    }
}

/**
 * Validates that a value is one of the allowed values
 * @param value - The value to validate
 * @param allowedValues - Array of allowed values
 * @param name - The name of the parameter for error messages
 * @throws Error if value is not in allowed values
 */
export function validateEnum<T>(value: T, allowedValues: readonly T[], name: string): asserts value is T {
    if (!allowedValues.includes(value)) {
        throw new Error(`${name} must be one of: ${allowedValues.join(', ')}`);
    }
}

/**
 * Validates that a value is a valid email address
 * @param value - The email to validate
 * @param name - The name of the parameter for error messages
 * @throws Error if value is not a valid email
 */
export function validateEmail(value: string | null | undefined, name: string): asserts value is string {
    validateNonEmptyString(value, name);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
        throw new Error(`${name} must be a valid email address`);
    }
}

/**
 * Validates that a value is a valid URL
 * @param value - The URL to validate
 * @param name - The name of the parameter for error messages
 * @throws Error if value is not a valid URL
 */
export function validateUrl(value: string | null | undefined, name: string): asserts value is string {
    validateNonEmptyString(value, name);
    try {
        new URL(value);
    } catch {
        throw new Error(`${name} must be a valid URL`);
    }
}

/**
 * Validates that a value is within a numeric range
 * @param value - The value to validate
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @param name - The name of the parameter for error messages
 * @throws Error if value is not within range
 */
export function validateRange(value: number, min: number, max: number, name: string): asserts value is number {
    if (value < min || value > max) {
        throw new Error(`${name} must be between ${min} and ${max}`);
    }
}

/**
 * Validates that a value has a minimum length
 * @param value - The value to validate
 * @param minLength - Minimum required length
 * @param name - The name of the parameter for error messages
 * @throws Error if value is too short
 */
export function validateMinLength(value: string, minLength: number, name: string): asserts value is string {
    validateNonEmptyString(value, name);
    if (value.length < minLength) {
        throw new Error(`${name} must be at least ${minLength} characters long`);
    }
}

/**
 * Validates that a value has a maximum length
 * @param value - The value to validate
 * @param maxLength - Maximum allowed length
 * @param name - The name of the parameter for error messages
 * @throws Error if value is too long
 */
export function validateMaxLength(value: string, maxLength: number, name: string): asserts value is string {
    validateNonEmptyString(value, name);
    if (value.length > maxLength) {
        throw new Error(`${name} must be no more than ${maxLength} characters long`);
    }
}
