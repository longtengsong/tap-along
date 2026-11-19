import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import CompanionScreen from '@/components/companion/CompanionScreen.vue';
import type { PageRecord } from '@/types/session';

vi.mock('@/api/tap-along', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/tap-along')>();
  const request = {
    requestId: 'guidance-1-uuid',
    status: 'sent' as const,
    providerId: 'custom',
    model: 'guidance-model',
    messages: [
      { role: 'system' as const, content: '真实的 guidance prompt' },
      { role: 'user' as const, content: '当前念头与旧念头' },
    ],
    createdAt: 1,
  };

  return {
    ...actual,
    tapAlongApi: {
      ...actual.tapAlongApi,
      supportsContextThoughts: () => false,
      inspectTeacherRequest: async () => ({ ok: true, request }),
    },
  };
});

const page: PageRecord = {
  id: 1,
  parentPageId: null,
  title: '盲人摸象',
  body: '在古尔城旁边，有一座城市，城里的居民都是盲人。',
  source: '课程',
  status: 'reading',
  messages: [
    {
      id: 'guidance-1-uuid',
      role: 'teacher',
      text: '你写的“盲人摸象”和你之前系统基模的笔记，能怎么互相对照？',
      suggestClose: false,
      requestId: 'guidance-1-uuid',
    },
  ],
  teacherTurn: 0,
  guidance: {
    status: 'needed',
    suggestions: [
      {
        id: 'g-2',
        relatedPageIds: [2],
        notes: [
          {
            pageId: 2,
            title: '系统基模的三种基本元件',
            source: '读书笔记',
            excerpt: '系统基模可以理解为系统的基本模型。',
          },
        ],
        why: '新笔记说不能靠部分认识整体，旧笔记给出整体由哪些元件构成。',
        question: '你写的“盲人摸象”和你之前系统基模的笔记，能怎么互相对照？',
        requestId: 'guidance-1-uuid',
        used: true,
      },
    ],
    bodyHash: 'hash',
    updatedAt: 1,
  },
  editing: false,
  historyOpen: false,
  suggestClose: false,
};

const mountScreen = async (demoMode = false) => {
  const wrapper = mount(CompanionScreen, {
    props: {
      page,
      developerMode: true,
      typing: false,
      canBack: false,
      archiveVisible: true,
      demoMode,
      composerMode: 'normal',
      replyDraft: '',
      sayMoreOpen: false,
      canCancel: false,
      cancelling: false,
      retryableTurn: null,
      canGenerateTitle: true,
      canEditTitle: true,
    },
    global: {
      stubs: {
        AppBar: true,
        BottomBar: true,
        PageCard: true,
      },
    },
  });

  await flushPromises();
  return wrapper;
};

describe('CompanionScreen auto question', () => {
  it('shows the auto question and filtered thoughts rail without the old CTA', async () => {
    const wrapper = await mountScreen();

    expect(wrapper.text()).toContain('盲人摸象');
    expect(wrapper.text()).toContain('你写的“盲人摸象”');
    expect(wrapper.text()).toContain('这些旧念头会作为背景一起带给伴读。');
    expect(wrapper.text()).toContain('系统基模的三种基本元件');
    expect(wrapper.text()).toContain('系统基模可以理解为系统的基本模型。');
    expect(wrapper.text()).not.toContain('顺着这条线问');
  });

  it('offers request inspection for the auto question when a record exists', async () => {
    const wrapper = await mountScreen();
    const inspect = wrapper
      .findAll('button')
      .find((item) => item.text().includes('查看请求'));

    expect(inspect).toBeDefined();

    await inspect!.trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('发送给 LLM 的 Messages');
    expect(wrapper.text()).toContain('真实的 guidance prompt');
  });

  it('marks teacher replies as demo output when demo mode is on', async () => {
    const wrapper = await mountScreen(true);

    expect(wrapper.text()).toContain('演示回复 · 固定话术');
  });
});
