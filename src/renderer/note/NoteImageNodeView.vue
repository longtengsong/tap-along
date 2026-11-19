<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3';
import { i18n } from '@/i18n';

const props = defineProps(nodeViewProps);
const imageFailed = ref(false);

const imageId = computed(() =>
  typeof props.node.attrs.imageId === 'string'
    ? props.node.attrs.imageId.trim()
    : '',
);
const alt = computed(() =>
  typeof props.node.attrs.alt === 'string' ? props.node.attrs.alt : '',
);
const src = computed(() =>
  imageId.value ? `tap-image://img/${imageId.value}` : '',
);

watch(imageId, () => {
  imageFailed.value = false;
});
</script>

<template>
  <NodeViewWrapper
    as="span"
    class="note-image"
    :class="{ 'note-image--selected': selected }"
  >
    <span
      v-if="!imageId"
      class="note-image__pending"
      role="status"
      :aria-label="i18n.global.t('noteImage.uploading')"
    >
      <span class="note-image__pending-mark" aria-hidden="true"></span>
      <span>{{ i18n.global.t('noteImage.uploading') }}</span>
    </span>
    <span v-else-if="imageFailed" class="note-image__broken" role="status">
      {{ i18n.global.t('noteImage.broken') }}
    </span>
    <img
      v-else
      class="note-image__img"
      :src="src"
      :alt="alt"
      @error="imageFailed = true"
    />
  </NodeViewWrapper>
</template>

<style scoped>
.note-image {
  display: inline-block;
  max-width: 100%;
  margin: 6px 0;
  vertical-align: middle;
}

.note-image--selected {
  outline: 2px solid var(--moss);
  outline-offset: 3px;
  border-radius: 10px;
}

.note-image__img {
  display: block;
  max-width: 100%;
  height: auto;
  border-radius: 10px;
}

.note-image__pending,
.note-image__broken {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  padding: 14px 18px;
  border: 1px dashed var(--line);
  border-radius: 10px;
  background: var(--line-soft);
  color: var(--ink-faint);
  font-size: 12px;
  line-height: 1.4;
}

.note-image__pending-mark {
  width: 14px;
  height: 14px;
  border: 2px solid var(--line);
  border-top-color: var(--moss);
  border-radius: 50%;
  animation: image-spin 900ms linear infinite;
}

@keyframes image-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .note-image__pending-mark {
    animation: none;
  }
}
</style>
