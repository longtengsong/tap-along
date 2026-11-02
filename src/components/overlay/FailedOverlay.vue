<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import AppButton from '@/components/ui/AppButton.vue';
import BaseOverlay from '@/components/ui/BaseOverlay.vue';

const { t } = useI18n();

const emit = defineEmits<{
  back: [];
  retry: [];
}>();
</script>

<template>
  <BaseOverlay>
    <p class="overlay-copy">{{ t('overlay.failed') }}</p>
    <div class="overlay-actions">
      <AppButton variant="ghost" @click="emit('back')">
        {{ t('overlay.backToEdit') }}
      </AppButton>
      <AppButton size="small" @click="emit('retry')">
        {{ t('overlay.tryAgain') }}
      </AppButton>
    </div>
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

.overlay-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-top: 2px;
}
</style>
