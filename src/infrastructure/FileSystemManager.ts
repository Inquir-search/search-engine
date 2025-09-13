import fs from 'fs';
import { createWriteStream, createReadStream, WriteStream, ReadStream } from 'fs';
import { pipeline } from 'stream/promises';
import path from 'path';

export class FileSystemManager {
    ensureDirectoryExists(dirPath: string): void {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    }

    createWriteStream(filePath: string): WriteStream {
        return createWriteStream(filePath, { flags: 'a' });
    }

    createReadStream(filePath: string): ReadStream {
        return createReadStream(filePath);
    }

    async closeStream(stream: WriteStream | ReadStream): Promise<void> {
        if (stream instanceof WriteStream) {
            return new Promise((resolve) => {
                stream.end(() => resolve());
            });
        }
        stream.destroy();
    }

    readFileSync(filePath: string): string {
        return fs.readFileSync(filePath, 'utf-8');
    }

    writeFileSync(filePath: string, data: string): void {
        fs.writeFileSync(filePath, data);
    }

    readdirSync(dirPath: string): string[] {
        return fs.readdirSync(dirPath);
    }

    pathExists(filePath: string): boolean {
        return fs.existsSync(filePath);
    }

    getDirectories(dirPath: string): string[] {
        if (!this.pathExists(dirPath)) {
            return [];
        }
        return fs.readdirSync(dirPath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
    }
}