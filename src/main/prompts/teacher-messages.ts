import type { PageSnapshot } from '../../shared/pages.ts';
import { PROMPT_CATALOG } from './catalog.ts';
import {
  buildCurrentPageContext,
  buildResumePageContext,
  toPageMessages,
  type ChatMessage,
} from './teacher-context.ts';

export interface TeacherPromptInput {
  page: PageSnapshot;
  userText: string;
  contextPage?: PageSnapshot;
  maintenanceKind?: 'edit' | 'append';
}

export const buildTeacherMessages = ({
  page,
  userText,
}: TeacherPromptInput): ChatMessage[] => {
  const messages: ChatMessage[] = [
    { role: 'system', content: PROMPT_CATALOG.teacher.system },
    { role: 'system', content: PROMPT_CATALOG.teacher.languagePolicy },
    { role: 'system', content: buildCurrentPageContext(page) },
    ...toPageMessages(page),
  ];
  const latest = messages.at(-1);

  if (latest?.role !== 'user' || latest.content !== userText) {
    messages.push({ role: 'user', content: userText });
  }

  return messages;
};

export const buildResumeTeacherMessages = ({
  page,
  contextPage,
  userText,
}: TeacherPromptInput & { contextPage: PageSnapshot }): ChatMessage[] => {
  const contextMessages = toPageMessages(contextPage);
  const targetMessages = toPageMessages(page);
  const messages: ChatMessage[] = [
    { role: 'system', content: PROMPT_CATALOG.teacher.system },
    { role: 'system', content: PROMPT_CATALOG.teacher.languagePolicy },
    { role: 'system', content: PROMPT_CATALOG.teacher.resume },
    {
      role: 'system',
      content: buildResumePageContext(contextPage, 'closedPage'),
    },
    ...contextMessages,
    {
      role: 'system',
      content: buildResumePageContext(page, 'targetPage'),
    },
    ...targetMessages,
  ];

  if (
    !contextMessages.some((message) => message.role === 'user') &&
    !targetMessages.some((message) => message.role === 'user')
  ) {
    messages.push({ role: 'user', content: userText });
  }

  return messages;
};

export const buildMaintenanceTeacherMessages = ({
  page,
  userText,
  maintenanceKind,
}: TeacherPromptInput & {
  maintenanceKind: 'edit' | 'append';
}): ChatMessage[] => {
  const action = PROMPT_CATALOG.teacher.maintenanceAction[maintenanceKind];

  return [
    { role: 'system', content: PROMPT_CATALOG.teacher.system },
    { role: 'system', content: PROMPT_CATALOG.teacher.languagePolicy },
    { role: 'system', content: PROMPT_CATALOG.teacher.maintenance },
    { role: 'system', content: action },
    { role: 'system', content: buildCurrentPageContext(page) },
    ...toPageMessages(page),
    { role: 'user', content: userText },
  ];
};

export const composeTeacherMessages = (
  input: TeacherPromptInput,
): ChatMessage[] => {
  if (input.maintenanceKind) {
    return buildMaintenanceTeacherMessages({
      ...input,
      maintenanceKind: input.maintenanceKind,
    });
  }

  if (input.contextPage) {
    return buildResumeTeacherMessages({
      ...input,
      contextPage: input.contextPage,
    });
  }

  return buildTeacherMessages(input);
};
