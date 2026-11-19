import type { DatabaseSync } from 'node:sqlite';
import type { PageImageMeta, PageImageMime } from '../../shared/images.ts';

export class PageImageReferenceError extends Error {
  readonly reason: 'not_found';

  constructor(reason: 'not_found') {
    super(reason);
    this.name = 'PageImageReferenceError';
    this.reason = reason;
  }
}

export interface PageImageRow {
  id: string;
  file_name: string;
  mime: PageImageMime;
  byte_length: number;
  created_at: number;
}

export interface ImageFileMeta extends PageImageMeta {
  fileName: string;
  createdAt: number;
}

interface ImageRow {
  id: string;
  file_name: string;
  mime: string;
  byte_length: number;
  created_at: number;
}

const toPageImageRow = (row: ImageRow): PageImageRow => ({
  id: row.id,
  file_name: row.file_name,
  mime: row.mime as PageImageMime,
  byte_length: row.byte_length,
  created_at: row.created_at,
});

const normalizeImageIds = (imageIds: string[]): string[] => {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of imageIds) {
    const imageId = value.trim();

    if (imageId && !seen.has(imageId)) {
      seen.add(imageId);
      result.push(imageId);
    }
  }

  return result;
};

export class PageImagesRepository {
  private readonly insertImageStatement;
  private readonly findImageStatement;
  private readonly insertRefStatement;
  private readonly deletePageRefsStatement;
  private readonly listPageRefIdsStatement;
  private readonly countImageRefsStatement;
  private readonly deleteImageStatement;
  private readonly listPageImagesStatement;
  private readonly listAllFileNamesStatement;
  private readonly deleteAllImagesStatement;
  private readonly listPrunableStatement;
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
    this.insertImageStatement = this.db.prepare(`
      INSERT INTO page_images (
        id,
        file_name,
        mime,
        byte_length,
        created_at
      )
      VALUES (?, ?, ?, ?, ?)
    `);
    this.findImageStatement = this.db.prepare(`
      SELECT
        id,
        file_name,
        mime,
        byte_length,
        created_at
      FROM page_images
      WHERE id = ?
    `);
    this.insertRefStatement = this.db.prepare(`
      INSERT OR IGNORE INTO page_image_refs (page_id, image_id)
      VALUES (?, ?)
    `);
    this.deletePageRefsStatement = this.db.prepare(`
      DELETE FROM page_image_refs
      WHERE page_id = ?
    `);
    this.listPageRefIdsStatement = this.db.prepare(`
      SELECT image_id
      FROM page_image_refs
      WHERE page_id = ?
    `);
    this.countImageRefsStatement = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM page_image_refs
      WHERE image_id = ?
    `);
    this.deleteImageStatement = this.db.prepare(`
      DELETE FROM page_images
      WHERE id = ?
    `);
    this.listPageImagesStatement = this.db.prepare(`
      SELECT
        page_images.id,
        page_images.file_name,
        page_images.mime,
        page_images.byte_length,
        page_images.created_at
      FROM page_image_refs
      JOIN page_images ON page_images.id = page_image_refs.image_id
      WHERE page_image_refs.page_id = ?
      ORDER BY page_images.created_at ASC, page_images.id ASC
    `);
    this.listAllFileNamesStatement = this.db.prepare(`
      SELECT file_name
      FROM page_images
    `);
    this.deleteAllImagesStatement = this.db.prepare(`
      DELETE FROM page_images
    `);
    this.listPrunableStatement = this.db.prepare(`
      SELECT
        page_images.id,
        page_images.file_name
      FROM page_images
      WHERE page_images.created_at < ?
        AND NOT EXISTS (
          SELECT 1
          FROM page_image_refs
          WHERE page_image_refs.image_id = page_images.id
        )
    `);
  }

  create(input: {
    id: string;
    fileName: string;
    mime: PageImageMime;
    byteLength: number;
    createdAt: number;
  }): PageImageMeta {
    this.insertImageStatement.run(
      input.id,
      input.fileName,
      input.mime,
      input.byteLength,
      input.createdAt,
    );

    return {
      id: input.id,
      mime: input.mime,
      byteLength: input.byteLength,
    };
  }

  find(imageId: string): PageImageRow | null {
    if (!imageId.trim()) {
      return null;
    }

    const row = this.findImageStatement.get(imageId.trim()) as
      | ImageRow
      | undefined;

    return row ? toPageImageRow(row) : null;
  }

  addRefs(pageId: number, imageIds: string[]): void {
    const normalized = normalizeImageIds(imageIds);

    for (const imageId of normalized) {
      if (!this.find(imageId)) {
        throw new PageImageReferenceError('not_found');
      }
    }

    for (const imageId of normalized) {
      this.insertRefStatement.run(pageId, imageId);
    }
  }

  replaceRefs(pageId: number, imageIds: string[]): string[] {
    const normalized = normalizeImageIds(imageIds);

    for (const imageId of normalized) {
      if (!this.find(imageId)) {
        throw new PageImageReferenceError('not_found');
      }
    }

    const oldImageIds = (
      this.listPageRefIdsStatement.all(pageId) as Array<{ image_id: string }>
    ).map((row) => row.image_id);

    this.deletePageRefsStatement.run(pageId);

    for (const imageId of normalized) {
      this.insertRefStatement.run(pageId, imageId);
    }

    const nextImageIds = new Set(normalized);
    const removedFileNames: string[] = [];

    for (const imageId of oldImageIds) {
      if (nextImageIds.has(imageId)) {
        continue;
      }

      const count = Number(
        (
          this.countImageRefsStatement.get(imageId) as {
            count: number;
          }
        ).count,
      );

      if (count > 0) {
        continue;
      }

      const row = this.find(imageId);

      if (!row) {
        continue;
      }

      this.deleteImageStatement.run(imageId);
      removedFileNames.push(row.file_name);
    }

    return removedFileNames;
  }

  removeIfUnreferenced(imageId: string): string | null {
    const row = this.find(imageId);

    if (!row) {
      return null;
    }

    const count = Number(
      (
        this.countImageRefsStatement.get(row.id) as {
          count: number;
        }
      ).count,
    );

    if (count > 0) {
      return null;
    }

    this.deleteImageStatement.run(row.id);
    return row.file_name;
  }

  pruneUnreferenced(cutoff: number): string[] {
    const rows = this.listPrunableStatement.all(cutoff) as Array<{
      id: string;
      file_name: string;
    }>;
    const fileNames: string[] = [];

    for (const row of rows) {
      this.deleteImageStatement.run(row.id);
      fileNames.push(row.file_name);
    }

    return fileNames;
  }

  listForPages(pageIds: number[]): ImageFileMeta[] {
    const normalizedPageIds = [
      ...new Set(
        pageIds.filter((pageId) => Number.isInteger(pageId) && pageId > 0),
      ),
    ];
    const result: ImageFileMeta[] = [];
    const seen = new Set<string>();

    for (const pageId of normalizedPageIds) {
      const rows = this.listPageImagesStatement.all(
        pageId,
      ) as unknown as ImageRow[];

      for (const row of rows) {
        if (seen.has(row.id)) {
          continue;
        }

        seen.add(row.id);
        result.push({
          id: row.id,
          mime: row.mime as PageImageMime,
          byteLength: row.byte_length,
          fileName: row.file_name,
          createdAt: row.created_at,
        });
      }
    }

    return result;
  }

  listAllFileNames(): string[] {
    return (
      this.listAllFileNamesStatement.all() as Array<{ file_name: string }>
    ).map((row) => row.file_name);
  }

  clearAll(): void {
    this.deleteAllImagesStatement.run();
  }
}
