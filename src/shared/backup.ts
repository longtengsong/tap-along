import type { AppErrorCode } from './errors.ts';
import type { PageSnapshot } from './pages.ts';

export const BACKUP_FORMAT = 'tap-along-backup';
export const BACKUP_VERSION = 1;

export interface BackupPayload {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  pages: PageSnapshot[];
}

export const BACKUP_CHANNELS = {
  export: 'backup:export',
} as const;

export interface ExportBackupResult {
  ok: boolean;
  canceled?: boolean;
  pageCount?: number;
  errorCode?: AppErrorCode;
}

export interface BackupBridge {
  exportBackup?: () => Promise<ExportBackupResult>;
}

export const buildBackupPayload = (
  pages: PageSnapshot[],
  exportedAt = new Date().toISOString(),
): BackupPayload => ({
  format: BACKUP_FORMAT,
  version: BACKUP_VERSION,
  exportedAt,
  pages,
});
