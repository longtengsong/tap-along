import type {
  PageSnapshot,
  TeacherAskPayload,
  TeacherCancelPayload,
  TeacherCancelResult,
  TeacherChunkEvent,
  TeacherDoneEvent,
  TeacherMaintenancePayload,
  TeacherResumePayload,
  TeacherStartResult,
} from '../../shared/pages.ts';
import {
  extractContentKeyword,
  resolveMockReplyLanguage,
  type ReplyLanguage,
} from '../../shared/conversation-language.ts';
import { translateFixedMessage } from '../../i18n/fixed-messages.ts';
import type { PagesRepository } from '../db/pages.ts';
import { getTeacherFailureCode } from './model-teacher.ts';

export interface TeacherGeneratorInput {
  page: PageSnapshot;
  userText: string;
  replyLanguage: ReplyLanguage;
  contextPage?: PageSnapshot;
  maintenanceKind?: 'edit' | 'append';
  signal?: AbortSignal;
}

export type TeacherGenerator = (
  input: TeacherGeneratorInput,
) => AsyncIterable<string>;

export interface TeacherStartOutcome {
  result: TeacherStartResult;
  completion?: Promise<TeacherDoneEvent>;
}

type TeacherEventEmitter = (
  event: TeacherChunkEvent | TeacherDoneEvent,
) => void;

interface ActiveTeacherRequest {
  controller: AbortController;
}

const wait = (duration: number) =>
  new Promise((resolve) => setTimeout(resolve, duration));

const throwIfCancelled = (signal: AbortSignal) => {
  if (signal.aborted) {
    throw new Error('老师请求已取消');
  }
};

const parseTeacherCancelPayload = (
  payload: unknown,
): TeacherCancelPayload | null => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const input = payload as Partial<TeacherCancelPayload>;

  if (typeof input.requestId !== 'string' || !input.requestId.trim()) {
    return null;
  }

  return { requestId: input.requestId.trim() };
};

const parseTeacherPayload = (payload: unknown): TeacherAskPayload | null => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const input = payload as Partial<TeacherAskPayload>;

  if (
    !Number.isInteger(input.pageId) ||
    (input.pageId ?? 0) <= 0 ||
    typeof input.userText !== 'string' ||
    !input.userText.trim() ||
    typeof input.requestId !== 'string' ||
    !input.requestId.trim()
  ) {
    return null;
  }

  return {
    pageId: input.pageId as number,
    userText: input.userText.trim(),
    requestId: input.requestId.trim(),
  };
};

const parseResumePayload = (payload: unknown): TeacherResumePayload | null => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const input = payload as Partial<TeacherResumePayload>;

  if (
    !Number.isInteger(input.targetPageId) ||
    (input.targetPageId ?? 0) <= 0 ||
    !Number.isInteger(input.contextPageId) ||
    (input.contextPageId ?? 0) <= 0 ||
    input.targetPageId === input.contextPageId ||
    typeof input.requestId !== 'string' ||
    !input.requestId.trim()
  ) {
    return null;
  }

  return {
    targetPageId: input.targetPageId as number,
    contextPageId: input.contextPageId as number,
    requestId: input.requestId.trim(),
  };
};

const parseMaintenancePayload = (
  payload: unknown,
): TeacherMaintenancePayload | null => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const input = payload as Partial<TeacherMaintenancePayload>;

  if (
    !Number.isInteger(input.pageId) ||
    (input.pageId ?? 0) <= 0 ||
    (input.kind !== 'edit' && input.kind !== 'append') ||
    typeof input.triggerText !== 'string' ||
    !input.triggerText.trim() ||
    typeof input.requestId !== 'string' ||
    !input.requestId.trim()
  ) {
    return null;
  }

  return {
    pageId: input.pageId as number,
    kind: input.kind,
    triggerText: input.triggerText.trim(),
    requestId: input.requestId.trim(),
  };
};

