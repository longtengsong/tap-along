import { createHash, randomUUID } from 'node:crypto';
import { GUIDANCE_RELATED_NOTE_EXCERPT_LIMIT } from '../../shared/guidance.ts';
import type {
  GuidanceRunPayload,
  GuidanceRunResult,
  GuidanceUpdatedEvent,
  GuidanceUsePayload,
  GuidanceUseResult,
  GuidanceView,
} from '../../shared/guidance.ts';
import type { PagesRepository } from '../db/pages.ts';
import {
  extractTerms,
  findRelatedNotes,
  type RelatedNoteCandidate,
} from './related-notes.ts';
import type { GuidanceDecision, GuidancePlanner } from './guidance-planner.ts';
import { deriveAnchorQuote } from './anchor-quote.ts';

type GuidanceRepository = Pick<
  PagesRepository,
  | 'findById'
  | 'searchPagesForRetrieval'
  | 'finalizeGuidance'
  | 'useGuidanceSuggestion'
>;

type GuidanceEmitter = (event: GuidanceUpdatedEvent) => void;
type GuidanceRunMode = 'initial' | 'refresh' | 'retry' | 'open';

interface GuidanceRunOptions {
  mode?: GuidanceRunMode;
}

interface InFlightGuidance {
  mode: GuidanceRunMode;
  promise: Promise<void>;
}

const hashBody = (body: string) =>
  createHash('sha256').update(body).digest('hex');

const buildView = (
  decision: GuidanceDecision,
  candidates: RelatedNoteCandidate[],
  bodyHash: string,
  currentBody: string,
): GuidanceView => {
  const byId = new Map(
    candidates.map((candidate) => [candidate.pageId, candidate]),
  );
  const suggestions = decision.needDeeperUnderstanding
    ? decision.suggestions.flatMap((suggestion) => {
        const related = suggestion.relatedPageIds.flatMap((pageId) => {
          const candidate = byId.get(pageId);
          return candidate ? [candidate] : [];
        });

        if (related.length !== suggestion.relatedPageIds.length) {
          return [];
        }

        const anchorQuote = deriveAnchorQuote(
          currentBody,
          related.map((candidate) => candidate.snippet).join('\n'),
        );

        return [
          {
            id: `g-${suggestion.relatedPageIds.join('-')}`,
            relatedPageIds: suggestion.relatedPageIds,
            notes: related.map((candidate) => {
              const excerpt = (
                candidate.body?.trim() || candidate.snippet
              ).slice(0, GUIDANCE_RELATED_NOTE_EXCERPT_LIMIT);

              return {
                pageId: candidate.pageId,
                title: candidate.title,
                source: candidate.source,
                ...(excerpt ? { excerpt } : {}),
              };
            }),
            why: suggestion.why,
            question: suggestion.question,
            ...(anchorQuote ? { anchorQuote } : {}),
          },
        ];
      })
    : [];
  const status: GuidanceView['status'] = !decision.needDeeperUnderstanding
    ? 'not_needed'
    : suggestions.length > 0
      ? 'needed'
      : 'no_candidates';

  return {
    status,
    ...(decision.reason ? { reason: decision.reason } : {}),
    suggestions,
    bodyHash,
    updatedAt: Date.now(),
  };
};

export class GuidanceService {
  private readonly repository: GuidanceRepository;
  private readonly planner: GuidancePlanner;
  private readonly inFlight = new Map<number, InFlightGuidance>();

  constructor(repository: GuidanceRepository, planner: GuidancePlanner) {
    this.repository = repository;
    this.planner = planner;
  }

  use(payload: unknown): GuidanceUseResult {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return { ok: false, errorCode: 'TEACHER_INVALID_REQUEST' };
    }

    const input = payload as Partial<GuidanceUsePayload>;

    if (
      typeof input.pageId !== 'number' ||
      !Number.isInteger(input.pageId) ||
      input.pageId <= 0 ||
      typeof input.suggestionId !== 'string' ||
      !input.suggestionId.trim()
    ) {
      return { ok: false, errorCode: 'TEACHER_INVALID_REQUEST' };
    }

