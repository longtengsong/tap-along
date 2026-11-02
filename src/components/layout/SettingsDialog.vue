<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { setLocale } from '@/i18n';
import type { SupportedLocale } from '@/i18n/locale';

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const { locale, t } = useI18n();
const dialog = ref<HTMLElement | null>(null);
const activeLocale = computed(() => locale.value as SupportedLocale);
let previousFocus: HTMLElement | null = null;

const close = () => emit('close');

const selectLocale = (nextLocale: SupportedLocale) => {
  setLocale(nextLocale);
};

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    close();
  }
};

watch(
  () => props.open,
  async (open) => {
    if (open) {
      previousFocus =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      document.addEventListener('keydown', handleKeydown);
      await nextTick();
      dialog.value?.focus();
      return;
    }

    document.removeEventListener('keydown', handleKeydown);
    previousFocus?.focus();
  },
);

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <Transition name="settings">
    <div v-if="open" class="settings-scrim" @mousedown.self="close">
      <section
        ref="dialog"
        class="settings-panel"
        role="dialog"
        aria-modal="true"
        :aria-label="t('a11y.settingsMenu')"
        tabindex="-1"
      >
        <header class="settings-panel__header">
          <div>
            <p class="settings-panel__eyebrow">TapAlong</p>
            <h2>{{ t('settings.title') }}</h2>
          </div>
          <button
            class="settings-panel__close"
            type="button"
            :aria-label="t('common.close')"
            @click="close"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <section class="settings-section" aria-labelledby="settings-language">
          <div class="settings-section__heading">
            <h3 id="settings-language">{{ t('settings.uiLanguage') }}</h3>
            <span>{{ t('app.settingsPanel') }}</span>
          </div>

          <div class="language-options">
            <button
              class="language-option"
              :class="{ 'language-option--active': activeLocale === 'zh-CN' }"
              type="button"
              :aria-pressed="activeLocale === 'zh-CN'"
              @click="selectLocale('zh-CN')"
            >
              <span>{{ t('settings.chinese') }}</span>
              <span class="language-option__check" aria-hidden="true">
                {{ activeLocale === 'zh-CN' ? '✓' : '' }}
              </span>
            </button>
            <button
              class="language-option"
              :class="{ 'language-option--active': activeLocale === 'en' }"
              type="button"
              :aria-pressed="activeLocale === 'en'"
              @click="selectLocale('en')"
            >
              <span>{{ t('settings.english') }}</span>
              <span class="language-option__check" aria-hidden="true">
                {{ activeLocale === 'en' ? '✓' : '' }}
              </span>
            </button>
          </div>
        </section>

        <section class="settings-privacy">
          <h3>{{ t('settings.privacy') }}</h3>
          <p>{{ t('settings.privacyText') }}</p>
        </section>
      </section>
    </div>
  </Transition>
</template>

<style scoped>
.settings-scrim {
  position: absolute;
  inset: 0;
  z-index: 70;
  display: grid;
  place-items: center;
  padding: 28px;
  background: rgb(38 34 27 / 18%);
  backdrop-filter: blur(3px);
}

.settings-panel {
  width: min(440px, 100%);
  border: 1px solid var(--line);
  border-radius: 18px;
  padding: 26px 28px 24px;
  background:
    radial-gradient(circle at 88% 4%, rgb(233 225 208 / 65%), transparent 34%),
    var(--paper-raised);
  box-shadow:
    0 1px 0 rgb(255 255 255 / 80%) inset,
    0 24px 60px -28px rgb(44 35 23 / 45%);
  outline: none;
}

.settings-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
}

.settings-panel__eyebrow {
  margin: 0 0 5px;
  color: var(--ink-faint);
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.settings-panel h2 {
  margin: 0;
  font-family: var(--serif);
  font-size: 21px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.settings-panel__close {
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 50%;
  background: var(--line-soft);
  color: var(--ink-faint);
  font: inherit;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  transition:
    color 180ms ease,
    background-color 180ms ease;
}

.settings-panel__close:hover {
  background: var(--line);
  color: var(--ink);
}

.settings-section {
  margin-top: 26px;
  padding-top: 20px;
  border-top: 1px solid var(--line-soft);
}

.settings-section__heading {
  display: grid;
  gap: 5px;
}

.settings-section h3,
.settings-privacy h3 {
  margin: 0;
  color: var(--ink);
  font-size: 12.5px;
  font-weight: 500;
  letter-spacing: 0.04em;
}

.settings-section__heading > span {
  color: var(--ink-faint);
  font-size: 11.5px;
  line-height: 1.6;
}

.language-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 13px;
}

.language-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 42px;
  padding: 0 14px;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: transparent;
  color: var(--ink-soft);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
  transition:
    color 180ms ease,
    border-color 180ms ease,
    background-color 180ms ease;
}

.language-option:hover {
  border-color: var(--ink-ghost);
  color: var(--ink);
}

.language-option--active {
  border-color: #c9d6cb;
  background: var(--moss-soft);
  color: var(--ink);
}

.language-option:focus-visible,
.settings-panel__close:focus-visible {
  outline: 2px solid var(--moss);
  outline-offset: 2px;
}

.language-option__check {
  color: var(--moss);
  font-size: 11px;
}

.settings-privacy {
  margin-top: 20px;
  padding: 14px 16px;
  border-radius: 12px;
  background: var(--paper-deep);
}

.settings-privacy p {
  margin: 6px 0 0;
  color: var(--ink-soft);
  font-size: 11.5px;
  line-height: 1.7;
}

.settings-enter-active,
.settings-leave-active {
  transition: opacity 180ms ease;
}

.settings-enter-active .settings-panel,
.settings-leave-active .settings-panel {
  transition: transform 220ms var(--ease-out);
}

.settings-enter-from,
.settings-leave-to {
  opacity: 0;
}

.settings-enter-from .settings-panel,
.settings-leave-to .settings-panel {
  transform: translateY(5px) scale(0.985);
}

@media (width <= 640px) {
  .settings-scrim {
    padding: 16px;
  }

  .settings-panel {
    padding: 22px 20px 20px;
  }
}
</style>