export const createOpeningTeacherMessage = (body: string) => {
  const replyLanguage = resolveMockReplyLanguage(body);

  return translateFixedMessage(replyLanguage, 'teacherFallback.firstQuestion', {
    keyword: extractContentKeyword(body, replyLanguage),
  });
};

const createMockReply = (
  page: PageSnapshot,
  replyLanguage: ReplyLanguage,
  contextPage?: PageSnapshot,
  maintenanceKind?: 'edit' | 'append',
) => {
  const keyword = extractContentKeyword(page.body, replyLanguage);

  if (contextPage) {
    const contextKeywordLanguage = resolveMockReplyLanguage(contextPage.body);
    const targetKeywordLanguage = resolveMockReplyLanguage(page.body);

    return {
      text: translateFixedMessage(
        replyLanguage,
        'teacherFallback.resumeWithContext',
        {
          contextTitle: contextPage.title,
          contextKeyword: extractContentKeyword(
            contextPage.body,
            contextKeywordLanguage,
          ),
          targetKeyword: extractContentKeyword(
            page.body,
            targetKeywordLanguage,
          ),
        },
      ),
      suggestClose: false,
    };
  }

  if (maintenanceKind) {
    if (page.teachingRoundCount >= 4) {
      return {
        text: translateFixedMessage(
          replyLanguage,
          'teacherFallback.suggestCloseAfterMaintain',
        ),
        suggestClose: true,
      };
    }

    return {
      text:
        maintenanceKind === 'append'
          ? translateFixedMessage(
              replyLanguage,
              'teacherFallback.afterAppend',
              {
                question: translateFixedMessage(
                  replyLanguage,
                  'teacherFallback.activeOrDriven',
                ),
              },
            )
          : translateFixedMessage(replyLanguage, 'teacherFallback.afterEdit', {
              keyword,
            }),
      suggestClose: false,
    };
  }

  if (page.teachingRoundCount >= 3) {
    return {
      text: translateFixedMessage(
        replyLanguage,
        'teacherFallback.suggestCloseInTalk',
      ),
      suggestClose: true,
    };
  }

  const questionKeys = [
    'teacherFallback.firstQuestion',
    'teacherFallback.followUp',
    'teacherFallback.attentionAllocation',
    'teacherFallback.counterExample',
  ];
  const key = questionKeys[Math.min(page.teachingRoundCount + 1, 3)];

  return {
    text: translateFixedMessage(replyLanguage, key, {
      keyword,
      optionA: replyLanguage === 'en' ? 'task-driven' : '任务牵引',
      optionB: replyLanguage === 'en' ? 'your own choice' : '你主动分配',
    }),
    suggestClose: false,
  };
};

export const createMockTeacherStream: TeacherGenerator = async function* ({
  page,
  replyLanguage,
  contextPage,
  maintenanceKind,
}) {
  const reply = createMockReply(
    page,
    replyLanguage,
    contextPage,
    maintenanceKind,
  );
  const characters = Array.from(reply.text);

  for (let index = 0; index < characters.length; index += 3) {
    await wait(70);
    yield characters.slice(index, index + 3).join('');
  }
};

export class TeacherService {
  private readonly activeRequests = new Map<string, ActiveTeacherRequest>();
  private readonly repository: Pick<
    PagesRepository,
    | 'beginTeacherTurn'
    | 'completeTeacherTurn'
    | 'findById'
    | 'appendTeacherPrompt'
  >;
  private readonly generate: TeacherGenerator;

  constructor(
    repository: Pick<
      PagesRepository,
      | 'beginTeacherTurn'
      | 'completeTeacherTurn'
      | 'findById'
      | 'appendTeacherPrompt'
    >,
    generate: TeacherGenerator = createMockTeacherStream,
  ) {
    this.repository = repository;
    this.generate = generate;
  }

  cancel(payload: unknown): TeacherCancelResult {
    const input = parseTeacherCancelPayload(payload);

    if (!input) {
      return { ok: false, errorCode: 'TEACHER_INVALID_REQUEST' };
    }

    const active = this.activeRequests.get(input.requestId);

    if (!active) {
      return { ok: true };
    }

    active.controller.abort();
    return { ok: true };
  }

