<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
</script>

<template>
  <p class="closed-note">{{ t('companion.closedNote') }}</p>
</template>

<style scoped>
.closed-note {
  flex-shrink: 0;
  margin: 0;
  padding: 20px 0 28px;
  color: var(--ink-ghost);
  font-size: 12px;
  letter-spacing: 0.1em;
  text-align: center;
}
</style>
