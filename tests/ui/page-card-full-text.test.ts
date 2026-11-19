import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import PageCardFullText from '@/components/companion/PageCardFullText.vue';
import type { NoteDoc } from '@/shared/note-doc';

const doc: NoteDoc = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: '全文正文' },
        { type: 'noteImage', attrs: { imageId: 'image-1', alt: '图' } },
      ],
    },
  ],
};

afterEach(() => {
  document.body.innerHTML = '';
  document.body.style.overflow = '';
});

describe('PageCardFullText', () => {
  it('应渲染标题、全文和图片', async () => {
    const wrapper = mount(PageCardFullText, {
      props: { title: '一条念头', doc },
      attachTo: document.body,
    });

    await nextTick();

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain('一条念头');
    expect(dialog?.textContent).toContain('全文正文');
    expect(
      document.querySelector('img[src="tap-image://img/image-1"]'),
    ).not.toBeNull();
    expect(document.body.style.overflow).toBe('hidden');

    wrapper.unmount();
  });

  it('Escape 和关闭按钮应关闭并恢复滚动', async () => {
    const wrapper = mount(PageCardFullText, {
      props: { title: '一条念头', doc },
      attachTo: document.body,
    });

    await nextTick();

    const dialog = document.querySelector('[role="dialog"]');
    dialog?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );

    expect(wrapper.emitted('close')).toHaveLength(1);

    wrapper.unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('点图片应转发 image-click', async () => {
    const wrapper = mount(PageCardFullText, {
      props: { title: '一条念头', doc },
      attachTo: document.body,
    });

    await nextTick();

    document
      .querySelector<HTMLButtonElement>('.note-doc__image-button')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(wrapper.emitted('image-click')).toEqual([['image-1', '图']]);

    wrapper.unmount();
  });
});
