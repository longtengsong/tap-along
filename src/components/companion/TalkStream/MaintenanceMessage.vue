<script setup lang="ts">
import { useI18n } from 'vue-i18n';

defineProps<{
  text: string;
}>();

const { t } = useI18n();
</script>

<template>
  <div
    class="message message--maintenance"
    :aria-label="t('a11y.maintenanceMessage')"
  >
    {{ text }}
  </div>
</template>

<style scoped>
.message--maintenance {
  align-self: center;
  padding: 5px 14px;
  border-radius: 999px;
  background: var(--line-soft);
  color: var(--ink-faint);
  font-size: 11.5px;
  letter-spacing: 0.04em;
}
</style>
