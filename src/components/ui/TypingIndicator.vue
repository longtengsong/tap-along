<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
</script>

<template>
  <div class="typing" :aria-label="t('companion.typing')">
    <span></span>
    <span></span>
    <span></span>
  </div>
</template>

<style scoped>
.typing {
  display: flex;
  align-self: flex-start;
  gap: 5px;
  padding: 8px 0 4px;
}

.typing span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--ink-ghost);
  animation: blink 1.3s infinite;
}

.typing span:nth-child(2) {
  animation-delay: 180ms;
}

.typing span:nth-child(3) {
  animation-delay: 360ms;
}

@keyframes blink {
  0%,
  60%,
  100% {
    opacity: 0.3;
    transform: translateY(0);
  }

  30% {
    opacity: 1;
    transform: translateY(-1px);
  }
}
</style>
