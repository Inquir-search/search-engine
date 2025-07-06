import fs from "fs";

export default class SnapshotPersistence {
    constructor(snapshotFile = "./snapshot.json") {
        this.snapshotFile = snapshotFile;
    }

    saveSnapshot(state) {
        fs.writeFileSync(this.snapshotFile, JSON.stringify(state, null, 2));
    }

    loadSnapshotSync() {
        if (!fs.existsSync(this.snapshotFile)) return null;
        const data = fs.readFileSync(this.snapshotFile, "utf-8");
        return JSON.parse(data);
    }
}
