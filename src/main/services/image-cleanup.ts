import type { PageImagesRepository } from '../db/page-images.ts';
import type { ImageStore } from './image-store.ts';

export const UNREFERENCED_IMAGE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const ORPHAN_FILE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const TEMP_FILE_RETENTION_MS = 24 * 60 * 60 * 1000;

export interface ImageCleanupResult {
  removedRows: number;
  removedFiles: number;
}

export class ImageCleanupService {
  private readonly images: Pick<
    PageImagesRepository,
    'pruneUnreferenced' | 'listAllFileNames'
  >;
  private readonly store: Pick<ImageStore, 'listFileNames' | 'remove'>;
  private readonly now: () => number;

  constructor(
    images: Pick<
      PageImagesRepository,
      'pruneUnreferenced' | 'listAllFileNames'
    >,
    store: Pick<ImageStore, 'listFileNames' | 'remove'>,
    now: () => number = Date.now,
  ) {
    this.images = images;
    this.store = store;
    this.now = now;
  }

  async run(): Promise<ImageCleanupResult> {
    const now = this.now();
    const unreferenced = this.images.pruneUnreferenced(
      now - UNREFERENCED_IMAGE_RETENTION_MS,
    );
    let removedRows = 0;
    let removedFiles = 0;

    for (const fileName of unreferenced) {
      removedRows += 1;

      try {
        await this.store.remove(fileName);
        removedFiles += 1;
      } catch (error) {
        console.error('清理无引用图片失败：', fileName, error);
      }
    }

    const knownFiles = new Set(this.images.listAllFileNames());

    for (const file of await this.store.listFileNames()) {
      if (knownFiles.has(file.name)) {
        continue;
      }

      const isTemporary =
        file.name.startsWith('.tmp-') || file.name.endsWith('.tmp');
      const cutoff = isTemporary
        ? now - TEMP_FILE_RETENTION_MS
        : now - ORPHAN_FILE_RETENTION_MS;

      if (file.mtimeMs >= cutoff) {
        continue;
      }

      try {
        await this.store.remove(file.name);
        removedFiles += 1;
      } catch (error) {
        console.error('清理孤儿图片失败：', file.name, error);
      }
    }

    return { removedRows, removedFiles };
  }
}