  start(payload: unknown, emit: TeacherEventEmitter): TeacherStartOutcome {
    const input = parseTeacherPayload(payload);

    if (!input) {
      return {
        result: {
          ok: false,
          errorCode: 'TEACHER_INVALID_REQUEST',
        },
      };
    }

    if (this.activeRequests.has(input.requestId)) {
      return {
        result: { ok: true, requestId: input.requestId },
      };
    }

    let page: PageSnapshot | null;

    try {
      page = this.repository.beginTeacherTurn(
        input.pageId,
        input.userText,
        input.requestId,
      );
    } catch (error) {
      console.error('保存老师问答失败：', error);
      return {
        result: {
          ok: false,
          requestId: input.requestId,
          errorCode: 'TEACHER_NO_RESPONSE',
        },
      };
    }

    if (!page) {
      return {
        result: {
          ok: false,
          requestId: input.requestId,
          errorCode: 'TEACHER_PAGE_NOT_FOUND',
        },
      };
    }

    if (
      page.messages.some(
        (message) =>
          message.role === 'teacher' && message.requestId === input.requestId,
      )
    ) {
      return {
        result: { ok: true, requestId: input.requestId },
      };
    }

    const active: ActiveTeacherRequest = { controller: new AbortController() };
    this.activeRequests.set(input.requestId, active);
    const completion = this.streamResponse(
      page,
      input,
      emit,
      active.controller.signal,
    ).finally(() => {
      if (this.activeRequests.get(input.requestId) === active) {
        this.activeRequests.delete(input.requestId);
      }
    });

    return {
      result: { ok: true, requestId: input.requestId },
      completion,
    };
  }

  startResume(
    payload: unknown,
    emit: TeacherEventEmitter,
  ): TeacherStartOutcome {
    const input = parseResumePayload(payload);

    if (!input) {
      return {
        result: {
          ok: false,
          errorCode: 'TEACHER_INVALID_REQUEST',
        },
      };
    }

    if (this.activeRequests.has(input.requestId)) {
      return {
        result: { ok: true, requestId: input.requestId },
      };
    }

    let targetPage: PageSnapshot | null;
    let contextPage: PageSnapshot | null;

    try {
      targetPage = this.repository.findById(input.targetPageId);
      contextPage = this.repository.findById(input.contextPageId);
    } catch (error) {
      console.error('读取跨页上下文失败：', error);
      return {
        result: {
          ok: false,
          requestId: input.requestId,
          errorCode: 'TEACHER_NO_RESPONSE',
        },
      };
    }

    if (!targetPage || !contextPage) {
      return {
        result: {
          ok: false,
          requestId: input.requestId,
          errorCode: 'TEACHER_PAGE_NOT_FOUND',
        },
      };
    }

    if (targetPage.status !== 'reading') {
      return {
        result: {
          ok: false,
          requestId: input.requestId,
          errorCode: 'PAGE_CLOSED',
        },
      };
    }

    if (contextPage.status !== 'closed') {
      return {
        result: {
          ok: false,
          requestId: input.requestId,
          errorCode: 'TEACHER_INVALID_REQUEST',
        },
      };
    }

    if (
      targetPage.messages.some(
        (message) =>
          message.role === 'teacher' && message.requestId === input.requestId,
      )
    ) {
      return {
        result: { ok: true, requestId: input.requestId },
      };
    }

    const active: ActiveTeacherRequest = { controller: new AbortController() };
    this.activeRequests.set(input.requestId, active);
    const completion = this.streamResume(
      targetPage,
      contextPage,
      input,
      emit,
      active.controller.signal,
    ).finally(() => {
      if (this.activeRequests.get(input.requestId) === active) {
        this.activeRequests.delete(input.requestId);
      }
    });

    return {
      result: { ok: true, requestId: input.requestId },
      completion,
    };
  }

