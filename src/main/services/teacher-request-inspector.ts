import type { AppErrorCode } from '../../shared/errors.ts';
import type {
  TeacherRequestInspection,
  TeacherRequestInspectionMessage,
  TeacherRequestInspectionResult,
} from '../../shared/pages.ts';
import type { DeveloperModeService } from './developer-mode.ts';

interface RecordTeacherRequestInput {
  requestId: string;
  providerId: string;
  model: string;
  messages: TeacherRequestInspectionMessage[];
}

export class TeacherRequestInspector {
  private readonly developerMode: Pick<DeveloperModeService, 'get'>;
  private readonly maxEntries: number;
  private readonly requests = new Map<string, TeacherRequestInspection>();

  constructor(
    developerMode: Pick<DeveloperModeService, 'get'>,
    maxEntries = 20,
  ) {
    this.developerMode = developerMode;
    this.maxEntries = maxEntries;
  }

  private isEnabled() {
    const result = this.developerMode.get();
    return result.ok && result.enabled === true;
  }

  private store(request: TeacherRequestInspection) {
    this.requests.delete(request.requestId);
    this.requests.set(request.requestId, request);

    while (this.requests.size > this.maxEntries) {
      const oldestRequestId = this.requests.keys().next().value;

      if (oldestRequestId === undefined) {
        break;
      }

      this.requests.delete(oldestRequestId);
    }
  }

  recordSent(input: RecordTeacherRequestInput) {
    if (!this.isEnabled()) {
      return;
    }

    this.store({
      requestId: input.requestId,
      status: 'sent',
      providerId: input.providerId,
      model: input.model,
      messages: input.messages.map((message) => ({ ...message })),
      createdAt: Date.now(),
    });
  }

  recordFailed(requestId: string, errorCode: AppErrorCode) {
    if (!this.isEnabled()) {
      return;
    }

    const request = this.requests.get(requestId);

    if (!request) {
      return;
    }

    this.store({
      ...request,
      status: 'failed',
      errorCode,
    });
  }

  recordFallback(requestId: string) {
    if (!this.isEnabled()) {
      return;
    }

    this.store({
      requestId,
      status: 'fallback',
      messages: [],
      createdAt: Date.now(),
    });
  }

  get(requestId: unknown): TeacherRequestInspectionResult {
    if (!this.isEnabled()) {
      return { ok: false, errorCode: 'DEVELOPER_MODE_REQUIRED' };
    }

    if (typeof requestId !== 'string' || !requestId.trim()) {
      return { ok: false, errorCode: 'TEACHER_INVALID_REQUEST' };
    }

    return {
      ok: true,
      request: this.requests.get(requestId),
    };
  }
}
