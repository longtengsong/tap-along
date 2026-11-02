import type {
  PageSnapshot,
  TeacherAskPayload,
  TeacherChunkEvent,
  TeacherDoneEvent,
  TeacherStartResult,
} from '../../shared/pages.ts';
import type { PagesRepository } from '../db/pages.ts';

interface TeacherGeneratorInput {
  page: PageSnapshot;
  userText: string;
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

const createMockReply = (page: PageSnapshot) => {
  const keyword = page.title.replace(/[，。、；：“”‘’？！\s]/g, '').slice(0, 6);
  const questions = [
    `你写的“${keyword}”是指什么？能再具体说说吗？`,
    `如果按你说的，“${keyword}”由谁决定？是任务牵引，还是你主动分配？`,
    '那分配完之后，剩下的注意力去了哪里？',
    `你说“${keyword}”，有反例吗？`,
  ];

  if (page.teachingRoundCount >= 3) {
    return {
      text: '暂时没有要再追问的了。如果你觉得可以了，合上这页就行。',
      suggestClose: true,
    };
  }

  return {
    text: questions[
      Math.min(page.teachingRoundCount + 1, questions.length - 1)
    ],
    suggestClose: false,
  };
};

export const createMockTeacherStream: TeacherGenerator = async function* ({
  page,
}) {
  const reply = createMockReply(page);
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
          error: '落笔内容或请求编号无效。',
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
          error: '老师暂时没应声。',
        },
      };
    }

    if (!page) {
      return {
        result: {
          ok: false,
          requestId: input.requestId,
          error: '这一页没有找到。',
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

    try {
      for await (const chunk of this.generate({
        page,
        userText: input.userText,
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
        error: '老师暂时没应声。',
      };
      emit(failedEvent);
      return failedEvent;
    }
  }
}
