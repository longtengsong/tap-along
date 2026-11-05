import type { PageTitleUpdatedEvent } from '../../shared/pages.ts';
import type { PagesRepository } from '../db/pages.ts';
import type { TitleGenerator } from './title-generator.ts';

type TitleRepository = Pick<PagesRepository, 'findById' | 'updateTitle'>;
type TitleEmitter = (event: PageTitleUpdatedEvent) => void;

/** 太短的念头没有提炼空间，保留截断标题更像原话。 */
const MIN_BODY_LENGTH = 8;
const MAX_ATTEMPTS = 3;

/**
 * 页面保存后异步用模型补写标题。
 *
 * 标题不是关键路径：失败、模型未配置或正文太短时保留截断标题，
 * 不向界面报错。生成期间正文被改过则丢弃结果并重算，避免标题
 * 和正文对不上。
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

  private async execute(pageId: number, emit: TitleEmitter) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const page = this.repository.findById(pageId);

      if (!page || page.status !== 'reading') {
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

      if (!current || current.status !== 'reading') {
        return;
      }

      if (current.body.trim() !== body) {
        continue;
      }

      const updated = this.repository.updateTitle(pageId, title);

      if (!updated) {
        return;
      }

      emit({ pageId, title: updated.title });
      return;
    }
  }
}
