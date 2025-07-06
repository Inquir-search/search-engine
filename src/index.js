// Main entry point for the Advanced Search Engine library
import SearchEngineClass from './domain/SearchEngine.js';
import BM25ScorerClass from './domain/BM25Scorer.js';
import InvertedIndexClass from './domain/InvertedIndex.js';
import MappingsManagerClass from './domain/MappingsManager.js';
import QueryEngineClass from './domain/QueryEngine.js';
import RankingPipelineClass from './domain/RankingPipeline.js';
import TokenizerClass from './domain/Tokenizer.js';
import SynonymEngineClass from './domain/SynonymEngine.js';
import FacetEngineClass from './domain/FacetEngine.js';
import GeoEngineClass from './domain/GeoEngine.js';
import PersonalizationEngineClass from './domain/PersonalizationEngine.js';

// Infrastructure components
import StopwordsManagerClass from './infrastructure/StopwordsManager.js';
import SnapshotPersistenceClass from './infrastructure/SnapshotPersistence.js';
import AOFWriterClass from './infrastructure/AOFWriter.js';

// Re-export all classes
export const SearchEngine = SearchEngineClass;
export const BM25Scorer = BM25ScorerClass;
export const InvertedIndex = InvertedIndexClass;
export const MappingsManager = MappingsManagerClass;
export const QueryEngine = QueryEngineClass;
export const RankingPipeline = RankingPipelineClass;
export const Tokenizer = TokenizerClass;
export const SynonymEngine = SynonymEngineClass;
export const FacetEngine = FacetEngineClass;
export const GeoEngine = GeoEngineClass;
export const PersonalizationEngine = PersonalizationEngineClass;
export const StopwordsManager = StopwordsManagerClass;
export const SnapshotPersistence = SnapshotPersistenceClass;
export const AOFWriter = AOFWriterClass;

// Convenience function to create a search engine with default configuration
export function createSearchEngine(options = {}) {
    const {
        facetFields = [],
        mappings = {},
        stopwords = [],
        autoSave = true
    } = options;

    const stopwordsManager = new StopwordsManagerClass({
        get: () => stopwords,
        autoSave: false
    });

    const mappingsManager = new MappingsManagerClass(autoSave ? './mappings.json' : null);

    // Set up initial mappings if provided
    for (const [field, mapping] of Object.entries(mappings)) {
        mappingsManager.setMapping(field, mapping);
    }

    const scorerFactory = (totalDocs, avgDocLength, docLengths, invertedIndex) =>
        new BM25ScorerClass(totalDocs, avgDocLength, docLengths, invertedIndex);

    return new SearchEngineClass({
        tokenizer: new TokenizerClass(stopwordsManager),
        scorerFactory,
        invertedIndex: new InvertedIndexClass(),
        rankingPipeline: new RankingPipelineClass(),
        stopwordsManager,
        synonymEngine: new SynonymEngineClass(),
        facetFields,
        mappingsManager,
    });
}

// Default export is the main SearchEngine class
export default SearchEngineClass; 