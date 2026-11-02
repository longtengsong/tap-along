<script setup lang="ts">
import { useI18n } from 'vue-i18n';

defineProps<{
  backVisible?: boolean;
}>();

const { t } = useI18n();

const emit = defineEmits<{
  back: [];
  settings: [];
}>();
</script>

<template>
  <header class="app-bar">
    <div class="app-bar__side">
      <button
        v-if="backVisible"
        class="app-bar__action app-bar__back"
        type="button"
        :aria-label="t('a11y.back')"
        @click="emit('back')"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M13 8H3m4-4L3 8l4 4" />
        </svg>
        {{ t('common.back') }}
      </button>
    </div>

    <h1 class="app-bar__title">{{ t('app.name') }}</h1>

    <div class="app-bar__side app-bar__side--end">
      <button
        class="app-bar__action"
        type="button"
        :aria-label="t('a11y.settings')"
        @click="emit('settings')"
      >
        {{ t('app.settings') }}
      </button>
    </div>
  </header>
</template>

<style scoped>
.app-bar {
  flex: 0 0 58px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  height: 58px;
  padding: 0 32px;
}

.app-bar__side {
  justify-self: start;
}

.app-bar__side--end {
  justify-self: end;
}

.app-bar__title {
  margin: 0;
  color: var(--ink);
  font-family: var(--serif);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.13em;
  white-space: nowrap;
}

.app-bar__action {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 0;
  padding: 6px 0;
  background: transparent;
  color: var(--ink-soft);
  font: inherit;
  font-size: 12.5px;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: color 180ms ease;
}

.app-bar__action:hover {
  color: var(--ink);
}

.app-bar__action:focus-visible {
  border-radius: 4px;
  outline: 2px solid var(--moss);
  outline-offset: 4px;
}

.app-bar__action svg {
  width: 15px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.25;
}

@media (width <= 640px) {
  .app-bar {
    padding: 0 20px;
  }
}
</style>
