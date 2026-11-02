<script setup lang="ts">
import { ref } from 'vue';

withDefaults(
  defineProps<{
    modelValue: string;
    placeholder?: string;
    ariaLabel?: string;
    disabled?: boolean;
    autofocus?: boolean;
    invalid?: boolean;
  }>(),
  {
    placeholder: '',
    ariaLabel: '文本输入',
    disabled: false,
    autofocus: false,
    invalid: false,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const textarea = ref<HTMLTextAreaElement | null>(null);

const focus = () => textarea.value?.focus();

defineExpose({ focus });
</script>

<template>
  <textarea
    ref="textarea"
    class="text-area"
    :value="modelValue"
    :placeholder="placeholder"
    :aria-label="ariaLabel"
    :aria-invalid="invalid"
    :disabled="disabled"
    :autofocus="autofocus"
    @input="
      emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)
    "
  />
</template>

<style scoped>
.text-area {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--paper-raised);
  color: var(--ink);
  font-family: var(--serif);
  font-size: 16px;
  line-height: 1.9;
  outline: none;
  resize: none;
  transition:
    border-color 220ms ease,
    box-shadow 220ms ease;
}

.text-area::placeholder {
  color: var(--ink-ghost);
}

.text-area:hover {
  border-color: #d7d1c6;
}

.text-area:focus {
  border-color: #c6beb0;
  box-shadow: 0 4px 18px -12px rgb(70 56 36 / 34%);
}

.text-area[aria-invalid='true'] {
  border-color: #c6a59d;
}
</style>
