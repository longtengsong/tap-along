import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import NoteEditor from '@/renderer/note/NoteEditor.vue';
import {
  IMAGE_PRIVACY_NOTICE_KEY,
  claimImagePrivacyNotice,
} from '@/renderer/note/image-privacy';
import { docFromPlainText, type NoteDoc } from '@/shared/note-doc';

const uploadImage = async () => ({
  ok: false as const,
  errorCode: 'IMAGE_SAVE_FAILED' as const,
});

const imageDoc: NoteDoc = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: '图文' },
        { type: 'noteImage', attrs: { imageId: 'image-1' } },
      ],
    },
  ],
};

describe('图片提示', () => {
  it('不支持图片且含图时应提示，不阻断编辑', async () => {
    const wrapper = mount(NoteEditor, {
      props: {
        doc: imageDoc,
        ariaLabel: '正文',
        imageCapability: 'unsupported',
        uploadImage,
      },
    });

    await nextTick();
    await nextTick();

    expect(wrapper.find('.note-editor__notice').exists()).toBe(true);
    expect(wrapper.text()).toContain('当前模型不支持图片输入');
    expect(wrapper.find('.ProseMirror').exists()).toBe(true);

    wrapper.unmount();
  });

  it('无图或能力未知时不应显示不支持提示', async () => {
    const wrapper = mount(NoteEditor, {
      props: {
        doc: docFromPlainText('纯文字'),
        ariaLabel: '正文',
        imageCapability: 'unsupported',
        uploadImage,
      },
    });

    await nextTick();
    expect(wrapper.find('.note-editor__notice').exists()).toBe(false);

    wrapper.unmount();
  });

  it('首次插图隐私提示只认领一次', () => {
    let value: string | null = null;
    const storage = {
      getItem() {
        return value;
      },
      setItem(_key: string, next: string) {
        value = next;
      },
    };

    expect(claimImagePrivacyNotice(storage)).toBe(true);
    expect(value).toBe('1');
    expect(claimImagePrivacyNotice(storage)).toBe(false);
    expect(IMAGE_PRIVACY_NOTICE_KEY).toBe('tap-along:image-privacy-notice');
  });
});
