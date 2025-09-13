import fs from "fs";
import Ajv, { ValidateFunction } from "ajv";
import { FieldName, FieldType } from './valueObjects/index.js';

/**
 * Field Mapping Definition
 */
export interface FieldMapping {
    type: string;
    analyzer?: string;
    index?: boolean;
    store?: boolean;
    boost?: number;
    [key: string]: any;
}

/**
 * Mappings Data Structure
 */
export interface MappingsData {
    version: number;
    properties: Record<string, FieldMapping>;
}

/**
 * Validation Error
 */
export interface ValidationError {
    field: string;
    message: string;
    value?: any;
}

/**
 * MappingsManager Interface
 */
export interface IMappingsManager {
    load(): void;
    save(): void;
    addField(fieldName: FieldName, type: FieldType): void;
    getFieldType(field: FieldName): string | undefined;
    validate(doc: Record<string, any>): void;
    autoMap(document: Record<string, any>): void;
}

/**
 * MappingsManager Domain Service
 * Manages field mappings and document validation
 */
export default class MappingsManager implements IMappingsManager {
    private readonly filePath: string;
    private mappings: Map<string, FieldMapping>;
    private version: number;
    private readonly ajv: Ajv;
    private validator: ValidateFunction | null;

    // Auto-mapping configuration
    public autoMapEnabled: boolean = true;  // Enable automatic field mapping by default
    public autoExtendEnabled: boolean = true;  // Enable automatic field extension by default

    constructor(filePath: string | { filePath: string } = "./mappings.json") {
        // Handle both string and object formats for backward compatibility
        if (typeof filePath === 'object' && filePath !== null) {
            this.filePath = filePath.filePath || "./mappings.json";
        } else {
            this.filePath = filePath;
        }

        this.mappings = new Map();
        this.version = 1;
        this.ajv = new Ajv({ useDefaults: true });
        this.ajv.addFormat('date', {
            type: 'string',
            validate: (dateString: string) => !isNaN(Date.parse(dateString)),
        });
        this.validator = null;

        if (this.filePath) {
            this.load();
        }
    }

    /**
     * Load mappings from file
     */
    load(): void {
        if (this.filePath && fs.existsSync(this.filePath)) {
            try {
                const data = JSON.parse(fs.readFileSync(this.filePath, "utf-8")) as MappingsData;
                this.mappings = new Map(Object.entries(data.properties || {}));
                this.version = data.version || 1;
                this._compileValidator();
            } catch (error) {
                console.error(`Error loading mappings from ${this.filePath}:`, error);
                // Continue with empty mappings
            }
        }
    }

