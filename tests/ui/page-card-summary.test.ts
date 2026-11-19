import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import PageCardSummary from '@/components/companion/PageCard/PageCardSummary.vue';

describe('PageCardSummary', () => {
  it('应保留两行摘要并显示含图标记', async () => {
    const wrapper = mount(PageCardSummary, {
      props: { body: '第一行\n第二行\n第三行', imageCount: 2 },
    });

    expect(wrapper.text()).toContain('第一行');
    expect(wrapper.text()).toContain('含 2 张图');
    expect(wrapper.text()).toContain('查看全文');

    await wrapper.find('.page-card__full-text').trigger('click');
    expect(wrapper.emitted('open-full-text')).toHaveLength(1);
  });

  it('无图时不应显示含图标记', () => {
    const wrapper = mount(PageCardSummary, {
      props: { body: '纯文字', imageCount: 0 },
    });

    expect(wrapper.text()).not.toContain('含');
  });
});
