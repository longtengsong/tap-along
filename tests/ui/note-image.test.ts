import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import NoteEditor from '@/renderer/note/NoteEditor.vue';
import {
  compressImageFile,
  ImageCompressionError,
  isSupportedImageFile,
} from '@/renderer/note/image-compress';
import type { NoteDoc } from '@/shared/note-doc';

const imageDoc: NoteDoc = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: '图前' },
        { type: 'noteImage', attrs: { imageId: 'image-1', alt: '示意图' } },
        { type: 'text', text: '图后' },
      ],
    },
  ],
};

const uploadImage = async () => ({
  ok: false as const,
  errorCode: 'IMAGE_SAVE_FAILED' as const,
});

describe('NoteImage', () => {
  it('应在编辑器中渲染已上传图片', async () => {
    const wrapper = mount(NoteEditor, {
      props: {
        doc: imageDoc,
        ariaLabel: '正文',
        uploadImage,
      },
    });

    await nextTick();
    await nextTick();

    const image = wrapper.find('img[src="tap-image://img/image-1"]');
    expect(image.exists()).toBe(true);
    expect(image.attributes('alt')).toBe('示意图');

    wrapper.unmount();
  });

  it('应接受 PNG/JPEG/WebP 并拒绝 GIF', async () => {
    expect(
      isSupportedImageFile(
        new File([new Uint8Array([1])], 'a.png', { type: 'image/png' }),
      ),
    ).toBe(true);
    expect(
      isSupportedImageFile(
        new File([new Uint8Array([1])], 'a.jpg', { type: 'image/jpeg' }),
      ),
    ).toBe(true);
    expect(
      isSupportedImageFile(
        new File([new Uint8Array([1])], 'a.webp', { type: 'image/webp' }),
      ),
    ).toBe(true);
    expect(
      isSupportedImageFile(
        new File([new Uint8Array([1])], 'a.gif', { type: 'image/gif' }),
      ),
    ).toBe(false);
    expect(isSupportedImageFile(new File([new Uint8Array([1])], 'a.png'))).toBe(
      true,
    );
    expect(isSupportedImageFile(new File([new Uint8Array([1])], 'a.txt'))).toBe(
      false,
    );
  });

  it('GIF 压缩应抛出不支持错误', async () => {
    const file = new File([new Uint8Array([1])], 'a.gif', {
      type: 'image/gif',
    });

    await expect(compressImageFile(file)).rejects.toBeInstanceOf(
      ImageCompressionError,
    );
    await expect(compressImageFile(file)).rejects.toMatchObject({
      code: 'unsupported',
    });
  });
});
