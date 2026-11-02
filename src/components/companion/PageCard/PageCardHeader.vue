<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import type { PageStatus } from '@/types/session';

const { t } = useI18n();

defineProps<{
  title: string;
  source: string;
  status: PageStatus;
}>();
</script>

<template>
  <h2 class="page-card__title">{{ title }}</h2>
  <div class="page-card__meta">
    <span>{{ t('companion.sourcePrefix') }}{{ source || '—' }}</span>
    <StatusBadge :status="status" />
  </div>
</template>

<style scoped>
.page-card__title {
  margin: 0;
  color: var(--ink);
  font-family: var(--serif);
  font-size: 18px;
  font-weight: 600;
  line-height: 1.5;
  letter-spacing: 0.02em;
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
