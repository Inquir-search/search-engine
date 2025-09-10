/**
 * Domain Service for Field Type Detection
 * 
 * This service encapsulates the business logic for detecting field types
 * and eliminates code duplication across the domain layer.
 */

export type FieldType = 'text' | 'keyword' | 'number' | 'date' | 'boolean' | 'email' | 'url' | 'phone' | 'array' | 'object';

export interface FieldTypeDetectionResult {
    type: FieldType;
    confidence: number;
    isArray: boolean;
    nestedFields?: Record<string, FieldType>;
}

/**
 * Domain Service for Field Type Detection
 * 
 * Encapsulates business logic for:
 * - Detecting field types from values
 * - Handling nested object field types
 * - Providing confidence scores for type detection
 */
export class FieldTypeDetectionService {
    private readonly textLikeTypes = new Set(['text', 'keyword', 'email', 'url']);
    private readonly fieldAnalyzerHints: Record<string, string[]> = {
        text: ['title', 'name', 'description', 'content', 'summary', 'text', 'body'],
        keyword: ['id', 'status', 'type', 'category', 'classification'],
        url: ['url', 'website', 'link', 'href'],
        email: ['email', 'mail', 'contact'],
        phone: ['phone', 'telephone', 'mobile', 'cell']
    };

    /**
     * Detect the type of a field based on its value and name
     * @param value - The field value to analyze
     * @param fieldName - The name of the field
     * @returns Field type detection result
     */
    detectFieldType(value: any, fieldName: string): FieldTypeDetectionResult {
        if (value === null || value === undefined) {
            return { type: 'text', confidence: 0, isArray: false };
        }

        if (Array.isArray(value)) {
            if (value.length === 0) {
                return { type: 'text', confidence: 0, isArray: true };
            }

            const firstItem = value[0];
            const itemResult = this.detectFieldType(firstItem, fieldName);
            return {
                type: itemResult.type,
                confidence: itemResult.confidence,
                isArray: true,
                nestedFields: itemResult.nestedFields
            };
        }

        if (typeof value === 'object') {
            const nestedFields: Record<string, FieldType> = {};
            for (const [key, val] of Object.entries(value)) {
                if (key === 'id') continue;
                const result = this.detectFieldType(val, key);
                nestedFields[key] = result.type;
            }
            return { type: 'object', confidence: 1, isArray: false, nestedFields };
        }

        // Detect type based on value and field name
        const typeFromValue = this.detectTypeFromValue(value);
        const typeFromName = this.detectTypeFromFieldName(fieldName);

        // Use field name hint if available and confidence is high
        if (typeFromName && typeFromName !== 'text') {
            return { type: typeFromName, confidence: 0.9, isArray: false };
        }

        return { type: typeFromValue, confidence: 0.8, isArray: false };
    }

    /**
     * Detect type from field value
     * @param value - The value to analyze
     * @returns Detected field type
     */
    private detectTypeFromValue(value: any): FieldType {
        if (typeof value === 'boolean') {
            return 'boolean';
        }

        if (typeof value === 'number') {
            return 'number';
        }

        if (typeof value === 'string') {
            // Check for specific string types
            if (this.isEmail(value)) {
                return 'email';
            }
            if (this.isUrl(value)) {
                return 'url';
            }
            if (this.isPhone(value)) {
                return 'phone';
            }
            if (this.isDate(value)) {
                return 'date';
            }
            return 'text';
        }

        return 'text';
    }

    /**
     * Detect type from field name using hints
     * @param fieldName - The field name to analyze
     * @returns Detected field type or null
     */
    private detectTypeFromFieldName(fieldName: string): FieldType | null {
        const lowerFieldName = fieldName.toLowerCase();

        for (const [type, hints] of Object.entries(this.fieldAnalyzerHints)) {
            if (hints.some(hint => lowerFieldName.includes(hint))) {
                return type as FieldType;
            }
        }

        return null;
    }

    /**
     * Check if a string is an email address
     * @param value - The string to check
     * @returns True if the string is an email
     */
    private isEmail(value: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(value);
    }

    /**
     * Check if a string is a URL
     * @param value - The string to check
     * @returns True if the string is a URL
     */
    private isUrl(value: string): boolean {
        try {
            new URL(value);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Check if a string is a phone number
     * @param value - The string to check
     * @returns True if the string is a phone number
     */
    private isPhone(value: string): boolean {
        const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
        return phoneRegex.test(value.replace(/[\s\-\(\)]/g, ''));
    }

    /**
     * Check if a string is a date
     * @param value - The string to check
     * @returns True if the string is a date
     */
    private isDate(value: string): boolean {
        const date = new Date(value);
        return !isNaN(date.getTime()) && date.toISOString() !== '1970-01-01T00:00:00.000Z';
    }

    /**
     * Get the appropriate analyzer type for a field type
     * @param fieldType - The field type
     * @returns The analyzer type to use
     */
    getAnalyzerTypeForFieldType(fieldType: FieldType): string {
        switch (fieldType) {
            case 'text':
                return 'standard';
            case 'keyword':
                return 'keyword';
            case 'email':
                return 'email';
            case 'url':
                return 'url';
            case 'phone':
                return 'text';
            case 'number':
                return 'keyword';
            case 'date':
                return 'keyword';
            case 'boolean':
                return 'keyword';
            default:
                return 'standard';
        }
    }

    /**
     * Check if a field type is text-like (searchable)
     * @param fieldType - The field type to check
     * @returns True if the field type is text-like
     */
    isTextLikeType(fieldType: FieldType): boolean {
        return this.textLikeTypes.has(fieldType);
    }
}
