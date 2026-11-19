import { randomUUID } from 'node:crypto';
import type { IpcMain } from 'electron';
import type { AppErrorCode } from '../../shared/errors.ts';
import {
  IMAGE_CHANNELS,
  type CreatePageImageResult,
  type RemovePageImageResult,
} from '../../shared/images.ts';
import type { PageImagesRepository } from '../db/page-images.ts';
import type { ImageStore } from '../services/image-store.ts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const toBytes = (value: unknown): Uint8Array | null => {
  if (value instanceof Uint8Array) {
    return value;
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

  return null;
};

const isWebp = (bytes: Uint8Array): boolean => {
  return (
    bytes.byteLength >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
};

const fail = (errorCode: AppErrorCode): CreatePageImageResult => ({
  ok: false,
  errorCode,
});

export const createPageImage = async (
  repository: Pick<PageImagesRepository, 'create'>,
  store: Pick<ImageStore, 'write' | 'remove'>,
  payload: unknown,
): Promise<CreatePageImageResult> => {
  if (!isRecord(payload)) {
    return fail('IMAGE_INVALID');
  }

  const bytes = toBytes(payload.bytes);

  if (!bytes || bytes.byteLength === 0 || !isWebp(bytes)) {
    return fail('IMAGE_INVALID');
  }

  const id = randomUUID();
  let fileName: string;

  try {
    fileName = await store.write(id, bytes);
  } catch (error) {
    console.error('保存图片文件失败：', error);
    return fail('IMAGE_SAVE_FAILED');
  }

  try {
    const image = repository.create({
      id,
      fileName,
      mime: 'image/webp',
      byteLength: bytes.byteLength,
      createdAt: Date.now(),
    });

    return { ok: true, image };
  } catch (error) {
    console.error('保存图片元数据失败：', error);
    await store.remove(fileName).catch(() => {});
    return fail('IMAGE_SAVE_FAILED');
  }
};

export const removePageImage = async (
  repository: Pick<PageImagesRepository, 'removeIfUnreferenced'>,
  store: Pick<ImageStore, 'remove'>,
  imageId: unknown,
): Promise<RemovePageImageResult> => {
  if (typeof imageId !== 'string' || !imageId.trim()) {
    return { ok: false, errorCode: 'IMAGE_INVALID' };
  }

  try {
    const fileName = repository.removeIfUnreferenced(imageId.trim());

    if (fileName) {
      await store.remove(fileName).catch((error: unknown) => {
        console.error('删除图片文件失败：', error);
      });
    }
  } catch (error) {
    console.error('删除图片记录失败：', error);
  }

  return { ok: true };
};

export const registerImageHandlers = (
  ipcMain: Pick<IpcMain, 'handle'>,
  repository: PageImagesRepository,
  store: ImageStore,
) => {
  ipcMain.handle(IMAGE_CHANNELS.create, (_event, payload: unknown) =>
    createPageImage(repository, store, payload),
  );
  ipcMain.handle(IMAGE_CHANNELS.remove, (_event, imageId: unknown) =>
    removePageImage(repository, store, imageId),
  );
};
