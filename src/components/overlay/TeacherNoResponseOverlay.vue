<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import AppButton from '@/components/ui/AppButton.vue';
import BaseOverlay from '@/components/ui/BaseOverlay.vue';

defineProps<{
  message: string;
}>();

const { t } = useI18n();

const emit = defineEmits<{
  retry: [];
  openSettings: [];
}>();
</script>

<template>
  <BaseOverlay>
    <p class="overlay-copy">{{ message }}</p>
    <div class="overlay-actions">
      <AppButton variant="ghost" @click="emit('openSettings')">
        {{ t('errors.openModelSettings') }}
      </AppButton>
      <AppButton size="small" @click="emit('retry')">
        {{ t('errors.retry') }}
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
}
</style>
