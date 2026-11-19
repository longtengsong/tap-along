<script setup lang="ts">
import { useI18n } from 'vue-i18n';

withDefaults(
  defineProps<{
    body: string;
    imageCount?: number;
  }>(),
  {
    imageCount: 0,
  },
);

const emit = defineEmits<{
  'open-full-text': [];
}>();

const { t } = useI18n();
</script>

<template>
  <div class="page-card__summary-wrap">
    <p class="page-card__summary">{{ body }}</p>
    <div class="page-card__summary-actions">
      <span v-if="imageCount > 0" class="page-card__image-count">
        {{ t('companion.containsImages', { count: imageCount }) }}
      </span>
      <button
        type="button"
        class="page-card__full-text"
        @click="emit('open-full-text')"
      >
        {{ t('companion.fullText') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.page-card__summary-wrap {
  margin-top: 10px;
}

.page-card__summary {
  display: -webkit-box;
  max-height: 4.2em;
  overflow: hidden;
  margin: 0;
  color: var(--ink-soft);
  font-size: 13.5px;
  line-height: 1.75;
  white-space: pre-wrap;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.page-card__summary-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 8px;
}

.page-card__image-count {
  color: var(--ink-faint);
  font-size: 11.5px;
  letter-spacing: 0.04em;
}

.page-card__full-text {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--moss);
  font: inherit;
  font-size: 12px;
  letter-spacing: 0.04em;
  cursor: pointer;
}

.page-card__full-text:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}

.page-card__full-text:focus-visible {
  outline: 2px solid var(--moss);
  outline-offset: 3px;
  border-radius: 4px;
}
</style>
