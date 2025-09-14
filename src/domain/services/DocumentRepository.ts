import { DocumentId } from '../valueObjects/DocumentId.js';
import { IMappingsManager } from '../MappingsManager.js';

export interface SaveResult {
  id: string;
  replaced?: any;
}

export class DocumentRepository {
  private seqCounter = 0;
  private readonly seqMap: Map<string, number> = new Map();

  constructor(private readonly documents: Map<string, any>, private readonly mappingsManager: IMappingsManager) {}

  exists(id: string): boolean {
    return this.documents.has(id);
  }

  get(id: string): any {
    return this.documents.get(id);
  }

  getSequence(id: string): number {
    return this.seqMap.get(id) || 0;
  }

  /**
   * Save a document and return metadata about the operation
   */
  save(doc: any): SaveResult {
    if (!doc || !doc.id) {
      throw new Error('Document must have an id');
    }
    const id = doc.id instanceof DocumentId ? doc.id.value : doc.id;

    let replaced;
    if (this.documents.has(id)) {
      replaced = this.documents.get(id);
    }

    if (this.mappingsManager) {
      if (typeof (this.mappingsManager as any).autoMap === 'function') {
        (this.mappingsManager as any).autoMap(doc);
      } else if (typeof (this.mappingsManager as any).autoExtend === 'function') {
        (this.mappingsManager as any).autoExtend(doc);
      }
    }

    this.documents.set(id, doc);
    this.seqCounter += 1;
    this.seqMap.set(id, this.seqCounter);

    return { id, replaced };
  }

  remove(id: string): void {
    this.documents.delete(id);
    this.seqMap.delete(id);
  }

  clear(): void {
    this.documents.clear();
    this.seqMap.clear();
    this.seqCounter = 0;
  }
}

export default DocumentRepository;
