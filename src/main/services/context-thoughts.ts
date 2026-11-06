import type { ContextThought } from '../../shared/context.ts';
import type { ClosedDescendantBody, PagesRepository } from '../db/pages.ts';
import type { PageSnapshot } from '../../shared/pages.ts';

type ContextThoughtsRepository = Pick<
  PagesRepository,
  'findById' | 'listClosedDescendantBodies'
>;

/**
 * 会话右栏的上下文清单。
 *
 * 顺序即“进入上下文的顺序”：
 * 1. guidance 接上的旧念头，按接点里的 relatedPageIds 顺序；
 * 2. 从当前页另记、后来合上的念头，按创建时间。
 *
 * 当前页本身不返回，它已经在会话中央的念头卡里。
 */
export const listContextThoughts = (
  repository: ContextThoughtsRepository,
  pageId: number,
): ContextThought[] => {
  if (!Number.isInteger(pageId) || pageId <= 0) {
    return [];
  }

  let page: PageSnapshot | null;
  try {
    page = repository.findById(pageId);
  } catch {
    return [];
  }

  if (!page || page.status !== 'reading') {
    return [];
  }

  const thoughts: ContextThought[] = [];
  const seen = new Set<number>();

  for (const suggestion of page.guidance?.suggestions ?? []) {
    for (const note of suggestion.notes) {
      if (seen.has(note.pageId)) {
        continue;
      }

      let related: PageSnapshot | null;
      try {
        related = repository.findById(note.pageId);
      } catch {
        related = null;
      }

      const body = (related?.body ?? note.excerpt ?? '').trim();

      if (!body) {
        continue;
      }

      seen.add(note.pageId);
      thoughts.push({
        pageId: note.pageId,
        title: related?.title ?? note.title,
        source: related?.source ?? note.source,
        body,
        kind: 'line',
      });
    }
  }

  let branches: ClosedDescendantBody[];
  try {
    branches = repository.listClosedDescendantBodies(pageId, false);
  } catch {
    branches = [];
  }

  branches
    .slice()
    .sort((left, right) => left.pageId - right.pageId)
    .forEach((branch) => {
      if (seen.has(branch.pageId)) {
        return;
      }

      let related: PageSnapshot | null;
      try {
        related = repository.findById(branch.pageId);
      } catch {
        related = null;
      }

      const body = (related?.body ?? branch.body).trim();

      if (!body) {
        return;
      }

      seen.add(branch.pageId);
      thoughts.push({
        pageId: branch.pageId,
        title: related?.title ?? '',
        source: related?.source ?? '',
        body,
        kind: 'branch',
      });
    });

  return thoughts;
};
