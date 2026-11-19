import path from 'node:path';
import type { IpcMain, OpenDialogOptions } from 'electron';
import {
  BACKUP_CHANNELS,
  buildBackupPayload,
  type BackupImageMeta,
  type ExportBackupResult,
} from '../../shared/backup.ts';
import type { ImageFileMeta, PageImagesRepository } from '../db/page-images.ts';
import type { PagesRepository } from '../db/pages.ts';
import type { ImageStore } from '../services/image-store.ts';

export interface BackupExportDependencies {
  showOpenDialog: (
    options: OpenDialogOptions,
  ) => Promise<{ canceled: boolean; filePaths: string[] }>;
  mkdir: (path: string, options: { recursive: true }) => Promise<unknown>;
  copyFile: (source: string, target: string) => Promise<void>;
  writeFile: (
    filePath: string,
    data: string,
    encoding: 'utf8',
  ) => Promise<void>;
  stat: (path: string) => Promise<unknown>;
  now?: () => Date;
}

const pad = (value: number) => String(value).padStart(2, '0');

export const backupFolderName = (date: Date) =>
  [
    'tap-along-backup',
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}${pad(date.getMinutes())}`,
  ].join('-');

const exists = async (
  dependencies: Pick<BackupExportDependencies, 'stat'>,
  target: string,
): Promise<boolean> => {
  try {
    await dependencies.stat(target);
    return true;
  } catch {
    return false;
  }
};

const allocateFolder = async (
  parent: string,
  baseName: string,
  dependencies: Pick<BackupExportDependencies, 'stat'>,
) => {
  let candidate = path.join(parent, baseName);

  for (let index = 1; await exists(dependencies, candidate); index += 1) {
    candidate = path.join(parent, `${baseName}-${index}`);
  }

  return candidate;
};

const toBackupImage = (image: ImageFileMeta): BackupImageMeta => ({
  id: image.id,
  fileName: image.fileName,
  mime: image.mime,
  byteLength: image.byteLength,
  createdAt: image.createdAt,
});

export const exportBackup = async (
  repository: Pick<PagesRepository, 'listAll'>,
  imagesRepository: Pick<PageImagesRepository, 'listForPages'>,
  imageStore: Pick<ImageStore, 'pathFor'>,
  dependencies: BackupExportDependencies,
): Promise<ExportBackupResult> => {
  const now = dependencies.now?.() ?? new Date();

  try {
    const selection = await dependencies.showOpenDialog({
      title: '选择导出位置',
      properties: ['openDirectory', 'createDirectory'],
    });

    if (selection.canceled || !selection.filePaths[0]) {
      return { ok: false, canceled: true };
    }

    const pages = repository.listAll();
    const folder = await allocateFolder(
      selection.filePaths[0],
      backupFolderName(now),
      dependencies,
    );
    const imagesFolder = path.join(folder, 'images');

    await dependencies.mkdir(imagesFolder, { recursive: true });

    const images = imagesRepository.listForPages(pages.map((page) => page.id));
    const exportedImages: BackupImageMeta[] = [];
    let missingImages = 0;

    for (const image of images) {
      try {
        await dependencies.copyFile(
          imageStore.pathFor(image.fileName),
          path.join(imagesFolder, image.fileName),
        );
        exportedImages.push(toBackupImage(image));
      } catch (error) {
        missingImages += 1;
        console.error('导出图片失败：', image.fileName, error);
      }
    }

    const payload = buildBackupPayload(
      pages,
      exportedImages,
      now.toISOString(),
    );

    await dependencies.writeFile(
      path.join(folder, 'backup.json'),
      `${JSON.stringify(payload, null, 2)}\n`,
      'utf8',
    );

    return {
      ok: true,
      pageCount: pages.length,
      imageCount: exportedImages.length,
      missingImages,
      folder,
    };
  } catch (error) {
    console.error('导出备份失败：', error);
    return { ok: false, errorCode: 'EXPORT_FAILED' };
  }
};

export const registerBackupHandlers = (
  ipcMain: Pick<IpcMain, 'handle'>,
  repository: Pick<PagesRepository, 'listAll'>,
  imagesRepository: Pick<PageImagesRepository, 'listForPages'>,
  imageStore: Pick<ImageStore, 'pathFor'>,
  dependencies: BackupExportDependencies,
) => {
  ipcMain.handle(BACKUP_CHANNELS.export, () =>
    exportBackup(repository, imagesRepository, imageStore, dependencies),
  );
};
