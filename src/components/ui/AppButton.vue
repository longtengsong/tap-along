<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'primary' | 'ghost' | 'text' | 'danger';
    size?: 'normal' | 'small';
    weak?: boolean;
    disabled?: boolean;
    type?: 'button' | 'submit';
  }>(),
  {
    variant: 'primary',
    size: 'normal',
    weak: false,
    disabled: false,
    type: 'button',
  },
);

const emit = defineEmits<{
  click: [event: MouseEvent];
}>();
</script>

<template>
  <button
    :type="type"
    class="button"
    :class="[`button--${variant}`, `button--${size}`, { 'button--weak': weak }]"
    :disabled="disabled"
    @click="emit('click', $event)"
  >
    <slot />
  </button>
</template>

<style scoped>
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  font: inherit;
  white-space: nowrap;
  cursor: pointer;
  transition:
    color 180ms ease,
    background-color 180ms ease,
    border-color 180ms ease,
    opacity 180ms ease,
    transform 120ms ease;
}

.button:focus-visible {
  outline: 2px solid var(--moss);
  outline-offset: 3px;
}

.button:active:not(:disabled) {
  transform: scale(0.98);
}

.button:disabled {
  opacity: 0.34;
  cursor: default;
}

.button--primary {
  height: 44px;
  padding: 0 30px;
  border-radius: 999px;
  background: var(--ink);
  color: #fcfbf8;
  font-size: 13.5px;
  letter-spacing: 0.08em;
}

.button--primary:hover:not(:disabled) {
  background: #3c3a34;
}

.button--small {
  height: 36px;
  padding: 0 20px;
  font-size: 12.5px;
  letter-spacing: 0.06em;
}

.button--ghost {
  height: 40px;
  padding: 0 21px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: transparent;
  color: var(--ink-soft);
  font-size: 13px;
  letter-spacing: 0.04em;
}

.button--ghost:hover:not(:disabled) {
  border-color: var(--ink-ghost);
  color: var(--ink);
}

.button--text {
  padding: 8px 12px;
  background: transparent;
  color: var(--ink-faint);
  font-size: 13px;
  letter-spacing: 0.04em;
}

.button--text:hover:not(:disabled) {
  color: var(--ink-soft);
}

.button--danger {
  height: 40px;
  padding: 0 21px;
  border-radius: 999px;
  background: #8e554b;
  color: #fffaf7;
  font-size: 13px;
  letter-spacing: 0.04em;
}

.button--danger:hover:not(:disabled) {
  background: #79453d;
}

.button--weak {
  color: var(--ink-ghost);
}

.button--weak:hover:not(:disabled) {
  color: var(--ink-faint);
}
</style>
