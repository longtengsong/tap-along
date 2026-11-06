import {
  buildTitleMessages,
  type TitlePromptOptions,
} from '../prompts/title.ts';
import type { StructuredCompletion } from './structured-completion.ts';
import { MAX_TITLE_LENGTH, normalizeTitle } from './validators/title-output.ts';

export { MAX_TITLE_LENGTH, normalizeTitle };

export interface TitleGenerator {
  generate(body: string, options?: TitlePromptOptions): Promise<string>;
}

export class ModelTitleGenerator implements TitleGenerator {
  private readonly completion: StructuredCompletion;

  constructor(completion: StructuredCompletion) {
    this.completion = completion;
  }

  async generate(
    body: string,
    options: TitlePromptOptions = {},
  ): Promise<string> {
    const content = await this.completion.complete(
      buildTitleMessages(body, options),
      {
        maxTokens: 64,
        timeoutMs: 8_000,
      },
    );

    return normalizeTitle(content);
  }
}
