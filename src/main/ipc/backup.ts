import path from 'node:path';
import type { SaveDialogOptions } from 'electron';
import type { IpcMain } from 'electron';
import {
  BACKUP_CHANNELS,
  buildBackupPayload,
  type ExportBackupResult,
} from '../../shared/backup.ts';
import type { PagesRepository } from '../db/pages.ts';

export interface BackupExportDependencies {
  documentsPath: string;
  showSaveDialog: (
    options: SaveDialogOptions,
  ) => Promise<{ canceled: boolean; filePath?: string }>;
  writeFile: (
    filePath: string,
    data: string,
    encoding: 'utf8',
  ) => Promise<void>;
  now?: () => Date;
}

const dateStamp = (date: Date) =>
  [
    String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');

export const registerBackupHandlers = (
  ipcMain: Pick<IpcMain, 'handle'>,
  repository: Pick<PagesRepository, 'listAll'>,
  dependencies: BackupExportDependencies,
) => {
  ipcMain.handle(
    BACKUP_CHANNELS.export,
    async (): Promise<ExportBackupResult> => {
      const now = dependencies.now?.() ?? new Date();

      try {
        const result = await dependencies.showSaveDialog({
          title: '导出全部念头',
          defaultPath: path.join(
            dependencies.documentsPath,
            `tap-along-backup-${dateStamp(now)}.json`,
          ),
          filters: [{ name: 'JSON', extensions: ['json'] }],
        });

        if (result.canceled || !result.filePath) {
          return { ok: false, canceled: true };
        }

        const pages = repository.listAll();
        const payload = buildBackupPayload(pages, now.toISOString());

        await dependencies.writeFile(
          result.filePath,
          `${JSON.stringify(payload, null, 2)}\n`,
          'utf8',
        );

        return { ok: true, pageCount: pages.length };
      } catch (error) {
        console.error('导出备份失败：', error);
        return { ok: false, errorCode: 'EXPORT_FAILED' };
      }
    },
  );
};
