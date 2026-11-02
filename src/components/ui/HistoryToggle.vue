<script setup lang="ts">
import { useI18n } from 'vue-i18n';

defineProps<{
  expanded: boolean;
}>();

const { t } = useI18n();

const emit = defineEmits<{
  toggle: [];
}>();
</script>

<template>
  <button class="history-toggle" type="button" @click="emit('toggle')">
    {{
      expanded
        ? t('companion.historyExpanded')
        : t('companion.historyCollapsed')
    }}
    <span aria-hidden>{{ expanded ? '▴' : '▸' }}</span>
  </button>
</template>

<style scoped>
.history-toggle {
  align-self: flex-start;
  display: inline-flex;
  gap: 7px;
  border: 0;
  padding: 2px 0;
  background: none;
  color: var(--ink-faint);
  font: inherit;
  font-size: 11.5px;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: color 180ms ease;
}

.history-toggle:hover {
  color: var(--ink-soft);
}

.history-toggle:focus-visible {
  border-radius: 4px;
  outline: 2px solid var(--moss);
  outline-offset: 3px;
}
</style>
