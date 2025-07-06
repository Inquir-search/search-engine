import express from "express";
import SearchEngine from "./src/domain/SearchEngine.js";
import Tokenizer from "./src/domain/Tokenizer.js";
import InvertedIndex from "./src/domain/InvertedIndex.js";
import BM25Scorer from "./src/domain/BM25Scorer.js";
import RankingPipeline from "./src/domain/RankingPipeline.js";
import StopwordsManager from "./src/infrastructure/StopwordsManager.js";
import SynonymEngine from "./src/domain/SynonymEngine.js";
import MappingsManager from "./src/domain/MappingsManager.js";
import SnapshotPersistence from "./src/infrastructure/SnapshotPersistence.js";
import AOFWriter from "./src/infrastructure/AOFWriter.js";

const app = express();
app.use(express.json());

// engine setup
const stopwordsManager = new StopwordsManager();
const tokenizer = new Tokenizer(stopwordsManager);
const invertedIndex = new InvertedIndex();
const mappingsManager = new MappingsManager("./mappings.json");

const scorerFactory = (totalDocs, avgdl, docLengths, index) =>
    new BM25Scorer(totalDocs, avgdl, docLengths, index, { name: 2.0 });

const rankingPipeline = new RankingPipeline([
    { type: "attribute", field: "name", weight: 2 }
]);

const persistence = new SnapshotPersistence("./snapshot.json");
const aof = new AOFWriter("./aof.log");

const engine = new SearchEngine({
    tokenizer,
    scorerFactory,
    invertedIndex,
    rankingPipeline,
    stopwordsManager,
    synonymEngine: new SynonymEngine(),
    mappingsManager,
    persistence,
    aof,
    facetFields: ["species", "gender", "status"]
});

// wait for snapshot to load
console.log("✅ Search engine loaded.");

// routes
app.get("/", (req, res) => {
    res.json({ status: "ok", message: "Search API is running" });
});

app.post("/add", (req, res) => {
    try {
        const doc = req.body;
        engine.add(doc);
        res.json({ status: "ok", id: doc.id });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.post("/search", (req, res) => {
    try {
        console.log("Search request body:", JSON.stringify(req.body, null, 2));
        // If the request has a 'query' field, use that, otherwise use the entire body as the query
        const query = req.body.query !== undefined ? req.body.query : req.body;
        console.log("Extracted query:", JSON.stringify(query, null, 2));
        const results = engine.search(query);
        console.log("Search results:", JSON.stringify(results, null, 2));
        res.json(results);
    } catch (err) {
        console.error("Search error:", err);
        res.status(400).json({ error: err.message });
    }
});

app.get("/facets", (req, res) => {
    const docIds = new Set(engine.documents.keys());
    const facets = engine.facetEngine.calculate(docIds);
    res.json(facets);
});

app.get("/debug", (req, res) => {
    const docIds = Array.from(engine.documents.keys());
    const nameTokens = Array.from(engine.invertedIndex.index.keys()).filter(t => t.startsWith("name:"));

    res.json({
        totalDocs: engine.totalDocs,
        documentsInMap: engine.documents.size,
        firstDocIds: docIds.slice(0, 10),
        nameTokensCount: nameTokens.length,
        firstNameTokens: nameTokens.slice(0, 10),
        testPosting: engine.invertedIndex.getPosting("name:test").size
    });
});

const port = 3000;
app.listen(port, () => {
    console.log(`🚀 Search API listening on http://localhost:${port}`);
});
