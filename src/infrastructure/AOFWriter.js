import fs from "fs";

export default class AOFWriter {
    constructor(filePath = "./aof.log") {
        this.filePath = filePath;
        this.stream = fs.createWriteStream(this.filePath, { flags: "a" });
    }

    append(entry) {
        this.stream.write(JSON.stringify(entry) + "\n");
    }

    close() {
        this.stream.end();
    }
}
