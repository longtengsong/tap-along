<script setup lang="ts">
defineProps<{
  text: string;
}>();
</script>

<template>
  <div class="message message--maintenance">{{ text }}</div>
</template>

<style scoped>
.message--maintenance {
  align-self: center;
  padding: 5px 14px;
  border-radius: 999px;
  background: var(--line-soft);
  color: var(--ink-faint);
  font-size: 11.5px;
  letter-spacing: 0.04em;
}
</style>
