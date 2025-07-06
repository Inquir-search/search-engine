export default class BM25Scorer {
    constructor(totalDocs, avgDocLength, docLengths, index, { k1 = 1.2, b = 0.75, fieldBoosts = {} } = {}) {
        this.totalDocs = totalDocs;
        this.avgDocLength = avgDocLength;
        this.docLengths = docLengths;
        this.index = index;
        this.k1 = k1;
        this.b = b;
        this.fieldBoosts = fieldBoosts;
    }

    score(token, docId, tf) {
        if (!this.docLengths.has(docId)) {
            return 0;
        }

        const df = this.index.getDocFreq(token);
        if (df === 0) {
            return 0;
        }

        const idf = Math.log((this.totalDocs - df + 0.5) / (df + 0.5) + 1);
        const dl = this.docLengths.get(docId) || 0;
        if (dl < 0) {
            return 0;
        }
        const avgdl = this.avgDocLength || 1;

        const field = token.split(":")[0];
        const boost = this.fieldBoosts[field] || 1.0;

        return boost * idf * ((tf * (this.k1 + 1)) / (tf + this.k1 * (1 - this.b + this.b * (dl / avgdl))));
    }
}
