/**
 * Domain Service for Document Processing
 * 
 * This service encapsulates the business logic for processing documents
 * and eliminates code duplication across the domain layer.
 */

import { AnalyzerType } from '../Tokenizer';
import { ITokenizer } from '../Tokenizer';

export interface DocumentFieldProcessor {
    processStringField: (value: string, fieldName: string) => string[];
    processArrayField: (value: any[], fieldName: string) => string[];
    processObjectField: (value: Record<string, any>, fieldName: string, prefix?: string) => string[];
}

/**
 * Domain Service for Document Processing
 * 
 * Encapsulates business logic for:
 * - Document field iteration
 * - Text content extraction
 * - Field value matching
 * - Search pattern matching
 */
export class DocumentProcessingService {
    constructor(private readonly tokenizer?: ITokenizer) { }

    /**
     * Iterate through document fields and process them
     * @param doc - The document to iterate
     * @param processor - The processor to handle different field types
     * @param prefix - Optional prefix for nested fields
     * @returns Array of processed tokens
     */
    iterateFields(doc: Record<string, any>, processor: DocumentFieldProcessor, prefix: string = ''): string[] {
        const tokens: string[] = [];

        for (const [key, value] of Object.entries(doc)) {
            if (key === 'id' || value == null) continue;

            const fieldName = prefix ? `${prefix}.${key}` : key;

            if (typeof value === 'string') {
                tokens.push(...processor.processStringField(value, fieldName));
            } else if (Array.isArray(value)) {
                tokens.push(...processor.processArrayField(value, fieldName));
            } else if (typeof value === 'object') {
                tokens.push(...processor.processObjectField(value, fieldName, fieldName));
            }
        }

        return tokens;
    }

    /**
     * Iterate through document fields with a callback
     * @param doc - The document to iterate
     * @param callback - Function to call for each field
     * @param prefix - Optional prefix for nested fields
     */
    iterateFieldsWithCallback(doc: Record<string, any>, callback: (key: string, value: any, fieldName: string) => void, prefix: string = ''): void {
        for (const [key, value] of Object.entries(doc)) {
            if (key === 'id' || value == null) continue;

            const fieldName = prefix ? `${prefix}.${key}` : key;
            callback(key, value, fieldName);
        }
    }

    /**
     * Extract all text content from a document
     * @param doc - The document to process
     * @param analyzer - Analyzer type to use
     * @returns Array of text tokens
     */
    extractTextContent(doc: Record<string, any>, analyzer: AnalyzerType = AnalyzerType.STANDARD): string[] {
        const processor: DocumentFieldProcessor = {
            processStringField: (value: string) => {
                if (value.trim().length === 0) return [];
                return this.tokenizer ? this.tokenizer.tokenize(value, analyzer) : value.toLowerCase().split(/\s+/);
            },
            processArrayField: (value: any[]) => {
                const tokens: string[] = [];
                for (const item of value) {
                    if (typeof item === 'string' && item.trim().length > 0) {
                        tokens.push(...(this.tokenizer ? this.tokenizer.tokenize(item, analyzer) : item.toLowerCase().split(/\s+/)));
                    }
                }
                return tokens;
            },
            processObjectField: (value: Record<string, any>) => {
                return this.extractTextContent(value, analyzer);
            }
        };

        return this.iterateFields(doc, processor);
    }

    /**
     * Extract text content for search operations
     * @param doc - The document to process
     * @returns Array of processed text parts
     */
    extractSearchableText(doc: Record<string, any>): string[] {
        const textParts: string[] = [];

        this.iterateFieldsWithCallback(doc, (key, value) => {
            if (typeof value === 'string' && value.trim().length > 0) {
                textParts.push(value.trim());
            } else if (Array.isArray(value)) {
                for (const item of value) {
                    if (typeof item === 'string' && item.trim().length > 0) {
                        textParts.push(item.trim());
                    }
                }
            }
        });

        return textParts;
    }

    /**
     * Check if a document matches a field value
     * @param doc - The document to check
     * @param field - The field name to check (or '*' for all fields)
     * @param value - The value to match
     * @param fuzziness - Optional fuzziness level for matching
     * @returns True if the document matches
     */
    matchesFieldValue(doc: Record<string, any>, field: string, value: any, fuzziness: number = 0): boolean {
        if (!field || field === '*') {
            // Search across all string fields
            const searchValue = String(value).toLowerCase();
            let found = false;

            this.iterateFieldsWithCallback(doc, (key, val) => {
                if (typeof val === 'string') {
                    const fieldVal = val.toLowerCase();
                    if (fieldVal.includes(searchValue)) {
                        found = true;
                    }
                }
            });

            return found;
        } else {
            // Search specific field
            const fieldValue = doc[field];
            if (typeof fieldValue === 'string') {
                const fieldVal = fieldValue.toLowerCase();
                const searchValue = String(value).toLowerCase();
                return fieldVal.includes(searchValue);
            }
            return false;
        }
    }

    /**
     * Check if a document matches a prefix pattern
     * @param doc - The document to check
     * @param field - The field name to check (or '*' for all fields)
     * @param value - The prefix value to match
     * @param fuzziness - Optional fuzziness level for matching
     * @returns True if the document matches
     */
    matchesPrefix(doc: Record<string, any>, field: string, value: any, fuzziness: number = 0): boolean {
        if (!field || field === '*') {
            const searchValue = String(value).toLowerCase();
            let found = false;

            this.iterateFieldsWithCallback(doc, (key, val) => {
                if (typeof val === 'string') {
                    const fieldVal = val.toLowerCase();
                    if (fieldVal.startsWith(searchValue)) {
                        found = true;
                    }
                }
            });

            return found;
        } else {
            const fieldValue = doc[field];
            if (typeof fieldValue === 'string') {
                const fieldVal = fieldValue.toLowerCase();
                const searchValue = String(value).toLowerCase();
                return fieldVal.startsWith(searchValue);
            }
            return false;
        }
    }

    /**
     * Check if a document matches a wildcard pattern
     * @param doc - The document to check
     * @param field - The field name to check (or '*' for all fields)
     * @param value - The wildcard pattern to match
     * @param fuzziness - Optional fuzziness level for matching
     * @returns True if the document matches
     */
    matchesWildcard(doc: Record<string, any>, field: string, value: any, fuzziness: number = 0): boolean {
        if (!field || field === '*') {
            let found = false;

            this.iterateFieldsWithCallback(doc, (key, val) => {
                if (typeof val === 'string') {
                    if (this.testWildcard(val, value)) {
                        found = true;
                    }
                }
            });

            return found;
        } else {
            const fieldValue = doc[field];
            if (typeof fieldValue === 'string') {
                return this.testWildcard(fieldValue, value);
            }
            return false;
        }
    }

    /**
     * Test if a string matches a wildcard pattern
     * @param text - The text to test
     * @param pattern - The wildcard pattern
     * @returns True if the text matches the pattern
     */
    private testWildcard(text: string, pattern: any): boolean {
        if (typeof pattern !== 'string') return false;

        const regex = new RegExp(
            '^' + pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
            'i'
        );

        return regex.test(text);
    }
}
