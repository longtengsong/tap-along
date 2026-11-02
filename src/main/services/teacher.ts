import type {
  PageSnapshot,
  TeacherAskPayload,
  TeacherChunkEvent,
  TeacherDoneEvent,
  TeacherStartResult,
} from '../../shared/pages.ts';
import {
  resolveMockReplyLanguage,
  type ReplyLanguage,
} from '../../shared/conversation-language.ts';
import { translateFixedMessage } from '../../i18n/fixed-messages.ts';
import type { PagesRepository } from '../db/pages.ts';

interface TeacherGeneratorInput {
  page: PageSnapshot;
  userText: string;
  replyLanguage: ReplyLanguage;
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

const wait = (duration: number) =>
  new Promise((resolve) => setTimeout(resolve, duration));

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

const extractQuestionKeyword = (body: string, language: ReplyLanguage) => {
  const firstLine = body.split(/\r?\n/, 1)[0]?.trim() ?? '';

  if (language === 'en') {
    return (
      firstLine
        .replace(/[.,!?;:"']/g, '')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 5)
        .join(' ') || 'this'
    );
  }

  return firstLine.replace(/[，。、；：“”‘’？！\s]/g, '').slice(0, 6) || '这页';
};

export const createOpeningTeacherMessage = (body: string) => {
  const replyLanguage = resolveMockReplyLanguage(body);

  return translateFixedMessage(replyLanguage, 'teacherFallback.firstQuestion', {
    keyword: extractQuestionKeyword(body, replyLanguage),
  });
};

const createMockReply = (page: PageSnapshot, replyLanguage: ReplyLanguage) => {
  const keyword = extractQuestionKeyword(page.body, replyLanguage);

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
}) {
  const reply = createMockReply(page, replyLanguage);
  const characters = Array.from(reply.text);

  for (let index = 0; index < characters.length; index += 3) {
    await wait(70);
    yield characters.slice(index, index + 3).join('');
  }
};

export class TeacherService {
  private readonly activeRequests = new Set<string>();
  private readonly repository: Pick<
    PagesRepository,
    'beginTeacherTurn' | 'completeTeacherTurn'
  >;
  private readonly generate: TeacherGenerator;

  constructor(
    repository: Pick<
      PagesRepository,
      'beginTeacherTurn' | 'completeTeacherTurn'
    >,
    generate: TeacherGenerator = createMockTeacherStream,
  ) {
    this.repository = repository;
    this.generate = generate;
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

    this.activeRequests.add(input.requestId);
    const completion = this.streamResponse(page, input, emit).finally(() => {
      this.activeRequests.delete(input.requestId);
    });

    return {
      result: { ok: true, requestId: input.requestId },
      completion,
    };
  }

  private async streamResponse(
    page: PageSnapshot,
    input: TeacherAskPayload,
    emit: TeacherEventEmitter,
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
      for await (const chunk of this.generate({
        page,
        userText: input.userText,
        replyLanguage,
      })) {
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
      console.error('生成老师回应失败：', error);
      const failedEvent: TeacherDoneEvent = {
        ok: false,
        pageId: input.pageId,
        requestId: input.requestId,
        errorCode: 'TEACHER_NO_RESPONSE',
      };
      emit(failedEvent);
      return failedEvent;
    }
  }
}
