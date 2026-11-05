<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import AppButton from '@/components/ui/AppButton.vue';
import BaseOverlay from '@/components/ui/BaseOverlay.vue';

defineProps<{
  message: string;
}>();

const { t } = useI18n();

const emit = defineEmits<{
  openSettings: [];
  answerWithoutSearch: [];
}>();
</script>

<template>
  <BaseOverlay>
    <p class="overlay-copy">{{ message }}</p>
    <p class="overlay-hint">{{ t('overlay.searchUnavailableHint') }}</p>
    <div class="overlay-actions">
      <AppButton variant="ghost" @click="emit('openSettings')">
        {{ t('errors.openSettings') }}
      </AppButton>
      <AppButton size="small" @click="emit('answerWithoutSearch')">
        {{ t('overlay.answerWithoutSearch') }}
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

.overlay-hint {
  margin: 0;
  color: var(--ink-faint);
  font-size: 13px;
  line-height: 1.7;
  letter-spacing: 0.04em;
}

.overlay-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-top: 2px;
}
</style>