  startMaintenance(
    payload: unknown,
    emit: TeacherEventEmitter,
  ): TeacherStartOutcome {
    const input = parseMaintenancePayload(payload);

    if (!input) {
      return {
        result: {
          ok: false,
          errorCode: 'TEACHER_INVALID_REQUEST',
        },
      };
    }

    if (this.activeRequests.has(input.requestId)) {
      return {
        result: { ok: true, requestId: input.requestId },
      };
    }

    let page: PageSnapshot | null;

    try {
      page = this.repository.findById(input.pageId);
    } catch (error) {
      console.error('读取维护页边失败：', error);
      return {
        result: {
          ok: false,
          requestId: input.requestId,
          errorCode: 'TEACHER_NO_RESPONSE',
        },
      };
    }

    if (!page) {
      return {
        result: {
          ok: false,
          requestId: input.requestId,
          errorCode: 'TEACHER_PAGE_NOT_FOUND',
        },
      };
    }

    if (page.status !== 'reading') {
      return {
        result: {
          ok: false,
          requestId: input.requestId,
          errorCode: 'PAGE_CLOSED',
        },
      };
    }

    if (
      page.messages.some(
        (message) =>
          message.role === 'teacher' && message.requestId === input.requestId,
      )
    ) {
      return {
        result: { ok: true, requestId: input.requestId },
      };
    }

    const previousUserTexts = page.messages
      .filter((message) => message.role === 'user')
      .map((message) => message.text);
    const replyLanguage = resolveMockReplyLanguage(input.triggerText, [
      page.body,
      ...previousUserTexts,
    ]);

    const active: ActiveTeacherRequest = { controller: new AbortController() };
    this.activeRequests.set(input.requestId, active);
    const completion = this.streamMaintenance(
      page,
      input,
      replyLanguage,
      emit,
      active.controller.signal,
    ).finally(() => {
      if (this.activeRequests.get(input.requestId) === active) {
        this.activeRequests.delete(input.requestId);
      }
    });

    return {
      result: { ok: true, requestId: input.requestId },
      completion,
    };
  }

  private async streamMaintenance(
    page: PageSnapshot,
    input: TeacherMaintenancePayload,
    replyLanguage: ReplyLanguage,
    emit: TeacherEventEmitter,
    signal: AbortSignal,
  ): Promise<TeacherDoneEvent> {
    let reply = '';

    try {
      throwIfCancelled(signal);
      for await (const chunk of this.generate({
        page,
        userText: input.triggerText,
        replyLanguage,
        maintenanceKind: input.kind,
        signal,
      })) {
        throwIfCancelled(signal);
        if (!chunk) {
          continue;
        }

        reply += chunk;
        emit({
          pageId: page.id,
          requestId: input.requestId,
          chunk,
        });
      }

      throwIfCancelled(signal);
      if (!reply) {
        throw new Error('老师没有返回维护回应');
      }

      const result = this.repository.appendTeacherPrompt(
        page.id,
        reply,
        input.requestId,
      );

      if (!result.ok) {
        throw new Error('保存维护回应失败');
      }

      throwIfCancelled(signal);
      const doneEvent: TeacherDoneEvent = {
        ok: true,
        pageId: page.id,
        requestId: input.requestId,
        reply,
        suggestClose: page.teachingRoundCount >= 4,
      };
      emit(doneEvent);
      return doneEvent;
    } catch (error) {
      const cancelled = signal.aborted;

      if (!cancelled) {
        console.error('生成维护老师回应失败：', error);
      }

      const failedEvent: TeacherDoneEvent = {
        ok: false,
        pageId: page.id,
        requestId: input.requestId,
        ...(cancelled
          ? { cancelled: true }
          : { errorCode: getTeacherFailureCode(error) }),
      };
      emit(failedEvent);
      return failedEvent;
    }
  }

