export const APP_ERROR_CODES = [
  'INVALID_BODY',
  'INVALID_PAGE_ID',
  'PAGE_NOT_FOUND',
  'SAVE_FAILED',
  'READ_FAILED',
  'INVALID_LIST_LIMIT',
  'LIST_FAILED',
  'TEACHER_INVALID_REQUEST',
  'TEACHER_PAGE_NOT_FOUND',
  'TEACHER_NO_RESPONSE',
  'UNKNOWN_ERROR',
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

export const ERROR_MESSAGE_KEYS = {
  INVALID_BODY: 'errors.invalidBody',
  INVALID_PAGE_ID: 'errors.invalidPageId',
  PAGE_NOT_FOUND: 'errors.pageNotFound',
  SAVE_FAILED: 'errors.saveFailed',
  READ_FAILED: 'errors.readFailed',
  INVALID_LIST_LIMIT: 'errors.invalidListLimit',
  LIST_FAILED: 'errors.listFailed',
  TEACHER_INVALID_REQUEST: 'errors.teacherInvalidRequest',
  TEACHER_PAGE_NOT_FOUND: 'errors.teacherPageNotFound',
  TEACHER_NO_RESPONSE: 'errors.teacherNoResponse',
  UNKNOWN_ERROR: 'errors.unknown',
} as const satisfies Record<AppErrorCode, string>;
