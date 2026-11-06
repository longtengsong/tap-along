/**
 * 阅读页叠的恢复逻辑。
 *
 * 数据库里每页记录了自己的 parentPageId；应用重启后只拿到最新阅读页时，
 * 需要沿父链向上补齐 A → B → C，否则合上最上层页面就找不到该回到哪一页。
 */
export const MAX_PAGE_STACK_DEPTH = 20;

export interface ParentLinkedPage {
  id: number;
  parentPageId?: number | null;
  status: string;
}

/**
 * 从最新阅读页出发，按 parentPageId 还原整条页叠。
 * 返回顺序为根页 → 最新页，最后一页就是传入的 latest。
 *
 * - 已合上、不存在、读取失败的父页会截断链条，只保留已经确认的部分。
 * - 遇到环或超过深度上限时停止，避免坏数据导致死循环。
 */
export const collectReadingStack = async <Page extends ParentLinkedPage>(
  latest: Page,
  loadPage: (pageId: number) => Promise<Page | null>,
  maxDepth = MAX_PAGE_STACK_DEPTH,
): Promise<Page[]> => {
  const stack: Page[] = [latest];
  const seen = new Set<number>([latest.id]);
  let parentId = latest.parentPageId ?? null;

  while (parentId !== null && stack.length < maxDepth && !seen.has(parentId)) {
    let parent: Page | null = null;

    try {
      parent = await loadPage(parentId);
    } catch {
      // 单页读取失败不应阻断其余恢复；保留已经拿到的页叠。
      parent = null;
    }

    if (!parent || parent.status !== 'reading') {
      break;
    }

    seen.add(parent.id);
    stack.unshift(parent);
    parentId = parent.parentPageId ?? null;
  }

  return stack;
};
