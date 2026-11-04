<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { tapAlongApi } from '@/api/tap-along';
import type { TeacherSource } from '@/shared/search';

defineProps<{
  sources: TeacherSource[];
}>();

const { t } = useI18n();
const failed = ref(false);

const open = async (url: string) => {
  failed.value = false;
  const result = await tapAlongApi.openExternal(url);

  if (!result.ok) {
    failed.value = true;
  }
};
</script>

<template>
  <div class="source-list">
    <p class="source-list__heading">{{ t('research.sources') }}</p>
    <ul class="source-list__items">
      <li v-for="source in sources" :key="source.index">
        <button
          type="button"
          class="source-list__item"
          @click="open(source.url)"
        >
          <span class="source-list__index">[{{ source.index }}]</span>
          <span class="source-list__title">{{ source.title }}</span>
          <span class="source-list__domain">{{ source.domain }}</span>
        </button>
      </li>
    </ul>
    <p v-if="failed" class="source-list__error" role="alert">
      {{ t('errors.externalUrlInvalid') }}
    </p>
  </div>
</template>

<style scoped>
.source-list {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--line-soft);
}

.source-list__heading {
  margin: 0 0 5px;
  color: var(--ink-ghost);
  font-size: 9.5px;
  letter-spacing: 0.08em;
}

.source-list__items {
  display: grid;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.source-list__item {
  display: flex;
  align-items: baseline;
  gap: 6px;
  width: 100%;
  padding: 3px 0;
  border: 0;
  background: transparent;
  color: var(--ink-faint);
  font: inherit;
  font-size: 10px;
  text-align: left;
  cursor: pointer;
}

.source-list__item:hover .source-list__title {
  color: var(--moss);
}

.source-list__item:focus-visible {
  outline: 2px solid var(--moss);
  outline-offset: 2px;
}

.source-list__index {
  flex: none;
  color: var(--ink-ghost);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 9px;
}

.source-list__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-list__domain {
  flex: none;
  margin-left: auto;
  color: var(--ink-ghost);
  font-size: 9px;
}

.source-list__error {
  margin: 5px 0 0;
  color: #96645a;
  font-size: 9.5px;
}
</style>
