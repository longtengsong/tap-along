import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import NoteDocView from '@/components/note/NoteDocView.vue';
import type { NoteDoc } from '@/shared/note-doc';

const doc: NoteDoc = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: '图前' },
        { type: 'hardBreak' },
        { type: 'text', text: '换行后' },
        { type: 'noteImage', attrs: { imageId: 'image-1', alt: '示意图' } },
      ],
    },
    { type: 'paragraph' },
  ],
};

describe('NoteDocView', () => {
  it('应只读渲染文字、换行和图片', async () => {
    const wrapper = mount(NoteDocView, { props: { doc } });

    expect(wrapper.text()).toContain('图前');
    expect(wrapper.text()).toContain('换行后');
    expect(wrapper.findAll('br')).toHaveLength(1);

    const image = wrapper.find('img');
    expect(image.attributes('src')).toBe('tap-image://img/image-1');
    expect(image.attributes('alt')).toBe('示意图');
    expect(wrapper.findAll('p')).toHaveLength(2);
  });

  it('点击图片应发出 image-click', async () => {
    const wrapper = mount(NoteDocView, { props: { doc } });

    await wrapper.find('.note-doc__image-button').trigger('click');

    expect(wrapper.emitted('image-click')).toEqual([['image-1', '示意图']]);
  });
});
