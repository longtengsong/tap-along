import type { AppErrorCode } from '../../shared/errors.ts';
import type {
  TeacherRequestInspection,
  TeacherRequestInspectionMessage,
  TeacherRequestInspectionResult,
} from '../../shared/pages.ts';
import type { RequestInspectionStore } from '../db/request-inspections.ts';
import type { DeveloperModeService } from './developer-mode.ts';

interface RecordTeacherRequestInput {
  requestId: string;
  providerId: string;
  model: string;
  messages: TeacherRequestInspectionMessage[];
  promptVersion?: string;
  promptHash?: string;
  temperature?: number;
}

interface CompleteTeacherRequestInput {
  reply: string;
  latencyMs: number;
}

const createMemoryStore = (): RequestInspectionStore => {
  const requests = new Map<string, TeacherRequestInspection>();

  return {
    save(request) {
      requests.delete(request.requestId);
      requests.set(request.requestId, request);
    },
    get(requestId) {
      return requests.get(requestId);
    },
    prune(maxEntries) {
      const limit = Math.max(1, Math.floor(maxEntries));

      while (requests.size > limit) {
        const oldestRequestId = requests.keys().next().value;

        if (oldestRequestId === undefined) {
          break;
        }

        requests.delete(oldestRequestId);
      }
    },
  };
};

export class TeacherRequestInspector {
  private readonly developerMode: Pick<DeveloperModeService, 'get'>;
  private readonly maxEntries: number;
  private readonly store: RequestInspectionStore;

  constructor(
    developerMode: Pick<DeveloperModeService, 'get'>,
    maxEntries = 20,
    store?: RequestInspectionStore,
  ) {
    this.developerMode = developerMode;
    this.maxEntries = maxEntries;
    this.store = store ?? createMemoryStore();
  }

  private isEnabled() {
    const result = this.developerMode.get();
    return result.ok && result.enabled === true;
  }

  private put(request: TeacherRequestInspection) {
    this.store.save(request);
    this.store.prune(this.maxEntries);
  }

  recordSent(input: RecordTeacherRequestInput) {
    if (!this.isEnabled()) {
      return;
    }

    this.put({
      requestId: input.requestId,
      status: 'sent',
      providerId: input.providerId,
      model: input.model,
      messages: input.messages.map((message) => ({ ...message })),
      ...(input.promptVersion ? { promptVersion: input.promptVersion } : {}),
      ...(input.promptHash ? { promptHash: input.promptHash } : {}),
      ...(input.temperature !== undefined
        ? { temperature: input.temperature }
        : {}),
      createdAt: Date.now(),
    });
  }

  recordCompleted(requestId: string, input: CompleteTeacherRequestInput) {
    if (!this.isEnabled() || !input.reply.trim()) {
      return;
    }

    const request = this.store.get(requestId);

    if (!request) {
      return;
    }

    this.put({
      ...request,
      reply: input.reply,
      latencyMs: Math.max(0, Math.round(input.latencyMs)),
    });
  }

  recordFailed(requestId: string, errorCode: AppErrorCode, latencyMs?: number) {
    if (!this.isEnabled()) {
      return;
    }

    const request = this.store.get(requestId);

    if (!request) {
      return;
    }

    this.put({
      ...request,
      status: 'failed',
      errorCode,
      ...(latencyMs !== undefined
        ? { latencyMs: Math.max(0, Math.round(latencyMs)) }
        : {}),
    });
  }

  recordFallback(requestId: string) {
    if (!this.isEnabled()) {
      return;
    }

    this.put({
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
      request: this.store.get(requestId),
    };
  }
}
