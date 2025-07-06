export default class InvertedIndex {
    constructor() {
        this.index = new Map();
    }

    _ensurePostingArray(token, docId) {
        if (!this.index.has(token)) {
            this.index.set(token, new Map());
        }
        const posting = this.index.get(token);
        if (!posting.has(docId)) {
            posting.set(docId, []);
        }
        return posting.get(docId);
    }

    /**
     * Adds a token with its position in the document
     */
    addToken(token, docId, position) {
        if (!this.index.has(token)) {
            this.index.set(token, new Map());
        }
        const posting = this.index.get(token);
        if (!posting.has(docId)) {
            posting.set(docId, { positions: [] });
        }
        if (typeof position === 'number') {
            const arr = posting.get(docId).positions;
            if (!arr.includes(position)) {
                arr.push(position);
                arr.sort((a, b) => a - b);
            }
        }
    }

    /**
     * Returns postings for a token
     */
    getPosting(token) {
        if (!this.index.has(token)) return new Map();
        const posting = this.index.get(token);
        // Ensure all values are objects with positions arrays
        for (const [docId, docInfo] of posting.entries()) {
            if (!docInfo || !Array.isArray(docInfo.positions)) {
                posting.set(docId, { positions: [] });
            }
        }
        return posting;
    }

    getPositions(token, docId) {
        const posting = this.getPosting(token);
        const docInfo = posting.get(docId);
        return docInfo && Array.isArray(docInfo.positions) ? docInfo.positions : [];
    }

    termFrequency(token, docId) {
        const positions = this.getPositions(token, docId);
        return positions.length;
    }

    documentFrequency(token) {
        const posting = this.getPosting(token);
        return posting.size;
    }

    /**
     * Returns document frequency
     */
    getDocFreq(token) {
        return this.index.get(token)?.size || 0;
    }

    getPostingArray(token) {
        const posting = this.getPosting(token);
        const arr = [];
        for (const [docId, positions] of posting.entries()) {
            arr.push({ docId, positions: positions || [] });
        }
        return arr;
    }
}
