import { mergeAttributes, Node } from '@tiptap/core';
import { VueNodeViewRenderer, type NodeViewProps } from '@tiptap/vue-3';
import type { Component } from 'vue';
import NoteImageNodeView from './NoteImageNodeView.vue';

export const NoteImage = Node.create({
  name: 'noteImage',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      imageId: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-image-id') ?? '',
        renderHTML: (attributes) => {
          const imageId =
            typeof attributes.imageId === 'string' ? attributes.imageId : '';

          return {
            'data-image-id': imageId,
            ...(imageId ? { src: `tap-image://img/${imageId}` } : {}),
          };
        },
      },
      alt: {
        default: null,
        parseHTML: (element) => element.getAttribute('alt'),
        renderHTML: (attributes) =>
          typeof attributes.alt === 'string' && attributes.alt
            ? { alt: attributes.alt }
            : {},
      },
      // 仅编辑器内使用；cloneNoteDoc / parseNoteDoc 不保留它
      pendingId: {
        default: null,
        parseHTML: () => null,
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'img[data-image-id]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(HTMLAttributes)];
  },

  addNodeView() {
    return VueNodeViewRenderer(
      NoteImageNodeView as unknown as Component<NodeViewProps>,
    );
  },
});
