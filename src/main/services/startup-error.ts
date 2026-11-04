export interface StartupFailureInput {
  error: unknown;
  dataDirectory: string;
  locale: string;
}

export interface StartupFailureContent {
  title: string;
  message: string;
  detail: string;
  openButton: string;
  quitButton: string;
}

const isPermissionError = (error: unknown) => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const record = error as { code?: unknown; message?: unknown };
  const code = typeof record.code === 'string' ? record.code : '';
  const message =
    typeof record.message === 'string' ? record.message.toLowerCase() : '';

  return (
    code === 'EACCES' ||
    code === 'EPERM' ||
    message.includes('permission') ||
    message.includes('access denied') ||
    message.includes('eacces') ||
    message.includes('eperm') ||
    message.includes('权限')
  );
};

export const buildStartupFailureContent = ({
  error,
  dataDirectory,
  locale,
}: StartupFailureInput): StartupFailureContent => {
  const isChinese = locale.toLowerCase().startsWith('zh');
  const path = dataDirectory.trim() || (isChinese ? '（未知）' : '(unknown)');
  const permission = isPermissionError(error);

  if (isChinese) {
    return {
      title: '轻叩伴读',
      message: '无法打开本地数据',
      detail: [
        `数据目录：${path}`,
        permission ? '数据目录无法读取或写入。' : '本地数据暂时打不开。',
        '请先确认该目录存在且可写，或从备份恢复数据。',
      ].join('\n\n'),
      openButton: '打开数据目录',
      quitButton: '退出',
    };
  }

  return {
    title: 'TapAlong',
    message: 'Could not open your local data',
    detail: [
      `Data folder: ${path}`,
      permission
        ? 'The data folder cannot be read or written.'
        : 'Your local data could not be opened.',
      'Check that the folder exists and is writable, or restore it from a backup.',
    ].join('\n\n'),
    openButton: 'Open data folder',
    quitButton: 'Quit',
  };
};
