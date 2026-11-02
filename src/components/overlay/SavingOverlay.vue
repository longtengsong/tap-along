<script setup lang="ts">
import BaseOverlay from '@/components/ui/BaseOverlay.vue';
import Spinner from '@/components/ui/Spinner.vue';
</script>

<template>
  <BaseOverlay>
    <Spinner />
    <p class="overlay-copy">正在收进页边……</p>
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
