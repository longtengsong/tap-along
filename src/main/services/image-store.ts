import { createReadStream, type Stats, type ReadStream } from 'node:fs';
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

const isMissingFile = (error: unknown) =>
  (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';

export class ImageStore {
  private readonly directory: string;

  constructor(directory: string) {
    this.directory = path.resolve(directory);
  }

  pathFor(fileName: string): string {
    if (!fileName || fileName !== path.basename(fileName)) {
      throw new Error('Invalid image file name.');
    }

    const resolved = path.resolve(this.directory, fileName);
    const prefix = `${this.directory}${path.sep}`;

    if (!resolved.startsWith(prefix)) {
      throw new Error('Invalid image file path.');
    }

    return resolved;
  }

  async write(id: string, bytes: Uint8Array): Promise<string> {
    const fileName = `${id}.webp`;
    const filePath = this.pathFor(fileName);
    const temporaryPath = this.pathFor(`${id}.tmp`);

    await mkdir(this.directory, { recursive: true });

    try {
      await writeFile(temporaryPath, bytes);
      await rename(temporaryPath, filePath);
      return fileName;
    } catch (error) {
      await unlink(temporaryPath).catch(() => {});
      throw error;
    }
  }

  async read(fileName: string): Promise<Uint8Array | null> {
    try {
      const data = await readFile(this.pathFor(fileName));
      return new Uint8Array(data);
    } catch (error) {
      if (isMissingFile(error)) {
        return null;
      }

      throw error;
    }
  }

  async stat(fileName: string): Promise<Stats | null> {
    try {
      return await stat(this.pathFor(fileName));
    } catch (error) {
      if (isMissingFile(error)) {
        return null;
      }

      throw error;
    }
  }

  createReadStream(fileName: string): ReadStream {
    return createReadStream(this.pathFor(fileName));
  }

  async remove(fileName: string): Promise<void> {
    try {
      await unlink(this.pathFor(fileName));
    } catch (error) {
      if (!isMissingFile(error)) {
        throw error;
      }
    }
  }

  async clear(): Promise<void> {
    await rm(this.directory, { recursive: true, force: true });
  }

  async listFileNames(): Promise<{ name: string; mtimeMs: number }[]> {
    let entries;

    try {
      entries = await readdir(this.directory, { withFileTypes: true });
    } catch (error) {
      if (isMissingFile(error)) {
        return [];
      }

      throw error;
    }

    const files: { name: string; mtimeMs: number }[] = [];

    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }

      try {
        const info = await stat(path.join(this.directory, entry.name));
        files.push({ name: entry.name, mtimeMs: info.mtimeMs });
      } catch (error) {
        if (!isMissingFile(error)) {
          throw error;
        }
      }
    }

    return files;
  }
}
