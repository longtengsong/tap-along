<script setup lang="ts">
import type { PageStatus } from '@/types/session';

defineProps<{
  status: PageStatus;
}>();

const labels: Record<PageStatus, string> = {
  reading: '在读',
  closed: '已合上',
  saving: '正在收进页边',
  failed: '没送进去',
};
</script>

<template>
  <span class="status-badge" :class="`status-badge--${status}`">
    <span v-if="status === 'closed'" class="status-badge__check" aria-hidden>
      ✓
    </span>
    <span v-else class="status-badge__dot" aria-hidden></span>
    {{ labels[status] }}
  </span>
</template>

<style scoped>
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--ink-faint);
  white-space: nowrap;
}

.status-badge__dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--ink-ghost);
}

.status-badge--reading .status-badge__dot {
  background: var(--moss);
  box-shadow: 0 0 0 3px rgb(79 118 93 / 8%);
}

.status-badge__check {
  color: var(--ink-faint);
  font-size: 9px;
  line-height: 1;
}
</style>
