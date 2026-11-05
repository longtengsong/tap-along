<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import type { PageStatus } from '@/types/session';

const props = defineProps<{
  title: string;
  source: string;
  status: PageStatus;
  canGenerate?: boolean;
  generating?: boolean;
  canEdit?: boolean;
  editing?: boolean;
  saving?: boolean;
  error?: string;
}>();

const { t } = useI18n();
const draft = ref('');
const input = ref<HTMLInputElement | null>(null);

watch(
  () => props.editing,
  async (editing) => {
    if (!editing) {
      return;
    }

    draft.value = props.title;
    await nextTick();
    input.value?.focus();
    input.value?.select();
  },
);

const emit = defineEmits<{
  generateTitle: [];
  startEdit: [];
  cancelEdit: [];
  saveEdit: [value: string];
}>();

const save = () => {
  emit('saveEdit', draft.value);
};
</script>

<template>
  <div class="page-card__title-row">
    <template v-if="editing">
      <input
        ref="input"
        v-model="draft"
        class="page-card__title-input"
        type="text"
        maxlength="60"
        :aria-label="t('companion.editTitle')"
        :disabled="saving"
        @keydown.enter.prevent="save"
        @keydown.esc.prevent="emit('cancelEdit')"
      />
      <button
        type="button"
        class="page-card__title-action page-card__title-action--accent"
        :disabled="saving"
        @click="save"
      >
        {{ saving ? t('common.loading') : t('companion.saveTitle') }}
      </button>
      <button
        type="button"
        class="page-card__title-action"
        :disabled="saving"
        @click="emit('cancelEdit')"
      >
        {{ t('common.cancel') }}
      </button>
    </template>

    <template v-else>
      <h2 class="page-card__title">{{ title }}</h2>
      <button
        v-if="canEdit"
        type="button"
        class="page-card__title-action page-card__title-action--icon"
        :title="t('companion.editTitle')"
        :aria-label="t('companion.editTitle')"
        :disabled="generating"
        @click="emit('startEdit')"
      >
        ✎
      </button>
      <button
        v-if="canGenerate"
        type="button"
        class="page-card__title-action"
        :disabled="generating"
        :aria-busy="generating"
        :title="t('companion.generateTitleHint')"
        @click="emit('generateTitle')"
      >
        <span class="page-card__title-action-icon" aria-hidden="true">✦</span>
        {{
          generating
            ? t('companion.generatingTitle')
            : t('companion.generateTitle')
        }}
      </button>
    </template>
  </div>
  <p v-if="error" class="page-card__title-error" role="alert">{{ error }}</p>
  <div class="page-card__meta">
    <span>{{ t('companion.sourcePrefix') }}{{ source || '—' }}</span>
    <StatusBadge :status="status" />
  </div>
</template>

<style scoped>
.page-card__title-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.page-card__title {
  flex: 1;
  min-width: 0;
  margin: 0;
  color: var(--ink);
  font-family: var(--serif);
  font-size: 18px;
  font-weight: 600;
  line-height: 1.5;
  letter-spacing: 0.02em;
}

.page-card__title-input {
  flex: 1;
  min-width: 0;
  padding: 2px 8px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--paper);
  color: var(--ink);
  font-family: var(--serif);
  font-size: 18px;
  font-weight: 600;
  line-height: 1.5;
  letter-spacing: 0.02em;
}

.page-card__title-input:focus-visible {
  outline: 2px solid var(--moss);
  outline-offset: 1px;
}

.page-card__title-action {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 5px;
  margin-top: 3px;
  padding: 3px 9px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: var(--ink-faint);
  font: inherit;
  font-size: 10.5px;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition:
    color 160ms ease,
    border-color 160ms ease,
    background-color 160ms ease;
}

.page-card__title-action:hover:not(:disabled) {
  border-color: var(--line);
  background: var(--paper);
  color: var(--moss);
}

.page-card__title-action:focus-visible {
  outline: 2px solid var(--moss);
  outline-offset: 2px;
}

.page-card__title-action:disabled {
  opacity: 0.6;
  cursor: default;
}

.page-card__title-action--icon {
  padding: 3px 7px;
  font-size: 12px;
  line-height: 1;
}

.page-card__title-action--accent {
  border-color: var(--line);
  background: var(--paper);
  color: var(--moss);
}

.page-card__title-action-icon {
  font-size: 10px;
  line-height: 1;
}

.page-card__title-error {
  margin: 6px 0 0;
  color: #96645a;
  font-size: 11px;
  line-height: 1.6;
}

.page-card__meta {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 7px;
  color: var(--ink-faint);
  font-size: 11.5px;
  letter-spacing: 0.03em;
}
</style>
