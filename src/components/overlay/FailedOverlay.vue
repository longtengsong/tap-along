<script setup lang="ts">
import AppButton from '@/components/ui/AppButton.vue';
import BaseOverlay from '@/components/ui/BaseOverlay.vue';

const emit = defineEmits<{
  back: [];
  retry: [];
}>();
</script>

<template>
  <BaseOverlay>
    <p class="overlay-copy">这一句没送进去。</p>
    <div class="overlay-actions">
      <AppButton variant="ghost" @click="emit('back')">回到页边</AppButton>
      <AppButton size="small" @click="emit('retry')">再试一次</AppButton>
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