    return this.repository.useGuidanceSuggestion(
      input.pageId,
      input.suggestionId.trim(),
    );
  }

  refresh(payload: unknown, emit: GuidanceEmitter): GuidanceRunResult {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return { ok: false, errorCode: 'TEACHER_INVALID_REQUEST' };
    }

    const input = payload as Partial<GuidanceRunPayload>;

    if (
      typeof input.pageId !== 'number' ||
      !Number.isInteger(input.pageId) ||
      input.pageId <= 0 ||
      (input.mode !== 'refresh' &&
        input.mode !== 'retry' &&
        input.mode !== 'open')
    ) {
      return { ok: false, errorCode: 'TEACHER_INVALID_REQUEST' };
    }

    const mode = input.mode;

    void this.run(input.pageId, emit, { mode }).catch((error) => {
      console.error('运行理解引导失败：', error);
    });

    return { ok: true };
  }

  run(
    pageId: number,
    emit: GuidanceEmitter,
    options: GuidanceRunOptions = {},
  ): Promise<void> {
    if (!Number.isInteger(pageId) || pageId <= 0) {
      return Promise.resolve();
    }

    const mode = options.mode ?? 'initial';
    const running = this.inFlight.get(pageId);

    if (running) {
      if (
        (mode === 'refresh' || mode === 'retry' || mode === 'open') &&
        running.mode === 'initial'
      ) {
        let chained: Promise<void>;
        chained = running.promise
          .catch(() => {})
          .then(() => this.execute(pageId, emit, mode))
          .finally(() => {
            if (this.inFlight.get(pageId)?.promise === chained) {
              this.inFlight.delete(pageId);
            }
          });
        this.inFlight.set(pageId, { mode, promise: chained });
        return chained;
      }

      return running.promise;
    }

    const entry: InFlightGuidance = {
      mode,
      promise: Promise.resolve(),
    };
    const task = this.execute(pageId, emit, mode).finally(() => {
      if (this.inFlight.get(pageId) === entry) {
        this.inFlight.delete(pageId);
      }
    });
    entry.promise = task;
    this.inFlight.set(pageId, entry);
    return task;
  }

  private async execute(
    pageId: number,
    emit: GuidanceEmitter,
    mode: GuidanceRunMode,
  ) {
    const page = this.repository.findById(pageId);

    if (!page || page.status !== 'reading') {
      return;
    }

    const hasUserMessages = page.messages.some(
      (message) => message.role === 'user',
    );

    if (mode === 'initial') {
      if (page.guidance || hasUserMessages) {
        return;
      }
    }

    if (mode === 'open' && hasUserMessages) {
      return;
    }

    if (mode === 'refresh' && page.guidance) {
      return;
    }

    if (mode === 'retry') {
      if (hasUserMessages) {
        return;
      }

      if (
        page.guidance &&
        page.guidance.status !== 'failed' &&
        page.guidance.status !== 'no_candidates'
      ) {
        return;
      }
    }

    const messageCount = page.messages.length;

    const body = page.body;
    const bodyHash = hashBody(body);
    let view: GuidanceView;

    try {
      const terms = [...extractTerms(page.body).keys()];
      const candidates = findRelatedNotes(
        page,
        this.repository.searchPagesForRetrieval(pageId, terms, 100),
      );
      const requestId = `guidance-${pageId}-${randomUUID()}`;
      const decision = await this.planner.plan({
        page,
        candidates,
        requestId,
      });
      view = buildView(decision, candidates, bodyHash, body);

      if (view.suggestions[0]) {
        view.suggestions[0].requestId = requestId;
      }
    } catch (error) {
      console.error('生成理解引导失败：', error);

      if (mode === 'refresh' || mode === 'open') {
        return;
      }

      view = {
        status: 'failed',
        suggestions: [],
        bodyHash,
        updatedAt: Date.now(),
      };
    }

    if ((mode === 'refresh' || mode === 'open') && view.status !== 'needed') {
      return;
    }

    const removeOpening =
      (mode === 'initial' || mode === 'retry' || mode === 'open') &&
      (view.status === 'needed' || view.status === 'not_needed');
    const finalizeOptions = {
      removeOpening,
      expectedBody: body,
      ...(mode === 'refresh'
        ? {
            allowUserMessages: true,
            expectedMessageCount: messageCount,
          }
        : {}),
    };

    try {
      const saved = this.repository.finalizeGuidance(
        pageId,
        view,
        finalizeOptions,
      );

      if (!saved) {
        return;
      }

      let guidance = saved.guidance ?? view;

      // 初始引导不再等待用户点按钮：接点一成立，就把预生成的问题作为开场，
      // 让匹配到的旧念头立刻进入对谈。refresh（编辑后的候选）不抢话。
      if (removeOpening && guidance.status === 'needed') {
        const suggestion = guidance.suggestions[0];

        if (suggestion) {
          try {
            const opened = this.repository.useGuidanceSuggestion(
              pageId,
              suggestion.id,
            );

            if (opened.ok && opened.guidance) {
              guidance = opened.guidance;
            }
          } catch (error) {
            // 自动开场失败不应把已经保存好的引导退回 failed；
            // 用户仍可以从右栏读旧念头并继续写。
            console.error('自动打开引导接点失败：', error);
          }
        }
      }

      emit({ pageId, guidance });
    } catch (error) {
      console.error('保存理解引导失败：', error);

      if (mode === 'refresh') {
        return;
      }

      emit({
        pageId,
        guidance: {
          status: 'failed',
          suggestions: [],
          bodyHash,
          updatedAt: Date.now(),
        },
      });
    }
  }
}
