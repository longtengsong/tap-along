<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import BaseOverlay from '@/components/ui/BaseOverlay.vue';
import Spinner from '@/components/ui/Spinner.vue';

const { t } = useI18n();
</script>

<template>
  <BaseOverlay>
    <Spinner />
    <p class="overlay-copy">{{ t('overlay.saving') }}</p>
  </BaseOverlay>
</template>

<style scoped>
.overlay-copy {
  margin: 0;
  color: var(--ink-soft);
  font-size: 14px;
  line-height: 1.7;
  letter-spacing: 0.07em;
}
</style>
