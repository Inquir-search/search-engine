import fs from "fs";
import Ajv from "ajv";

export default class MappingsManager {
    constructor(filePath = "./mappings.json") {
        this.filePath = filePath;
        this.mappings = new Map();
        this.version = 1;
        this.ajv = new Ajv({ useDefaults: true });
        this.ajv.addFormat('date', {
            type: 'string',
            validate: (dateString) => !isNaN(Date.parse(dateString)),
        });
        this.validator = null;

        if (this.filePath) {
            this.load();
        }
    }

    load() {
        if (this.filePath && fs.existsSync(this.filePath)) {
            const data = JSON.parse(fs.readFileSync(this.filePath, "utf-8"));
            this.mappings = new Map(Object.entries(data.properties || {}));
            this.version = data.version || 1;
            this._compileValidator();
        } else {
            console.log(`No mappings found, starting empty`);
        }
    }

    save() {
        if (!this.filePath) return;
        const data = {
            version: this.version,
            properties: Object.fromEntries(this.mappings),
        };
        fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
    }

    addField(fieldName, fieldType = "text") {
        if (this.mappings.has(fieldName)) {
            console.log(`Field ${fieldName} already exists in mappings`);
            return;
        }
        this.mappings.set(fieldName, { type: fieldType });
        this.version++;
        this.save();
        this._invalidateValidator();
    }

    getFieldType(field) {
        const mapping = this.mappings.get(field);
        return mapping ? mapping.type : 'text';
    }

    getTextFields() {
        return Array.from(this.mappings.entries())
            .filter(([, mapping]) => ['text', 'keyword', 'email', 'url', 'phone'].includes(mapping.type))
            .map(([field]) => field);
    }

    _compileValidator() {
        const schemaProps = {
            id: { type: "string" },
        };

        for (const [field, def] of Object.entries(this.mappings)) {
            switch (def.type) {
                case "text":
                case "keyword":
                case "email":
                case "url":
                case "phone":
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

    validate(doc) {
        if (!this.validator) {
            this._compileValidator();
        }
        const valid = this.validator(doc);
        if (!valid) {
            throw new Error(`Validation failed: ${JSON.stringify(this.validator.errors)}`);
        }
    }

    autoExtend(doc) {
        for (const [k, v] of Object.entries(doc)) {
            if (k === "id") continue;
            if (!this.mappings.has(k)) {
                let type = "text";
                if (typeof v === "number") type = "float";
                if (typeof v === "boolean") type = "boolean";
                if (Array.isArray(v) && v.length === 2 && v.every(n => typeof n === "number"))
                    type = "geo_point";
                if (typeof v === "string") {
                    // Detect email addresses
                    if (/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$/.test(v)) {
                        type = "email";
                    }
                    // Detect URLs
                    else if (/^https?:\/\/.+/.test(v)) {
                        type = "url";
                    }
                    // Detect phone numbers
                    else if (/^[\+]?[1-9][\d]{0,15}$/.test(v.replace(/[\s\-\(\)\.]/g, ''))) {
                        type = "phone";
                    }
                }
                this.addField(k, type);
                // console.log(`Mappings auto-extended: ${k} -> ${type}`);
            }
        }
    }

    // Additional methods for tests
    validateField(fieldName, value, fieldType) {
        switch (fieldType) {
            case 'text':
                return typeof value === 'string';
            case 'email':
                return typeof value === 'string' && /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$/.test(value);
            case 'url':
                return typeof value === 'string' && /^https?:\/\/.+/.test(value);
            case 'phone':
                return typeof value === 'string' && /^[\+]?[1-9][\d]{0,15}$/.test(value.replace(/[\s\-\(\)\.]/g, ''));
            case 'number':
                return typeof value === 'number';
            case 'boolean':
                return typeof value === 'boolean';
            case 'geo_point':
                return typeof value === 'object' && value !== null &&
                    typeof value.lat === 'number' && typeof value.lon === 'number' &&
                    value.lat >= -90 && value.lat <= 90 &&
                    value.lon >= -180 && value.lon <= 180;
            default:
                return true;
        }
    }

    getMapping(fieldName) {
        if (fieldName == null) return { type: 'text' };
        if (this.mappings.has(fieldName)) return this.mappings.get(fieldName);
        // Handle nested fields
        if (typeof fieldName === 'string' && fieldName.includes('.')) {
            return { type: 'text' };
        }
        return undefined;
    }

    setMapping(fieldName, mapping) {
        if (fieldName == null) return;
        if (mapping == null) {
            this.mappings.delete(fieldName);
            this._invalidateValidator();
            return;
        }
        this.mappings.set(fieldName, mapping);
        this.version++;
        this._invalidateValidator();
    }

    _invalidateValidator() {
        // Mark validator as invalid instead of recompiling immediately
        this.validator = null;
    }

    autoMap(document) {
        const autoMapRecursive = (doc, prefix = '') => {
            for (const [key, value] of Object.entries(doc)) {
                if (key === 'id' && prefix === '') continue;

                const fieldName = prefix ? `${prefix}.${key}` : key;
                const type = this.detectFieldType(value);

                if (type === 'geo_point') {
                    if (!this.mappings.has(fieldName)) {
                        this.addField(fieldName, type);
                    }
                }
                else if (typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)) {
                    // It's a nested object, recurse
                    autoMapRecursive(value, fieldName);
                } else {
                    if (!this.mappings.has(fieldName)) {
                        this.addField(fieldName, type);
                    }
                }
            }
        }
        autoMapRecursive(document);
    }

    detectFieldType(value) {
        if (value === null || value === undefined) return 'text';
        if (typeof value === 'string') {
            if (/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$/.test(value)) return 'email';
            if (/^https?:\/\/.+/.test(value)) return 'url';
            if (/^[\+]?[1-9][\d]{0,15}$/.test(value.replace(/[\s\-\(\)\.]/g, ''))) return 'phone';
            // ISO date string
            if (!isNaN(Date.parse(value))) return 'date';
            return 'text';
        }
        if (typeof value === 'number') return 'number';
        if (typeof value === 'boolean') return 'boolean';
        if (Array.isArray(value)) {
            if (value.length === 2 && value.every(n => typeof n === 'number')) return 'geo_point';
            return value.length > 0 ? this.detectFieldType(value[0]) : 'text';
        }
        if (value instanceof Date) return 'date';
        if (typeof value === 'object' && value !== null) {
            if (value.lat !== undefined && value.lon !== undefined) return 'geo_point';
            return 'object';
        }
        return 'text';
    }
}
