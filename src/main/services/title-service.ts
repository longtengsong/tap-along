import type { AppErrorCode } from '../../shared/errors.ts';
import type { PageTitleUpdatedEvent } from '../../shared/pages.ts';
import { deriveFallbackTitle, type PagesRepository } from '../db/pages.ts';
import type { TitleGenerator } from './title-generator.ts';

type TitleRepository = Pick<PagesRepository, 'findById' | 'updateTitle'>;
type TitleEmitter = (event: PageTitleUpdatedEvent) => void;

/** 自动生成时太短的念头没有提炼空间，保留截断标题更像原话。 */
const MIN_BODY_LENGTH = 8;
const MAX_ATTEMPTS = 3;

export type TitleGeneration =
  | { ok: true; title: string }
  | { ok: false; errorCode: AppErrorCode };

const errorCodeFor = (error: unknown): AppErrorCode => {
  if (
    error &&
    typeof error === 'object' &&
    'errorCode' in error &&
    typeof (error as { errorCode?: unknown }).errorCode === 'string'
  ) {
    return (error as { errorCode: AppErrorCode }).errorCode;
  }

  return 'PROVIDER_REQUEST_FAILED';
};

/**
 * 用模型生成念头标题。
 *
 * 保存、补一句、改批注之后会在后台自动跑一次；用户也可以在标题旁
 * 手动点「提炼标题」重新生成。失败或模型未配置时保留截断标题，
 * 自动路径不向界面报错；手动路径把错误交给按钮展示。
 */
export class TitleService {
  private readonly repository: TitleRepository;
  private readonly generator: TitleGenerator;
  private readonly inFlight = new Map<number, Promise<void>>();
  private readonly pendingRerun = new Set<number>();

  constructor(repository: TitleRepository, generator: TitleGenerator) {
    this.repository = repository;
    this.generator = generator;
  }

  run(pageId: number, emit: TitleEmitter): Promise<void> {
    if (!Number.isInteger(pageId) || pageId <= 0) {
      return Promise.resolve();
    }

    const running = this.inFlight.get(pageId);

    if (running) {
      this.pendingRerun.add(pageId);
      return running;
    }

    const task = this.execute(pageId, emit)
      .catch((error: unknown) => {
        console.error('生成标题失败：', error);
      })
      .finally(() => {
        if (this.inFlight.get(pageId) === task) {
          this.inFlight.delete(pageId);
        }

        if (this.pendingRerun.delete(pageId)) {
          void this.run(pageId, emit);
        }
      });

    this.inFlight.set(pageId, task);
    return task;
  }

  /**
   * 用户手动触发的标题生成：同步返回结果，失败原因交给按钮提示。
   * 正文在生成期间被改过时最多重试 `MAX_ATTEMPTS` 次。
   */
  async generate(pageId: number): Promise<TitleGeneration> {
    if (!Number.isInteger(pageId) || pageId <= 0) {
      return { ok: false, errorCode: 'INVALID_PAGE_ID' };
    }

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const page = this.repository.findById(pageId);

      if (!page) {
        return { ok: false, errorCode: 'PAGE_NOT_FOUND' };
      }

      const body = page.body.trim();

      if (!body) {
        return { ok: false, errorCode: 'INVALID_BODY' };
      }

      const avoid =
        page.title && page.title !== deriveFallbackTitle(page.body)
          ? page.title
          : undefined;
      let title: string;

      try {
        title = (await this.generator.generate(body, { avoid })).trim();
      } catch (error) {
        console.error('生成标题失败：', error);
        return { ok: false, errorCode: errorCodeFor(error) };
      }

      if (!title) {
        return { ok: false, errorCode: 'PROVIDER_REQUEST_FAILED' };
      }

      const current = this.repository.findById(pageId);

      if (!current) {
        return { ok: false, errorCode: 'PAGE_NOT_FOUND' };
      }

      if (current.body.trim() !== body) {
        continue;
      }

      const updated = this.repository.updateTitle(pageId, title, 'model');

      if (!updated) {
        return { ok: false, errorCode: 'SAVE_FAILED' };
      }

      return { ok: true, title: updated.title };
    }

    return { ok: false, errorCode: 'SAVE_FAILED' };
  }

  private async execute(pageId: number, emit: TitleEmitter) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const page = this.repository.findById(pageId);

      if (!page || page.status !== 'reading' || page.titleSource === 'user') {
        return;
      }

      const body = page.body.trim();

      if (body.length < MIN_BODY_LENGTH) {
        return;
      }

      let title: string;

      try {
        title = (await this.generator.generate(body)).trim();
      } catch (error) {
        console.error('生成标题失败：', error);
        return;
      }

      if (!title) {
        return;
      }

      const current = this.repository.findById(pageId);

      if (
        !current ||
        current.status !== 'reading' ||
        current.titleSource === 'user'
      ) {
        return;
      }

      if (current.body.trim() !== body) {
        continue;
      }

      const updated = this.repository.updateTitle(pageId, title, 'model');

      if (!updated) {
        return;
      }

      emit({ pageId, title: updated.title });
      return;
    }
  }
}
