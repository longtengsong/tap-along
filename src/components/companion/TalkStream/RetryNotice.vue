<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import AppButton from '@/components/ui/AppButton.vue';

defineProps<{
  message: string;
}>();

const { t } = useI18n();

const emit = defineEmits<{
  retry: [];
}>();
</script>

<template>
  <div class="retry-notice" role="status">
    <span class="retry-notice__text">{{ message }}</span>
    <AppButton variant="text" size="small" @click="emit('retry')">
      {{ t('errors.retry') }}
    </AppButton>
  </div>
</template>

<style scoped>
.retry-notice {
  display: flex;
  align-items: center;
  align-self: flex-start;
  gap: 10px;
  max-width: 82%;
  padding-left: 2px;
  color: var(--ink-faint);
  font-size: 12.5px;
  line-height: 1.6;
  letter-spacing: 0.03em;
}

.retry-notice__text {
  min-width: 0;
}
</style>
