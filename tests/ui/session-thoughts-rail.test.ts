import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import SessionThoughtsRail from '@/components/companion/SessionThoughtsRail.vue';
import type { ContextThought } from '@/shared/context';

const thought = (
  pageId: number,
  kind: ContextThought['kind'],
  overrides: Partial<ContextThought> = {},
): ContextThought => ({
  pageId,
  title: `念头 ${pageId}`,
  source: '课程',
  body: `念头 ${pageId} 的完整正文。`,
  kind,
  ...overrides,
});

const mountRail = (thoughts: ContextThought[], pageId = 1) =>
  mount(SessionThoughtsRail, {
    props: { pageId, thoughts },
  });

const article = (wrapper: ReturnType<typeof mountRail>, pageId: number) =>
  wrapper.find(`article[data-open]`).exists()
    ? wrapper
        .findAll('article')
        .find((item) => item.text().includes(`念头 ${pageId}`))!
    : undefined;

describe('SessionThoughtsRail', () => {
  it('renders line and branch groups with count and full body', () => {
    const wrapper = mountRail([
      thought(2, 'line'),
      thought(3, 'line'),
      thought(4, 'branch', { title: '另记的念头' }),
    ]);

    expect(wrapper.text()).toContain('这次会话的念头');
    expect(wrapper.text()).toContain('3');
    expect(wrapper.text()).toContain('这条线上的旧念头');
    expect(wrapper.text()).toContain('另记的念头');
    expect(wrapper.text()).toContain('念头 2 的完整正文。');
    expect(wrapper.text()).toContain('念头 3 的完整正文。');
    expect(wrapper.text()).toContain('念头 4 的完整正文。');
  });

  it('opens the newest branch by default, otherwise the first line', () => {
    const withBranch = mountRail([thought(2, 'line'), thought(4, 'branch')]);
    expect(
      article(withBranch, 2)!.find('button').attributes('aria-expanded'),
    ).toBe('false');
    expect(
      article(withBranch, 4)!.find('button').attributes('aria-expanded'),
    ).toBe('true');

    const lineOnly = mountRail([thought(2, 'line'), thought(3, 'line')]);
    expect(
      article(lineOnly, 2)!.find('button').attributes('aria-expanded'),
    ).toBe('true');
    expect(
      article(lineOnly, 3)!.find('button').attributes('aria-expanded'),
    ).toBe('false');
  });

  it('supports multiple open thoughts and toggles all', async () => {
    const wrapper = mountRail([thought(2, 'line'), thought(3, 'line')]);
    const secondButton = article(wrapper, 3)!.find('button');

    await secondButton.trigger('click');
    expect(
      article(wrapper, 2)!.find('button').attributes('aria-expanded'),
    ).toBe('true');
    expect(secondButton.attributes('aria-expanded')).toBe('true');

    const collapse = wrapper
      .findAll('button')
      .find((item) => item.text() === '全部收起')!;
    await collapse.trigger('click');
    expect(
      article(wrapper, 2)!.find('button').attributes('aria-expanded'),
    ).toBe('false');
    expect(
      article(wrapper, 3)!.find('button').attributes('aria-expanded'),
    ).toBe('false');

    const expand = wrapper
      .findAll('button')
      .find((item) => item.text() === '全部展开')!;
    await expand.trigger('click');
    expect(
      article(wrapper, 2)!.find('button').attributes('aria-expanded'),
    ).toBe('true');
    expect(
      article(wrapper, 3)!.find('button').attributes('aria-expanded'),
    ).toBe('true');
  });

  it('hides the full body with v-show and closes invalid ids on prop change', async () => {
    const wrapper = mountRail([thought(2, 'line'), thought(3, 'line')]);

    expect(
      (wrapper.find('#thought-body-3').element as HTMLElement).style.display,
    ).toBe('none');
    await article(wrapper, 3)!.find('button').trigger('click');
    expect(
      (wrapper.find('#thought-body-3').element as HTMLElement).style.display,
    ).not.toBe('none');

    await wrapper.setProps({
      pageId: 2,
      thoughts: [thought(3, 'line', { title: '新的念头' })],
    });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('#thought-body-2').exists()).toBe(false);
    expect(
      (wrapper.find('#thought-body-3').element as HTMLElement).style.display,
    ).not.toBe('none');
  });

  it('auto-opens a newly added branch without closing existing opens', async () => {
    const wrapper = mountRail([thought(2, 'line')]);
    expect(
      article(wrapper, 2)!.find('button').attributes('aria-expanded'),
    ).toBe('true');

    await wrapper.setProps({
      thoughts: [thought(2, 'line'), thought(4, 'branch')],
    });
    await wrapper.vm.$nextTick();

    expect(
      article(wrapper, 2)!.find('button').attributes('aria-expanded'),
    ).toBe('true');
    expect(
      article(wrapper, 4)!.find('button').attributes('aria-expanded'),
    ).toBe('true');
  });

  it('emits hide and renders aria controls/untitled fallback', async () => {
    const wrapper = mountRail([thought(2, 'line', { title: '', source: '' })]);
    const head = wrapper.find('button[aria-expanded]');
    expect(head.attributes('aria-controls')).toBe('thought-body-2');
    expect(wrapper.text()).toContain('未命名念头');

    const hide = wrapper.find('button[title="收起右侧"]');
    await hide.trigger('click');
    expect(wrapper.emitted('hide')).toHaveLength(1);
  });
});