  private async streamResume(
    targetPage: PageSnapshot,
    contextPage: PageSnapshot,
    input: TeacherResumePayload,
    emit: TeacherEventEmitter,
    signal: AbortSignal,
  ): Promise<TeacherDoneEvent> {
    let reply = '';
    const contextUserTexts = contextPage.messages
      .filter((message) => message.role === 'user')
      .map((message) => message.text);
    const targetUserTexts = targetPage.messages
      .filter((message) => message.role === 'user')
      .map((message) => message.text);
    const latestUserText = contextUserTexts.at(-1) ?? contextPage.body;
    const replyLanguage = resolveMockReplyLanguage(latestUserText, [
      targetPage.body,
      ...targetUserTexts,
      ...contextUserTexts.slice(0, -1),
    ]);

    try {
      throwIfCancelled(signal);
      for await (const chunk of this.generate({
        page: targetPage,
        contextPage,
        userText: latestUserText,
        replyLanguage,
        signal,
      })) {
        throwIfCancelled(signal);
        if (!chunk) {
          continue;
        }

        reply += chunk;
        emit({
          pageId: targetPage.id,
          requestId: input.requestId,
          chunk,
        });
      }

      throwIfCancelled(signal);
      if (!reply) {
        throw new Error('老师没有返回跨页问题');
      }

      const result = this.repository.appendTeacherPrompt(
        targetPage.id,
        reply,
        input.requestId,
      );

      if (!result.ok) {
        throw new Error('保存跨页问题失败');
      }

      throwIfCancelled(signal);
      const doneEvent: TeacherDoneEvent = {
        ok: true,
        pageId: targetPage.id,
        requestId: input.requestId,
        reply,
        suggestClose: false,
      };
      emit(doneEvent);
      return doneEvent;
    } catch (error) {
      const cancelled = signal.aborted;

      if (!cancelled) {
        console.error('生成跨页老师问题失败：', error);
      }

      const failedEvent: TeacherDoneEvent = {
        ok: false,
        pageId: targetPage.id,
        requestId: input.requestId,
        ...(cancelled
          ? { cancelled: true }
          : { errorCode: getTeacherFailureCode(error) }),
      };
      emit(failedEvent);
      return failedEvent;
    }
  }

  private async streamResponse(
    page: PageSnapshot,
    input: TeacherAskPayload,
    emit: TeacherEventEmitter,
    signal: AbortSignal,
  ): Promise<TeacherDoneEvent> {
    let reply = '';
    const previousUserTexts = page.messages
      .filter(
        (message) =>
          message.role === 'user' && message.requestId !== input.requestId,
      )
      .map((message) => message.text);
    const replyLanguage = resolveMockReplyLanguage(
      input.userText,
      previousUserTexts,
    );

    try {
      throwIfCancelled(signal);
      for await (const chunk of this.generate({
        page,
        userText: input.userText,
        replyLanguage,
        signal,
      })) {
        throwIfCancelled(signal);
        if (!chunk) {
          continue;
        }

        reply += chunk;
        emit({
          pageId: input.pageId,
          requestId: input.requestId,
          chunk,
        });
      }

      throwIfCancelled(signal);
      if (!reply) {
        throw new Error('老师没有返回内容');
      }

      const suggestClose = page.teachingRoundCount >= 3;
      const updatedPage = this.repository.completeTeacherTurn(
        input.pageId,
        reply,
        suggestClose,
        input.requestId,
      );

      if (!updatedPage) {
        throw new Error('保存老师回应后无法读取页边');
      }

      throwIfCancelled(signal);
      const doneEvent: TeacherDoneEvent = {
        ok: true,
        pageId: input.pageId,
        requestId: input.requestId,
        reply,
        suggestClose,
      };
      emit(doneEvent);
      return doneEvent;
    } catch (error) {
      const cancelled = signal.aborted;

      if (!cancelled) {
        console.error('生成老师回应失败：', error);
      }

      const failedEvent: TeacherDoneEvent = {
        ok: false,
        pageId: input.pageId,
        requestId: input.requestId,
        ...(cancelled
          ? { cancelled: true }
          : { errorCode: getTeacherFailureCode(error) }),
      };
      emit(failedEvent);
      return failedEvent;
    }
  }
}
