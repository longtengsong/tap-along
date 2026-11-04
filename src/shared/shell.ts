import type { AppErrorCode } from './errors.ts';

export const SHELL_CHANNELS = {
  openExternal: 'shell:open-external',
} as const;

export interface OpenExternalResult {
  ok: boolean;
  errorCode?: AppErrorCode;
}

export interface ShellBridge {
  openExternal?: (url: string) => Promise<OpenExternalResult>;
}

export const isSafeExternalUrl = (value: unknown): value is string => {
  if (typeof value !== 'string' || !value.trim()) {
    return false;
  }

  try {
    const url = new URL(value);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }

    return !url.username && !url.password;
  } catch {
    return false;
  }
};
