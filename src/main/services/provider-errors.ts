import type { AppErrorCode } from '../../shared/errors.ts';

export class ProviderRequestError extends Error {
  readonly errorCode: AppErrorCode;

  constructor(errorCode: AppErrorCode) {
    super('模型服务请求失败');
    this.name = 'ProviderRequestError';
    this.errorCode = errorCode;
  }
}

export const getTeacherFailureCode = (error: unknown): AppErrorCode =>
  error instanceof ProviderRequestError
    ? error.errorCode
    : 'TEACHER_NO_RESPONSE';

export const providerErrorCodeForStatus = (status: number): AppErrorCode => {
  if (status === 401 || status === 403) {
    return 'PROVIDER_UNAUTHORIZED';
  }

  if (status === 400 || status === 404) {
    return 'MODEL_UNAVAILABLE';
  }

  if (status === 408) {
    return 'PROVIDER_TIMEOUT';
  }

  if (status === 429) {
    return 'PROVIDER_RATE_LIMITED';
  }

  return 'PROVIDER_REQUEST_FAILED';
};
