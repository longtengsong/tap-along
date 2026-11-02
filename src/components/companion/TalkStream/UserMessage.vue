<script setup lang="ts">
defineProps<{
  text: string;
}>();
</script>

<template>
  <div class="message message--user">{{ text }}</div>
</template>

<style scoped>
.message--user {
  max-width: 76%;
  align-self: flex-end;
  padding: 11px 16px;
  border-radius: 14px 14px 4px 14px;
  background: var(--user-bubble);
  color: var(--ink);
  font-size: 14.5px;
  line-height: 1.7;
  white-space: pre-wrap;
  box-shadow: 0 1px 0 rgb(255 255 255 / 45%) inset;
}
</style>