    /**
     * Save mappings to file
     */
    save(): void {
        if (!this.filePath) return;

        try {
            const data: MappingsData = {
                version: this.version,
                properties: Object.fromEntries(this.mappings),
            };
            fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error(`Error saving mappings to ${this.filePath}:`, error);
            throw new Error(`Failed to save mappings: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Add a field mapping
     * @param fieldName - The field name
     * @param type - The field type
     */
    addField(fieldName: FieldName, type: FieldType): void {
        // Only add mapping if type is explicitly provided
        if (!fieldName || !type) {
            return;
        }

        this.mappings.set(fieldName.value, { type: type.value });
        this._invalidateValidator();
    }

    /**
     * Get field type for a field
     * @param field - The field name
     * @returns Field type or undefined
     */
    getFieldType(field: FieldName | string): string | undefined {
        if (!field) return undefined;

        const fieldName = typeof field === 'string' ? field : field.value;
        const mapping = this.mappings.get(fieldName);
        return mapping?.type;
    }

    /**
     * Get all text fields
     * @returns Array of text field names
     */
    getTextFields(): string[] {
        const textFields: string[] = [];
        const searchableTypes = new Set(['text', 'keyword', 'email', 'url']);
        for (const [fieldName, mapping] of this.mappings) {
            if (searchableTypes.has(mapping.type)) {
                textFields.push(fieldName);
            }
        }
        return textFields;
    }

    /**
     * Compile validator from current mappings
     */
    private _compileValidator(): void {
        const schemaProps: Record<string, any> = {
            id: { type: "string" },
        };

        for (const [field, def] of this.mappings) {
            switch (def.type) {
                case "text":
                case "keyword":
                case "email":
                case "url":
                    schemaProps[field] = { type: "string" };
                    break;
                case "geo_point":
                    schemaProps[field] = {
                        type: "array",
                        items: { type: "number" },
                        minItems: 2,
                        maxItems: 2,
                    };
                    break;
                case "boolean":
                    schemaProps[field] = { type: "boolean" };
                    break;
                case "date":
                    schemaProps[field] = { type: "string", format: "date" };
                    break;
                default:
                    if (
                        ["float", "integer", "double", "long", "short", "byte"].includes(def.type)
                    ) {
                        schemaProps[field] = { type: "number" };
                    } else {
                        schemaProps[field] = { type: "string" };
                    }
            }
        }

        this.validator = this.ajv.compile({
            type: "object",
            properties: schemaProps,
            required: ["id"],
            additionalProperties: true,
        });
    }

    /**
     * Validate a document against the mappings
     * @param doc - Document to validate
     * @throws Error if validation fails
     */
    validate(doc: Record<string, any>): void {
        if (!this.validator) {
            this._compileValidator();
        }

        const valid = this.validator!(doc);
        if (!valid) {
            throw new Error(`Validation failed: ${JSON.stringify(this.validator!.errors)}`);
        }
    }

    /**
     * Auto-extend mappings based on document
     * @param doc - Document to analyze
     */
    autoExtend(doc: Record<string, any>): void {
        // Use autoMap for backward compatibility - it handles nested objects
        this.autoMap(doc);
    }

    /**
     * Validate a specific field value
     * @param fieldName - The field name
     * @param value - The value to validate
     * @param fieldType - The expected field type
     * @returns True if valid
     */
    validateField(fieldName: string, value: any, fieldType: string): boolean {
        switch (fieldType) {
            case 'text':
                return typeof value === 'string';
            case 'email':
                return typeof value === 'string' && /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$/.test(value);
            case 'url':
                return typeof value === 'string' && /^https?:\/\/.+/.test(value);
            case 'phone':
                return typeof value === 'string' && /^[\+]?[1-9][\d]{0,15}$/.test(value.replace(/[\s\-\(\)\.]/g, ''));
            case 'date':
                return typeof value === 'string' && !isNaN(Date.parse(value));
            case 'boolean':
                return typeof value === 'boolean';
            case 'geo_point':
                // Accept both array format [lat, lon] and object format {lat, lon}
                if (Array.isArray(value)) {
                    return value.length === 2 &&
                        typeof value[0] === 'number' && typeof value[1] === 'number' &&
                        value[0] >= -90 && value[0] <= 90 &&
                        value[1] >= -180 && value[1] <= 180;
                }
                if (typeof value === 'object' && value !== null) {
                    return typeof value.lat === 'number' && typeof value.lon === 'number' &&
                        value.lat >= -90 && value.lat <= 90 &&
                        value.lon >= -180 && value.lon <= 180;
                }
                return false;
            case 'integer':
            case 'float':
            case 'double':
            case 'long':
            case 'short':
            case 'byte':
            case 'number':
                return typeof value === 'number';
            default:
                return true; // Unknown types are assumed valid
        }
    }

    /**
     * Get mapping for a field
     * @param fieldName - The field name
     * @returns Field mapping or undefined
     */
    getMapping(fieldName: string | null | undefined): FieldMapping | undefined {
        if (fieldName == null) return { type: 'text' };
        return this.mappings.get(fieldName);
    }

    /**
     * Set mapping for a field
     * @param fieldName - The field name
     * @param mapping - The field mapping
     */
    setMapping(fieldName: string, mapping: FieldMapping): void {
        this.mappings.set(fieldName, mapping);
        this._invalidateValidator();
    }

    /**
     * Invalidate the compiled validator
     */
    private _invalidateValidator(): void {
        this.validator = null;
    }

    /**
     * Auto-map document fields
     * @param document - Document to analyze
     */
    autoMap(document: Record<string, any>): void {
        const autoMapRecursive = (doc: Record<string, any>, prefix: string = ''): void => {
            for (const [key, value] of Object.entries(doc)) {
                if (key === 'id' && prefix === '') continue;
                const fieldName = prefix ? `${prefix}.${key}` : key;
                const type = this.detectFieldType(value, fieldName);

                if (type === undefined) continue;

                if (Array.isArray(value)) {
                    if (value.length === 0) continue;
                    if (typeof value[0] === 'object' && value[0] !== null) {
                        if (!this.mappings.has(fieldName)) {
                            this.addField(new FieldName(fieldName), new FieldType('object'));
                        }
                        for (const item of value) {
                            autoMapRecursive.call(this, item, fieldName);
                        }
                        continue;
                    }
                    if (value.length === 2 && value.every(n => typeof n === 'number')) {
                        if (!this.mappings.has(fieldName)) {
                            this.addField(new FieldName(fieldName), new FieldType('geo_point'));
                        }
                        continue;
                    }
                    if (!this.mappings.has(fieldName)) {
                        const detectedType = this.detectFieldType(value[0], fieldName);
                        if (detectedType) {
                            this.addField(new FieldName(fieldName), new FieldType(detectedType));
                        }
                    }
                    continue;
                }

                if (typeof value === 'object' && value !== null) {
                    if (value.lat !== undefined && value.lon !== undefined) {
                        if (!this.mappings.has(fieldName)) {
                            this.addField(new FieldName(fieldName), new FieldType('geo_point'));
                        }
                        continue;
                    }
                    autoMapRecursive.call(this, value, fieldName);
                    continue;
                }

                if (!this.mappings.has(fieldName)) {
                    this.addField(new FieldName(fieldName), new FieldType(type));
                }
            }
        };

        autoMapRecursive(document);
    }

    /**
     * Detect field type from value
     * Iteratively checks each type and falls back appropriately
     * @param value - Value to analyze
     * @param fieldName - Optional field name for context-aware detection
     * @returns Detected field type or undefined
     */
    detectFieldType(value: any, fieldName?: string): string | undefined {
        if (value === null || value === undefined) {
            return undefined;
        }

        // Step 1: Check for string types
        if (typeof value === 'string') {
            // Use the iterative detectKeywordOrText method for all string detection
            return this.detectKeywordOrText(value, fieldName);
        }

        // Step 2: Check for number types
        if (typeof value === 'number') {
            return 'number';
        }

        // Step 3: Check for boolean types
        if (typeof value === 'boolean') {
            return 'boolean';
        }

        // Step 4: Check for Date objects
        if (value instanceof Date) {
            return 'date';
        }

        // Step 5: Check for arrays
        if (Array.isArray(value)) {
            if (value.length === 0) {
                return undefined; // No mapping for empty arrays
            }

            // Check for geo_point arrays (2 numbers)
            if (value.length === 2 && value.every(n => typeof n === 'number')) {
                return 'geo_point';
            }

            // Check for object arrays
            if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null && !Array.isArray(value[0])) {
                return 'object';
            }

            // For arrays of primitives, use the type of the first element
            if (value.length > 0 && (typeof value[0] === 'string' || typeof value[0] === 'number' || typeof value[0] === 'boolean')) {
                // Note: fieldName is not available in this context, so pass undefined
                const type = this.detectFieldType(value[0]);
                return type;
            }

            return undefined;
        }

        // Step 6: Check for objects
        if (typeof value === 'object' && value !== null) {
            // Check for empty objects
            if (Object.keys(value).length === 0 && value.constructor === Object) {
                return undefined; // No mapping for empty objects
            }

            // Check for geo_point objects
            if (value.lat !== undefined && value.lon !== undefined) {
                return 'geo_point';
            }

            return 'object';
        }

        // Step 7: Fallback - no type detected
        return undefined;
    }

    /**
     * Detect if a string should be keyword or text
     * Iteratively checks each type and falls back appropriately
     * @param value - String value to analyze
     * @param fieldName - Optional field name for context-aware detection
     * @returns Field type (keyword, email, url, phone, number, date, or text)
     */
    detectKeywordOrText(value: string, fieldName?: string): string {
        // Step 1: Check if it's an email
        if (/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$/.test(value)) {
            return 'email';
        }

        // Step 2: Check if it's a URL
        if (/^https?:\/\/.+/.test(value)) {
            return 'url';
        }

        // Step 3: Check if it's a date (ISO date string) - check this before phone to avoid conflicts
        if (/^\d{4}-\d{2}-\d{2}$/.test(value) || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
            return 'date';
        }

        // Step 5: Check if it's a number
        if (!isNaN(Number(value)) && value.trim() !== '') {
            return 'number';
        }

        // Step 6: Check field name semantics - descriptive fields should be text
        if (fieldName) {
            const lowerFieldName = fieldName.toLowerCase();
            const textFieldPatterns = [
                'name', 'title', 'description', 'content', 'text', 'summary',
                'city', 'country', 'address', 'street', 'location',
                'comment', 'note', 'message', 'subject', 'body',
                'caption', 'label', 'tag', 'category'
            ];

            for (const pattern of textFieldPatterns) {
                if (lowerFieldName.includes(pattern)) {
                    return 'text';
                }
            }
        }

        // Step 7: Check if it's a very long string that should be treated as full-text
        if (value.length > 100) {
            return 'text';
        }

        // Step 8: Check if it contains multiple words (spaces)
        if (value.includes(' ') && value.trim().split(/\s+/).length > 1) {
            // Multi-word strings are more likely to be descriptive text
            return 'text';
        }

        // Step 9: Default to 'keyword' for single words and identifiers
        return 'keyword';
    }

    /**
     * Detect special string types based on field name
     * @param fieldName - The field name
     * @param value - The value
     * @returns Detected field type or undefined
     */
    detectSpecialStringType(fieldName: string, value: string): string | undefined {
        const lowerFieldName = fieldName.toLowerCase();

        // Email detection
        if (lowerFieldName.includes('email') || lowerFieldName.includes('mail')) {
            return 'email';
        }

        // URL detection
        if (lowerFieldName.includes('url') || lowerFieldName.includes('website') || lowerFieldName.includes('link')) {
            return 'url';
        }

        return undefined;
    }

    /**
     * Get all mappings
     * @returns Map of all field mappings
     */
    getAllMappings(): Map<string, FieldMapping> {
        return new Map(this.mappings);
    }

    /**
     * Get version
     * @returns Current version
     */
    getVersion(): number {
        return this.version;
    }

    /**
     * Clear all mappings
     */
    clear(): void {
        this.mappings.clear();
        this._invalidateValidator();
    }

    /**
     * Get statistics
     * @returns Statistics about mappings
     */
    getStats(): { totalFields: number; fieldTypes: Record<string, number>; version: number } {
        const fieldTypes: Record<string, number> = {};

        for (const mapping of this.mappings.values()) {
            fieldTypes[mapping.type] = (fieldTypes[mapping.type] || 0) + 1;
        }

        return {
            totalFields: this.mappings.size,
            fieldTypes,
            version: this.version
        };
    }
}

export { MappingsManager };