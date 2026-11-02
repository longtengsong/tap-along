<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import AppButton from '@/components/ui/AppButton.vue';
import BaseOverlay from '@/components/ui/BaseOverlay.vue';

const { t } = useI18n();

const emit = defineEmits<{
  retry: [];
}>();
</script>

<template>
  <BaseOverlay>
    <p class="overlay-copy">{{ t('errors.teacherNoResponse') }}</p>
    <AppButton size="small" @click="emit('retry')">
      {{ t('errors.retry') }}
    </AppButton>
  </BaseOverlay>
</template>

<style scoped>
.overlay-copy {
  margin: 0;
  color: var(--ink-soft);
  font-size: 14.5px;
  line-height: 1.7;
  letter-spacing: 0.06em;
}
</style>
