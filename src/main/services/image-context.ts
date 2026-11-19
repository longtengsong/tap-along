import type { PageImagesRepository } from '../db/page-images.ts';
import type { ImageStore } from './image-store.ts';

export interface ChatImageData {
  mime: string;
  dataUrl: string;
}

export interface ImageContextResolver {
  resolve(imageId: string): Promise<ChatImageData | null>;
}

export class ImageContextService implements ImageContextResolver {
  private readonly images: Pick<PageImagesRepository, 'find'>;
  private readonly store: Pick<ImageStore, 'read'>;

  constructor(
    images: Pick<PageImagesRepository, 'find'>,
    store: Pick<ImageStore, 'read'>,
  ) {
    this.images = images;
    this.store = store;
  }

  async resolve(imageId: string): Promise<ChatImageData | null> {
    const row = this.images.find(imageId);

    if (!row) {
      return null;
    }

    try {
      const bytes = await this.store.read(row.file_name);

      if (!bytes) {
        return null;
      }

      return {
        mime: row.mime,
        dataUrl: `data:${row.mime};base64,${Buffer.from(bytes).toString('base64')}`,
      };
    } catch {
      return null;
    }
  }
}
