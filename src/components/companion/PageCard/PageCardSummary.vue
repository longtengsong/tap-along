<script setup lang="ts">
defineProps<{
  body: string;
}>();
</script>

<template>
  <p class="page-card__summary">{{ body }}</p>
</template>

<style scoped>
.page-card__summary {
  display: -webkit-box;
  max-height: 4.2em;
  overflow: hidden;
  margin: 10px 0 0;
  color: var(--ink-soft);
  font-size: 13.5px;
  line-height: 1.75;
  white-space: pre-wrap;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
</style>
