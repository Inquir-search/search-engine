import { test, describe, beforeEach, afterEach, before, after } from 'vitest';
import { expect } from 'vitest';
import { SearchApplicationService } from '../src/application/services/SearchApplicationService';
import { InMemoryDocumentRepository } from '../src/infrastructure/repositories/InMemoryDocumentRepository';
import { DocumentId } from '../src/domain/valueObjects/DocumentId';
import { IndexName } from '../src/domain/valueObjects/IndexName';
import { QueryText } from '../src/domain/valueObjects/QueryText';
import { SearchScore } from '../src/domain/valueObjects/SearchScore';
import { FieldType } from '../src/domain/valueObjects/FieldType';
import { Document } from '../src/domain/entities/Document';
import { SynonymEngine } from '../src/domain/SynonymEngine';
import { SearchQuery } from '../src/application/queries/SearchQuery';
import { SearchRepository } from '../src/domain/repositories/SearchRepository';
import { DocumentRepository } from '../src/domain/repositories/DocumentRepository';
import { MappingsManager } from '../src/domain/MappingsManager';
import { QueryEngine } from '../src/domain/QueryEngine';
import { RankingPipeline } from '../src/domain/RankingPipeline';
import { BM25Scorer } from '../src/domain/BM25Scorer';
import { Tokenizer } from '../src/domain/Tokenizer';
import { StopwordsManager } from '../src/infrastructure/StopwordsManager';
import { ShardedInvertedIndex } from '../src/domain/ShardedInvertedIndex';

