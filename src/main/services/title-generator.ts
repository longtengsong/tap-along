import { buildTitleMessages } from '../prompts/title.ts';
import type { StructuredCompletion } from './structured-completion.ts';

/** 存储上限的前置约束；比提示词里的 20 字稍宽松，留给英文标题。 */
export const MAX_TITLE_LENGTH = 28;

export interface TitleGenerator {
  generate(body: string): Promise<string>;
}

const stripWrapping = (value: string) => {
  let result = value
    .replace(/^#{1,6}\s*/, '')
    .replace(/^(标题|题目|title)\s*[:：]\s*/i, '')
    .replace(/^[「『“"'(（[【]+/, '')
    .replace(/\s+/g, ' ')
    .trim();

  // 结尾常同时出现引号和句号，交替清理直到稳定。
  for (let pass = 0; pass < 2; pass += 1) {
    result = result
      .replace(/[。．.!！?？,，;；:：、~～]+$/u, '')
      .replace(/[」』”"')）\]】]+$/, '')
      .trim();
  }

  return result;
};

/** 模型常带引号、句号或代码块，统一清理后再落库。 */
export const normalizeTitle = (raw: string): string => {
  const withoutFence = raw.replace(/```[a-zA-Z]*/g, '').replace(/```/g, '');
  const firstLine =
    withoutFence
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? '';
  const title = stripWrapping(firstLine);

  return [...title].slice(0, MAX_TITLE_LENGTH).join('').trim();
};

export class ModelTitleGenerator implements TitleGenerator {
  private readonly completion: StructuredCompletion;

  constructor(completion: StructuredCompletion) {
    this.completion = completion;
  }

  async generate(body: string): Promise<string> {
    const content = await this.completion.complete(buildTitleMessages(body), {
      maxTokens: 64,
      timeoutMs: 8_000,
    });

    return normalizeTitle(content);
  }
}
