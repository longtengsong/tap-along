<script setup lang="ts">
import AppButton from '@/components/ui/AppButton.vue';
import AppInput from '@/components/ui/AppInput.vue';
import MaintenanceMenu from '@/components/companion/BottomBar/MaintenanceMenu.vue';
import type { ComposerMode } from '@/types/session';

const props = defineProps<{
  mode: ComposerMode;
  modelValue: string;
  typing: boolean;
  sayMoreOpen: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  submit: [];
  toggleSayMore: [];
  edit: [];
  append: [];
  newPage: [];
  close: [];
}>();

const placeholder = () =>
  props.mode === 'append' ? '补一句……' : '写下你的想法……';

const buttonText = () => (props.mode === 'append' ? '补一句' : '落笔');

const handleEnter = (event: KeyboardEvent) => {
  if (event.isComposing) {
    return;
  }

  event.preventDefault();
  emit('submit');
};
</script>

<template>
  <div class="composer">
    <div class="composer__slot">
      <Transition name="composer-switch" mode="out-in">
        <MaintenanceMenu
          v-if="sayMoreOpen"
          key="actions"
          class="composer__actions"
          @edit="emit('edit')"
          @append="emit('append')"
          @new-page="emit('newPage')"
          @close="emit('close')"
        />
        <div v-else key="input" class="composer__row">
          <AppInput
            :model-value="modelValue"
            :placeholder="placeholder()"
            aria-label="落笔处"
            @update:model-value="emit('update:modelValue', $event)"
            @keydown.enter="handleEnter"
          />
          <AppButton
            class="composer__send"
            size="small"
            :disabled="typing || !modelValue.trim()"
            @click="emit('submit')"
          >
            {{ buttonText() }}
          </AppButton>
        </div>
      </Transition>
    </div>
    <button
      class="composer__say-more"
      type="button"
      :aria-expanded="sayMoreOpen"
      @click="emit('toggleSayMore')"
    >
      想留一句？ <span aria-hidden>{{ sayMoreOpen ? '▴' : '▾' }}</span>
    </button>
  </div>
</template>

<style scoped>
.composer {
  flex-shrink: 0;
  padding: 14px 0 24px;
  border-top: 1px solid var(--line-soft);
}

.composer__slot {
  min-height: 46px;
}

.composer__row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 5px 5px 20px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--paper-raised);
  transition:
    border-color 180ms ease,
    box-shadow 180ms ease;
}

.composer__row:focus-within {
  border-color: var(--ink-ghost);
  box-shadow: 0 3px 16px -13px rgb(70 56 36 / 40%);
}

.composer__send {
  height: 34px;
}

.composer__actions {
  height: 46px;
}

.composer-switch-enter-active,
.composer-switch-leave-active {
  transition:
    opacity 140ms ease,
    transform 180ms var(--ease-out);
}

.composer-switch-enter-from {
  opacity: 0;
  transform: translateY(3px);
}

.composer-switch-leave-to {
  opacity: 0;
  transform: translateY(-3px);
}

.composer__say-more {
  display: block;
  margin: 8px auto 0;
  border: 0;
  padding: 6px 12px;
  background: none;
  color: var(--ink-ghost);
  font: inherit;
  font-size: 11.5px;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: color 180ms ease;
}

.composer__say-more:hover {
  color: var(--ink-faint);
}

.composer__say-more:focus-visible {
  border-radius: 4px;
  outline: 2px solid var(--moss);
  outline-offset: 2px;
}
</style>
