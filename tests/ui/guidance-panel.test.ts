import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import GuidancePanel from '@/components/companion/GuidancePanel.vue';
import type { GuidanceView } from '@/shared/guidance';

const guidance = (overrides: Partial<GuidanceView> = {}): GuidanceView => ({
  status: 'needed',
  suggestions: [
    {
      id: 'g-2',
      relatedPageIds: [2],
      notes: [
        {
          pageId: 2,
          title: '注意力与任务',
          source: '课程',
          excerpt: '注意力需要主动分配。',
        },
      ],
      why: '旧页讨论主动分配，这页讨论有限。',
      question: '有限的是总量还是分配？',
      anchorQuote: '注意力',
      used: true,
    },
  ],
  bodyHash: 'hash',
  updatedAt: 1,
  ...overrides,
});

describe('GuidancePanel', () => {
  it('renders notes, why, anchor and background hint without the old CTA', () => {
    const wrapper = mount(GuidancePanel, {
      props: { guidance: guidance() },
    });

    expect(wrapper.text()).toContain('也许能接上');
    expect(wrapper.text()).toContain('从“注意力”这处接上');
    expect(wrapper.text()).toContain('《注意力与任务》');
    expect(wrapper.text()).toContain('旧页讨论主动分配，这页讨论有限。');
    expect(wrapper.text()).toContain('这些旧念头会作为背景一起带给伴读。');
    expect(wrapper.text()).not.toContain('顺着这条线问');
    expect(wrapper.findAll('button')).toHaveLength(0);
  });

  it('shows retry action for failed and no_candidates states', async () => {
    for (const status of ['failed', 'no_candidates'] as const) {
      const wrapper = mount(GuidancePanel, {
        props: {
          guidance: guidance({ status, suggestions: [] }),
          error: '模型暂时不可用',
        },
      });

      expect(wrapper.text()).toContain('这次没找到能接住的旧念头。');
      expect(wrapper.text()).toContain('模型暂时不可用');
      const button = wrapper.find('button');
      expect(button.text()).toBe('再找找');
      await button.trigger('click');
      expect(wrapper.emitted('retry')).toHaveLength(1);
      wrapper.unmount();
    }
  });

  it('renders pending and not_needed states', () => {
    const pending = mount(GuidancePanel, {
      props: { guidance: guidance({ status: 'pending', suggestions: [] }) },
    });
    expect(pending.text()).toContain('正在旧念头里找能接住的线');

    const notNeeded = mount(GuidancePanel, {
      props: { guidance: guidance({ status: 'not_needed', suggestions: [] }) },
    });
    expect(notNeeded.text()).toContain('这一轮先不硬接');
  });

  it('does not render anchor when missing', () => {
    const value = guidance();
    delete value.suggestions[0].anchorQuote;
    const wrapper = mount(GuidancePanel, { props: { guidance: value } });

    expect(wrapper.text()).not.toContain('这处接上');
  });
});
