<script setup lang="ts">
import AppButton from '@/components/ui/AppButton.vue';
import BaseOverlay from '@/components/ui/BaseOverlay.vue';

const emit = defineEmits<{
  retry: [];
}>();
</script>

<template>
  <BaseOverlay>
    <p class="overlay-copy">老师暂时没应声，要再试一次吗？</p>
    <AppButton size="small" @click="emit('retry')">再试一次</AppButton>
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
