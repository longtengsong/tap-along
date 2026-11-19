<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { EditorContent, useEditor } from '@tiptap/vue-3';
import type { JSONContent } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import HardBreak from '@tiptap/extension-hard-break';
import { History } from '@tiptap/extension-history';
import Paragraph from '@tiptap/extension-paragraph';
import Placeholder from '@tiptap/extension-placeholder';
import Text from '@tiptap/extension-text';
import { i18n } from '@/i18n';
import { ERROR_MESSAGE_KEYS, type AppErrorCode } from '@/shared/errors';
import { countNoteImages } from '@/shared/note-doc';
import type { ImageCapabilityStatus } from '@/shared/providers';
import type { NoteDoc } from '@/shared/note-doc';
import { NoteImage } from './note-image-node';
import { claimImagePrivacyNotice } from './image-privacy';
import {
  extractImageFiles,
  NoteImageUploader,
  type UploadPageImage,
} from './image-upload';

const props = withDefaults(
  defineProps<{
    doc: NoteDoc;
    ariaLabel: string;
    placeholder?: string;
    autofocus?: boolean;
    compact?: boolean;
    invalid?: boolean;
    imageCapability?: ImageCapabilityStatus;
    uploadImage: UploadPageImage;
  }>(),
  {
    placeholder: '',
    autofocus: false,
    compact: false,
    invalid: false,
    imageCapability: 'unknown',
  },
);

const emit = defineEmits<{
  'update:doc': [doc: NoteDoc];
  'uploading-change': [count: number];
  'image-error': [errorCode: AppErrorCode];
}>();

const imageError = ref<AppErrorCode | null>(null);
const showPrivacyNotice = ref(false);
const showUnsupportedNotice = computed(
  () =>
    props.imageCapability === 'unsupported' && countNoteImages(props.doc) > 0,
);
let uploader: NoteImageUploader | null = null;

const dismissPrivacyNotice = () => {
  showPrivacyNotice.value = false;
};

const editor = useEditor({
  extensions: [
    Document,
    Paragraph,
    Text,
    HardBreak,
    History,
    NoteImage,
    Placeholder.configure({
      placeholder: props.placeholder,
      showOnlyWhenEditable: true,
    }),
  ],
  content: props.doc as JSONContent,
  autofocus: props.autofocus ? 'end' : false,
  editorProps: {
    attributes: {
      role: 'textbox',
      'aria-multiline': 'true',
      'aria-label': props.ariaLabel,
      'aria-invalid': props.invalid ? 'true' : 'false',
      spellcheck: 'true',
    },
    handlePaste: (_view, event) => {
      const files = extractImageFiles(event.clipboardData);

      if (files.length === 0 || !uploader) {
        return false;
      }

      event.preventDefault();
      imageError.value = null;
      uploader.addFiles(files);
      return true;
    },
  },
  onUpdate: ({ editor: current }) => {
    emit('update:doc', current.getJSON() as unknown as NoteDoc);
  },
});

watch(
  editor,
  (instance) => {
    if (!instance) {
      uploader = null;
      return;
    }

    uploader = new NoteImageUploader(instance, props.uploadImage, {
      onUploadingChange: (count) => {
        emit('uploading-change', count);
      },
      onError: (errorCode) => {
        imageError.value = errorCode;
        emit('image-error', errorCode);
      },
      onImageUploaded: () => {
        if (claimImagePrivacyNotice(localStorage)) {
          showPrivacyNotice.value = true;
        }
      },
    });
  },
  { immediate: true },
);

watch(
  () => props.invalid,
  (invalid) => {
    editor.value?.view.dom.setAttribute(
      'aria-invalid',
      invalid ? 'true' : 'false',
    );
  },
);

const focus = () => {
  editor.value?.commands.focus();
};

defineExpose({ focus });
</script>

<template>
  <div
    class="note-editor"
    :class="{
      'note-editor--compact': compact,
      'note-editor--invalid': invalid,
    }"
  >
    <EditorContent :editor="editor" />
    <p v-if="imageError" class="note-editor__error" role="alert">
      {{ i18n.global.t(ERROR_MESSAGE_KEYS[imageError]) }}
    </p>
    <p v-if="showUnsupportedNotice" class="note-editor__notice" role="status">
      {{ i18n.global.t('noteImage.unsupportedNotice') }}
    </p>
    <div v-if="showPrivacyNotice" class="note-editor__privacy" role="status">
      <span>{{ i18n.global.t('noteImage.privacyNotice') }}</span>
      <button type="button" @click="dismissPrivacyNotice">
        {{ i18n.global.t('noteImage.privacyDismiss') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.note-editor {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  color: inherit;
  font: inherit;
  line-height: inherit;
}

.note-editor :deep(.ProseMirror) {
  flex: 1;
  min-height: 180px;
  outline: none;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.note-editor :deep(.ProseMirror p) {
  margin: 0;
}

.note-editor :deep(.ProseMirror p + p) {
  margin-top: 0.6em;
}

.note-editor :deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  float: left;
  height: 0;
  color: var(--ink-faint);
  pointer-events: none;
}

.note-editor--compact :deep(.ProseMirror) {
  min-height: 72px;
}

.note-editor--invalid {
  box-shadow: inset 0 0 0 1px #c99a8e;
}

.note-editor__error {
  margin: 8px 0 0;
  color: #8f6358;
  font-size: 12px;
  line-height: 1.5;
}

.note-editor__notice {
  margin: 8px 0 0;
  color: var(--ink-faint);
  font-size: 12px;
  line-height: 1.5;
}

.note-editor__privacy {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin: 8px 0 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--line-soft);
  color: var(--ink-soft);
  font-size: 11.5px;
  line-height: 1.55;
}

.note-editor__privacy button {
  flex-shrink: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--moss);
  font: inherit;
  cursor: pointer;
}
</style>
