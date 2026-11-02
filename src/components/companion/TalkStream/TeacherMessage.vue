<script setup lang="ts">
import { useI18n } from 'vue-i18n';

defineProps<{
  text: string;
  suggestClose?: boolean;
}>();

const { t } = useI18n();
</script>

<template>
  <div
    class="message message--teacher"
    :class="{ 'message--suggestion': suggestClose }"
    :aria-label="t('a11y.teacherMessage')"
  >
    {{ text }}
  </div>
</template>

<style scoped>
.message {
  max-width: 82%;
  align-self: flex-start;
  white-space: pre-wrap;
}

.message--teacher {
  color: var(--ink);
  font-family: var(--serif);
  font-size: 15.5px;
  line-height: 1.9;
  letter-spacing: 0.01em;
}

.message--suggestion {
  position: relative;
  padding-left: 14px;
}

.message--suggestion::before {
  position: absolute;
  top: 0.52em;
  bottom: 0.52em;
  left: 0;
  width: 2px;
  border-radius: 2px;
  background: var(--moss-soft);
  content: '';
}
</style>
