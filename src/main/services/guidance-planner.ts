import type { PageSnapshot } from '../../shared/pages.ts';
import { buildGuidanceMessages } from '../prompts/guidance.ts';
import {
  createStructuredCompletion,
  type StructuredCompletion,
} from './structured-completion.ts';
import type { ProviderConfigService } from './providers.ts';
import type { RelatedNoteCandidate } from './related-notes.ts';
import type { TeacherRequestInspector } from './teacher-request-inspector.ts';
import {
  GuidanceOutputError,
  parseGuidanceOutput,
  type GuidanceDecision,
} from './validators/guidance-output.ts';

export type {
  GuidanceDecision,
  GuidanceDecisionSuggestion,
} from './validators/guidance-output.ts';
export { GuidanceOutputError } from './validators/guidance-output.ts';

type FetchLike = typeof fetch;

export interface GuidancePlanInput {
  page: PageSnapshot;
  candidates: RelatedNoteCandidate[];
  /** 模型请求的 requestId；由 GuidanceService 生成，用于开发者模式查看请求。 */
  requestId?: string;
}

export interface GuidancePlanner {
  plan(input: GuidancePlanInput): Promise<GuidanceDecision>;
}

interface GuidancePlannerOptions {
  configService: Pick<ProviderConfigService, 'resolveActive'>;
  completion?: StructuredCompletion;
  inspector?: Pick<
    TeacherRequestInspector,
    'recordSent' | 'recordFailed' | 'recordCompleted'
  >;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

export const createGuidancePlanner = ({
  configService,
  completion,
  inspector,
  fetchImpl,
  timeoutMs = 8_000,
}: GuidancePlannerOptions): GuidancePlanner => {
  const complete =
    completion ??
    createStructuredCompletion({
      configService,
      inspector,
      fetchImpl,
      timeoutMs,
    });

  return {
    async plan({ page, candidates, requestId }) {
      const baseMessages = buildGuidanceMessages({ page, candidates });

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const messages =
          attempt === 0
            ? baseMessages
            : [
                ...baseMessages,
                {
                  role: 'user' as const,
                  content:
                    'Your previous output was invalid. Return only a JSON object that matches the requested shape.',
                },
              ];
        const content = await complete.complete(messages, {
          maxTokens: 600,
          requestId,
          timeoutMs,
        });

        try {
          return parseGuidanceOutput(content, candidates);
        } catch (error) {
          if (!(error instanceof GuidanceOutputError) || attempt > 0) {
            throw error;
          }
        }
      }

      throw new GuidanceOutputError();
    },
  };
};
