<script setup lang="ts">
defineProps<{
  text: string;
}>();
</script>

<template>
  <p class="notice" role="status">{{ text }}</p>
</template>

<style scoped>
.notice {
  flex-shrink: 0;
  margin: 0 0 2px;
  padding: 11px 18px;
  border-radius: 12px;
  background: var(--line-soft);
  color: var(--ink-soft);
  font-size: 12.5px;
  line-height: 1.6;
  letter-spacing: 0.02em;
  text-align: center;
}
</style>
