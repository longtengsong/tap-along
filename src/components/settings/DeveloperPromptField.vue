<script setup lang="ts">
import { computed, useId } from 'vue';

const props = defineProps<{
  label: string;
  description: string;
  defaultValue: string;
  resetLabel: string;
  modelValue: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  reset: [];
}>();

const characterCount = computed(() => props.modelValue.length);
const inputId = useId();
const isDefault = computed(() => props.modelValue === props.defaultValue);
const value = computed({
  get: () => props.modelValue,
  set: (nextValue: string) => emit('update:modelValue', nextValue),
});
</script>

<template>
  <div class="prompt-field">
    <span class="prompt-field__heading">
      <label :for="inputId">{{ label }}</label>
      <span class="prompt-field__tools">
        <button
          type="button"
          :disabled="isDefault"
          :aria-label="`${resetLabel}: ${label}`"
          @click="emit('reset')"
        >
          {{ resetLabel }}
        </button>
        <span>{{ characterCount }}</span>
      </span>
    </span>
    <span class="prompt-field__description">{{ description }}</span>
    <textarea
      :id="inputId"
      v-model="value"
      class="prompt-field__input"
      :aria-label="label"
      rows="6"
      spellcheck="false"
    ></textarea>
  </div>
</template>

<style scoped>
.prompt-field {
  display: grid;
  gap: 7px;
}

.prompt-field__heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
}

.prompt-field__heading > label {
  color: var(--ink);
  font-size: 12px;
  font-weight: 550;
  letter-spacing: 0.025em;
}

.prompt-field__tools {
  display: inline-flex;
  align-items: center;
  gap: 12px;
}

.prompt-field__tools > span {
  color: var(--ink-ghost);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 9.5px;
}

.prompt-field__tools button {
  padding: 2px 0;
  border: 0;
  background: transparent;
  color: var(--moss);
  font: inherit;
  font-size: 9.5px;
  cursor: pointer;
}

.prompt-field__tools button:hover:not(:disabled) {
  color: var(--ink);
}

.prompt-field__tools button:disabled {
  color: var(--ink-ghost);
  cursor: default;
}

.prompt-field__tools button:focus-visible {
  outline: 2px solid var(--moss);
  outline-offset: 2px;
}

.prompt-field__description {
  color: var(--ink-faint);
  font-size: 10.5px;
  line-height: 1.65;
}

.prompt-field__input {
  width: 100%;
  min-height: 118px;
  padding: 11px 12px;
  resize: vertical;
  border: 1px solid var(--line);
  border-radius: 9px;
  background:
    linear-gradient(rgb(255 254 250 / 86%), rgb(255 254 250 / 86%)),
    repeating-linear-gradient(
      0deg,
      transparent 0,
      transparent 20px,
      rgb(69 62 50 / 4%) 20px,
      rgb(69 62 50 / 4%) 21px
    );
  color: var(--ink-soft);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 10.5px;
  line-height: 1.6;
  tab-size: 2;
  transition:
    border-color 160ms ease,
    background-color 160ms ease;
}

.prompt-field__input:hover {
  border-color: var(--ink-ghost);
}

.prompt-field__input:focus-visible {
  outline: 2px solid var(--moss);
  outline-offset: 2px;
  border-color: transparent;
}
</style>
