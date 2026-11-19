import type { AppErrorCode } from './errors.ts';

export type PageImageMime = 'image/webp';

export interface PageImageMeta {
  id: string;
  mime: PageImageMime;
  byteLength: number;
}

export const IMAGE_CHANNELS = {
  create: 'images:create',
  remove: 'images:remove',
} as const;

export interface CreatePageImagePayload {
  bytes: Uint8Array;
}

export interface CreatePageImageResult {
  ok: boolean;
  image?: PageImageMeta;
  errorCode?: AppErrorCode;
}

export interface RemovePageImageResult {
  ok: boolean;
  errorCode?: AppErrorCode;
}

export interface ImageBridge {
  createPageImage?: (
    payload: CreatePageImagePayload,
  ) => Promise<CreatePageImageResult>;
  removePageImage?: (imageId: string) => Promise<RemovePageImageResult>;
}
