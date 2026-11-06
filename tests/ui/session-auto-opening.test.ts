import { flushPromises } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

const guidanceCallbackRef = vi.hoisted(() => ({
  current: undefined as
    | ((event: {
        pageId: number;
        guidance: import('@/shared/guidance').GuidanceView;
      }) => void)
    | undefined,
}));

vi.mock('@/api/tap-along', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/tap-along')>();
  const request = {
    requestId: 'guidance-1-uuid',
    status: 'sent' as const,
    providerId: 'custom',
    model: 'guidance-model',
    messages: [{ role: 'system' as const, content: '真实 prompt' }],
    createdAt: 1,
  };
  const snapshot = {
    id: 1,
    title: '盲人摸象',
    body: '城里的居民都是盲人。',
    source: '课程',
    status: 'reading',
    parseStatus: 'pending',
    teachingRoundCount: 0,
    messages: [],
    guidance: {
      status: 'needed',
      suggestions: [
        {
          id: 'g-2',
          relatedPageIds: [2],
          notes: [
            {
              pageId: 2,
              title: '系统基模',
              source: '读书笔记',
              excerpt: '系统基模由三种元件构成。',
            },
          ],
          why: '两条笔记可以对照。',
          question: '你写的盲人摸象和系统基模能怎么对照？',
          requestId: 'guidance-1-uuid',
          used: true,
        },
      ],
      bodyHash: 'hash',
      updatedAt: 1,
    },
  };

  return {
    ...actual,
    tapAlongApi: {
      ...actual.tapAlongApi,
      supportsTeacherStreaming: () => false,
      supportsTitleUpdates: () => false,
      supportsGuidance: () => true,
      supportsGuidanceRefresh: () => true,
      onGuidanceUpdated: (
        callback: (event: {
          pageId: number;
          guidance: import('@/shared/guidance').GuidanceView;
        }) => void,
      ) => {
        guidanceCallbackRef.current = callback;
        return () => {};
      },
      listRecentPages: async () => [snapshot],
      inspectTeacherRequest: async () => ({ ok: true, request }),
      getPage: async () => ({ ok: true, page: snapshot }),
    },
  };
});

describe('session auto guidance opening', () => {
  it('appends the used guidance question exactly once', async () => {
    const { useSessionStore } = await import('@/stores/session');
    const store = useSessionStore();

    await flushPromises();
    expect(store.currentPage.value?.id).toBe(1);

    const event = {
      pageId: 1,
      guidance: store.currentPage.value!.guidance!,
    };

    guidanceCallbackRef.current?.(event);
    await flushPromises();

    const messages = store.currentPage.value!.messages;
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      role: 'teacher',
      requestId: 'guidance-1-uuid',
      text: '你写的盲人摸象和系统基模能怎么对照？',
    });

    guidanceCallbackRef.current?.(event);
    await flushPromises();
    expect(store.currentPage.value!.messages).toHaveLength(1);
  });
});