describe('DDD Implementation Tests', () => {
    let searchApplicationService: SearchApplicationService;
    let documentRepository: DocumentRepository;
    let searchRepository;
    let queryEngine;
    let mappingsManager;
    let eventBus;
    let searchService;
    let rankingPipeline;

    beforeEach(() => {
        const stopwordsManager = new StopwordsManager({ autoSave: false });
        const tokenizer = new Tokenizer(stopwordsManager);
        const invertedIndex = new ShardedInvertedIndex({ numShards: 1 });
        mappingsManager = new MappingsManager();
        const documents = new Map();
        const scorer = new BM25Scorer(0, 0, new Map(), invertedIndex);
        rankingPipeline = new RankingPipeline(scorer, tokenizer);
        queryEngine = new QueryEngine(invertedIndex, new SynonymEngine(), tokenizer, documents, mappingsManager, rankingPipeline);

        documentRepository = new InMemoryDocumentRepository();

        searchRepository = {
            search: jest.fn(),
            findByIds: jest.fn()
        };

        searchApplicationService = new SearchApplicationService(
            documentRepository,
            searchRepository,
            mappingsManager,
            queryEngine,
            rankingPipeline
        );

        searchService = searchApplicationService;
    });

    test('setup', () => {
        documentRepository = new InMemoryDocumentRepository();
        searchRepository = {
            search: jest.fn(),
            findByIds: jest.fn()
        };
        queryEngine = {
            search: jest.fn()
        };
        mappingsManager = {
            autoMap: jest.fn(),
            validateDocument: jest.fn()
        };
        eventBus = {
            publish: jest.fn()
        };

        searchService = new SearchApplicationService(
            documentRepository,
            searchRepository,
            mappingsManager,
            queryEngine,
            rankingPipeline
        );
    });

    test('should create value objects correctly', () => {
        const docId = new DocumentId('test-doc-1');
        const indexName = new IndexName('test-index');
        const queryText = new QueryText('javascript programming');
        const score = new SearchScore(1.5);
        const fieldType = FieldType.text();

        expect(docId.value).toBe('test-doc-1');
        expect(indexName.value).toBe('test-index');
        expect(queryText.value).toBe('javascript programming');
        expect(score.value).toBe(1.5);
        expect(fieldType.value).toBe('text');
    });

    test('should validate value objects', () => {
        // DocumentId validation
        expect(() => { new DocumentId(''); }).toThrow();
        expect(() => { new DocumentId(null as any); }).toThrow();

        // IndexName validation
        expect(() => { new IndexName(''); }).toThrow();
        expect(() => { new IndexName(null as any); }).toThrow();

        // SearchScore validation
        expect(() => { new SearchScore(-1); }).toThrow();
        expect(() => { new SearchScore(NaN); }).toThrow();

        // FieldType validation
        expect(() => { new FieldType('invalid_type'); }).toThrow(/Invalid field type/);
    });

    test('should create and save documents', async () => {
        const docId = new DocumentId('doc-1');
        const indexName = new IndexName('articles');
        const data = {
            id: 'doc-1',
            title: 'JavaScript Basics',
            content: 'Introduction to JavaScript programming'
        };

        const document = new Document(docId, data, indexName);
        await documentRepository.save(document);

        const retrieved = await documentRepository.findById(docId, indexName);
        expect(retrieved).toBeTruthy();
        expect(retrieved.getId().value).toBe('doc-1');
        expect(retrieved.getIndexName().value).toBe('articles');
        expect(retrieved.getData().title).toBe('JavaScript Basics');
    });

    test('should add documents through application service', async () => {
        const command = {
            document: {
                id: 'app-doc-1',
                title: 'Node.js Guide',
                content: 'Complete guide to Node.js development'
            },
            indexName: 'guides'
        };

        const result = await searchService.addDocument(command);

        expect(result.success).toBeTruthy();
        expect(result.documentId).toBe('app-doc-1');
        expect(result.indexName).toBe('guides');

        // Verify document was saved
        const docId = new DocumentId('app-doc-1');
        const indexName = new IndexName('guides');
        const saved = await documentRepository.findById(docId, indexName);
        expect(saved).toBeTruthy();
    });

    test('should create search queries', () => {
        const queryText = new QueryText('javascript tutorial');
        const indexName = new IndexName('articles');

        const searchQuery = new SearchQuery({
            queryText,
            indexName,
            from: 0,
            size: 10
        });

        expect(searchQuery.isValid()).toBeTruthy();
        expect(searchQuery.queryText.value).toBe('javascript tutorial');
        expect(searchQuery.indexName.value).toBe('articles');
        expect(searchQuery.getTermCount()).toBe(2);
    });

    test('should handle search queries with filters', () => {
        const queryText = new QueryText('programming');
        const indexName = new IndexName('articles');

        const searchQuery = new SearchQuery({
            queryText,
            indexName,
            from: 0,
            size: 10,
            filters: [{ term: { status: 'published' } }],
            aggregations: { categories: { terms: { field: 'category' } } }
        });

        expect(searchQuery.hasFilters()).toBeTruthy();
        expect(searchQuery.hasAggregations()).toBeTruthy();
        expect(searchQuery.filters.length).toBe(1);
    });

    test('should work with document repository operations', async () => {
        const indexName = new IndexName('test-docs');

        // Create multiple documents
        const docs = [];
        for (let i = 1; i <= 3; i++) {
            const docId = new DocumentId(`test-${i}`);
            const data = {
                id: `test-${i}`,
                title: `Document ${i}`,
                content: `Content for document ${i}`
            };
            const doc = new Document(docId, data, indexName);
            docs.push(doc);
            await documentRepository.save(doc);
        }

        // Test count
        const count = await documentRepository.count(indexName);
        expect(count).toBe(3);

        // Test findByIds
        const docIds = docs.map(doc => doc.getId());
        const found = await documentRepository.findByIds(docIds, indexName);
        expect(found.length).toBe(3);

        // Test exists
        const exists = await documentRepository.exists(docs[0].getId(), indexName);
        expect(exists).toBeTruthy();

        // Test delete
        const deleted = await documentRepository.deleteById(docs[0].getId(), indexName);
        expect(deleted).toBeTruthy();

        const countAfterDelete = await documentRepository.count(indexName);
        expect(countAfterDelete).toBe(2);
    });

    test('should handle document updates', async () => {
        const docId = new DocumentId('update-test');
        const indexName = new IndexName('test-updates');

        const originalData = {
            id: 'update-test',
            title: 'Original Title',
            content: 'Original content'
        };

        const document = new Document(docId, originalData, indexName);
        await documentRepository.save(document);

        // Update the document
        const updatedData = {
            id: 'update-test',
            title: 'Updated Title',
            content: 'Updated content'
        };

        document.update(updatedData);
        await documentRepository.update(document);

        // Verify update
        const retrieved = await documentRepository.findById(docId, indexName);
        expect(retrieved.getData().title).toBe('Updated Title');
        expect(retrieved.getData().content).toBe('Updated content');
        expect(retrieved.getVersion()).toBe(2); // Version should increment
    });

    test('should validate business rules', () => {
        // Document must have non-empty data object
        const docId = new DocumentId('test-doc');
        const indexName = new IndexName('test-index');
        expect(() => { new Document(docId, null as any, indexName); }).toThrow(/Document data must be an object/);
    });

    // SearchQuery must have valid pagination
    const queryText = new QueryText('test');
    const indexName = new IndexName('test');

    const invalidQuery = new SearchQuery({
        queryText,
        indexName,
        from: -1, // Invalid
        size: 10
    });

    expect(!invalidQuery.isValid()).toBeTruthy();
});

test('should create domain query objects', () => {
    const queryText = new QueryText('javascript OR node.js');
    const searchQuery = new SearchQuery({
        queryText,
        indexName: new IndexName('articles')
    });

    const domainQuery = searchQuery.toDomainQuery();
    expect(domainQuery).toBeTruthy();
    expect(domainQuery.bool || domainQuery.match || domainQuery.match_all).toBeTruthy();
});

test('should handle empty and match-all queries', () => {
    const emptyQuery = new QueryText('');
    const matchAllQuery = new QueryText('*');

    expect(emptyQuery.isEmpty()).toBeTruthy();
    expect(matchAllQuery.isMatchAll()).toBeTruthy();

    const searchQuery1 = new SearchQuery({
        queryText: emptyQuery,
        indexName: new IndexName('test')
    });

    const searchQuery2 = new SearchQuery({
        queryText: matchAllQuery,
        indexName: new IndexName('test')
    });

    expect(searchQuery1.isEmpty()).toBeTruthy();
    expect(searchQuery2.isMatchAll()).toBeTruthy();
});