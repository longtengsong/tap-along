<script setup lang="ts">
const emit = defineEmits<{
  edit: [];
  append: [];
  newPage: [];
  close: [];
}>();
</script>

<template>
  <div class="maintenance-menu" aria-label="页边维护">
    <button type="button" @click="emit('edit')">改批注</button>
    <button type="button" @click="emit('append')">补一句</button>
    <button type="button" @click="emit('newPage')">另起一页</button>
    <button class="maintenance-menu__weak" type="button" @click="emit('close')">
      合上这页
    </button>
  </div>
</template>

<style scoped>
.maintenance-menu {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  width: 100%;
  animation: menu-in 260ms var(--ease-out) both;
}

.maintenance-menu button {
  min-width: 0;
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--paper-raised);
  color: var(--ink-soft);
  font: inherit;
  font-size: 12.5px;
  letter-spacing: 0.04em;
  white-space: nowrap;
  cursor: pointer;
  transition:
    color 180ms ease,
    border-color 180ms ease,
    background-color 180ms ease;
}

.maintenance-menu button:hover {
  border-color: var(--ink-ghost);
  background: #fdfcfa;
  color: var(--ink);
}

.maintenance-menu button:focus-visible {
  outline: 2px solid var(--moss);
  outline-offset: 3px;
}

.maintenance-menu .maintenance-menu__weak {
  border-color: transparent;
  background: transparent;
  color: var(--ink-ghost);
}

.maintenance-menu .maintenance-menu__weak:hover {
  background: transparent;
  color: var(--ink-faint);
}

@keyframes menu-in {
  from {
    opacity: 0;
    transform: translateY(-5px);
  }
}
</style>
