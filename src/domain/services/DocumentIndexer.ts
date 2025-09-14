import { AnalyzerType, ITokenizer } from '../Tokenizer.js';
import { IInvertedIndex } from '../QueryEngine.js';
import { DocumentProcessingService } from './DocumentProcessingService.js';
import { FieldTypeDetectionService } from './FieldTypeDetectionService.js';

export class DocumentIndexer {
  constructor(
    private readonly invertedIndex: IInvertedIndex,
    private readonly tokenizer: ITokenizer,
    private readonly documentProcessor: DocumentProcessingService,
    private readonly fieldTypeDetector: FieldTypeDetectionService
  ) {}

  removeDocument(id: string): void {
    if (typeof (this.invertedIndex as any).deleteDocument === 'function') {
      (this.invertedIndex as any).deleteDocument(id);
    }
  }

  indexDocument(id: string, doc: any): void {
    this.documentProcessor.iterateFieldsWithCallback(doc, (field, value, fieldName) => {
      const { type: fieldType } = this.fieldTypeDetector.detectFieldType(value, fieldName);
      if (this.fieldTypeDetector.isTextLikeType(fieldType) && typeof value === 'string') {
        let analyzer: AnalyzerType = AnalyzerType.STANDARD;
        if (fieldType === 'email') analyzer = AnalyzerType.EMAIL;
        else if (fieldType === 'url') analyzer = AnalyzerType.URL;

        let tokens = this.tokenizer.tokenize(value, analyzer) || [];

        if (field.toLowerCase().includes('phone') && /^[\d\-\+\(\)\s\.]+$/.test(value)) {
          const normalized = value.replace(/[\s\-\(\)\.]/g, '');
          if (normalized !== value) tokens.push(normalized);
        }

        if (fieldType === 'url') {
          tokens = tokens.filter(t => !/^\d+$/.test(t));
        }

        tokens.forEach((token, pos) => {
          const tokenKey = `${field}:${token}`;
          if (typeof (this.invertedIndex as any).addToken === 'function') {
            (this.invertedIndex as any).addToken(tokenKey, id, pos);
          }
        });
      }
    });
  }
}

export default DocumentIndexer;
