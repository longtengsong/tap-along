import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import NoteEditor from '@/renderer/note/NoteEditor.vue';
import { docFromPlainText } from '@/shared/note-doc';

describe('NoteEditor', () => {
  it('应渲染传入的文档并挂载 ProseMirror', async () => {
    const wrapper = mount(NoteEditor, {
      props: {
        doc: docFromPlainText('注意力像带宽。'),
        ariaLabel: '正文',
        uploadImage: async () => ({
          ok: false,
          errorCode: 'IMAGE_SAVE_FAILED',
        }),
      },
    });

    await nextTick();
    await nextTick();

    const surface = wrapper.find('.ProseMirror');
    expect(surface.exists()).toBe(true);
    expect(surface.text()).toContain('注意力像带宽。');
    expect(surface.attributes('aria-label')).toBe('正文');

    wrapper.unmount();
  });
});
