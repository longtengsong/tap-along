import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import ImageLightbox from '@/components/companion/ImageLightbox.vue';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('ImageLightbox', () => {
  it('应显示图片并在 Escape 时关闭', async () => {
    const wrapper = mount(ImageLightbox, {
      props: { src: 'tap-image://img/image-1', alt: '示意图' },
      attachTo: document.body,
    });

    await nextTick();

    const image = document.querySelector('img');
    expect(image?.getAttribute('src')).toBe('tap-image://img/image-1');
    expect(image?.getAttribute('alt')).toBe('示意图');

    document
      .querySelector('[role="dialog"]')
      ?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );

    expect(wrapper.emitted('close')).toHaveLength(1);

    wrapper.unmount();
  });

  it('关闭按钮应关闭', async () => {
    const wrapper = mount(ImageLightbox, {
      props: { src: 'tap-image://img/image-1', alt: '' },
      attachTo: document.body,
    });

    await nextTick();

    document
      .querySelector<HTMLButtonElement>('.lightbox__close')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(wrapper.emitted('close')).toHaveLength(1);

    wrapper.unmount();
  });
});
