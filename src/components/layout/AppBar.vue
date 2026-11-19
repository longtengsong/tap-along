<script setup lang="ts">
import { useI18n } from 'vue-i18n';

withDefaults(
  defineProps<{
    backVisible?: boolean;
    archiveVisible?: boolean;
    demoMode?: boolean;
  }>(),
  { archiveVisible: true, demoMode: false },
);

const { t } = useI18n();

const emit = defineEmits<{
  back: [];
  archive: [];
  settings: [];
}>();
</script>

<template>
  <header class="app-bar">
    <div v-if="demoMode" class="app-bar__demo" role="status" aria-live="polite">
      <span class="app-bar__demo-dot" aria-hidden="true"></span>
      <span class="app-bar__demo-text">{{ t('onboarding.demoBanner') }}</span>
      <button
        class="app-bar__demo-action"
        type="button"
        @click="emit('settings')"
      >
        {{ t('onboarding.demoBannerAction') }}
      </button>
    </div>

    <div class="app-bar__row">
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
          v-if="archiveVisible"
          class="app-bar__action"
          type="button"
          :aria-label="t('a11y.oldThoughts')"
          @click="emit('archive')"
        >
          {{ t('actions.oldThoughts') }}
        </button>
        <button
          class="app-bar__action"
          type="button"
          :aria-label="t('a11y.settings')"
          @click="emit('settings')"
        >
          {{ t('app.settings') }}
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.app-bar {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
}

.app-bar__demo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 6px 12px;
  min-height: 34px;
  padding: 6px 20px;
  border-bottom: 1px solid rgb(168 126 58 / 24%);
  background: #f7ead2;
  color: #7a5416;
  font-size: 11.5px;
  line-height: 1.5;
  letter-spacing: 0.03em;
  text-align: center;
}

.app-bar__demo-dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #a87e3a;
  box-shadow: 0 0 0 3px rgb(168 126 58 / 16%);
}

.app-bar__demo-action {
  flex: none;
  padding: 2px 9px;
  border: 1px solid currentColor;
  border-radius: 999px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 10.5px;
  letter-spacing: 0.03em;
  cursor: pointer;
}

.app-bar__demo-action:hover {
  background: rgb(168 126 58 / 10%);
}

.app-bar__demo-action:focus-visible {
  outline: 2px solid var(--moss);
  outline-offset: 3px;
}

.app-bar__row {
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
  display: flex;
  gap: 18px;
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
  .app-bar__row {
    padding: 0 20px;
  }
}
</style>
