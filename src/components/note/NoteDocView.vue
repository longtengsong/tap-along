<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { NoteDoc, NoteInline } from '@/shared/note-doc';

defineProps<{
  doc: NoteDoc;
}>();

const emit = defineEmits<{
  'image-click': [imageId: string, alt: string];
}>();

const { t } = useI18n();

const openImage = (inline: NoteInline) => {
  if (inline.type !== 'noteImage') {
    return;
  }

  emit('image-click', inline.attrs.imageId, inline.attrs.alt ?? '');
};
</script>

<template>
  <div class="note-doc">
    <p
      v-for="(paragraph, paragraphIndex) in doc.content"
      :key="paragraphIndex"
      class="note-doc__paragraph"
    >
      <template
        v-for="(inline, inlineIndex) in paragraph.content ?? []"
        :key="inlineIndex"
      >
        <span v-if="inline.type === 'text'" class="note-doc__text">{{
          inline.text
        }}</span>
        <br v-else-if="inline.type === 'hardBreak'" />
        <button
          v-else
          type="button"
          class="note-doc__image-button"
          :aria-label="t('companion.viewImage')"
          @click="openImage(inline)"
        >
          <img
            class="note-doc__image"
            :src="`tap-image://img/${inline.attrs.imageId}`"
            :alt="inline.attrs.alt ?? ''"
          />
        </button>
      </template>
    </p>
  </div>
</template>

<style scoped>
.note-doc {
  color: var(--ink);
  font-size: 15px;
  line-height: 1.85;
}

.note-doc__paragraph {
  min-height: 1.85em;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.note-doc__paragraph + .note-doc__paragraph {
  margin-top: 0.55em;
}

.note-doc__text {
  white-space: pre-wrap;
}

.note-doc__image-button {
  display: block;
  max-width: 100%;
  margin: 8px 0;
  padding: 0;
  border: 0;
  border-radius: 10px;
  background: transparent;
  cursor: zoom-in;
}

.note-doc__image-button:focus-visible {
  outline: 2px solid var(--moss);
  outline-offset: 3px;
}

.note-doc__image {
  display: block;
  max-width: 100%;
  height: auto;
  border-radius: 10px;
}
</style>
