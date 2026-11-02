<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue: string;
    placeholder?: string;
    ariaLabel?: string;
    disabled?: boolean;
  }>(),
  {
    placeholder: '',
    ariaLabel: '文本输入',
    disabled: false,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();
</script>

<template>
  <input
    class="input"
    type="text"
    :value="modelValue"
    :placeholder="placeholder"
    :aria-label="ariaLabel"
    :disabled="disabled"
    @input="
      emit('update:modelValue', ($event.target as HTMLInputElement).value)
    "
  />
</template>

<style scoped>
.input {
  width: 100%;
  border: 0;
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 14.5px;
  outline: none;
}

.input::placeholder {
  color: var(--ink-ghost);
}
</style>
