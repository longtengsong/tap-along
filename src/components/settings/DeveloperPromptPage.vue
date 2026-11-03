<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, toRaw, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { developerPromptsApi } from '@/api/developer-prompts';
import DeveloperPromptEditor from '@/components/settings/DeveloperPromptEditor.vue';
import AppButton from '@/components/ui/AppButton.vue';
import { ERROR_MESSAGE_KEYS } from '@/shared/errors';
import type { PromptCatalogValues } from '@/shared/prompts';

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const { t } = useI18n();
const page = ref<HTMLElement | null>(null);
const leaveDialog = ref<HTMLElement | null>(null);
const prompts = ref<PromptCatalogValues | null>(null);
const defaults = ref<PromptCatalogValues | null>(null);
const originalSnapshot = ref<string | null>(null);
const baseVersion = ref('');
const hasSavedProfile = ref(false);
const loading = ref(false);
const saving = ref(false);
const resetting = ref(false);
const confirmingReset = ref(false);
const leaveConfirming = ref(false);
const message = ref('');
const error = ref('');
let previousFocus: HTMLElement | null = null;

const hasUnsavedChanges = computed(
  () =>
    prompts.value !== null &&
    originalSnapshot.value !== null &&
    JSON.stringify(prompts.value) !== originalSnapshot.value,
);

const applyResult = (
  result: Awaited<ReturnType<typeof developerPromptsApi.get>>,
) => {
  if (!result.ok || !result.prompts || !result.defaultPrompts) {
    error.value = t(ERROR_MESSAGE_KEYS[result.errorCode ?? 'UNKNOWN_ERROR']);
    return false;
  }

  prompts.value = structuredClone(result.prompts);
  defaults.value = structuredClone(result.defaultPrompts);
  originalSnapshot.value = JSON.stringify(prompts.value);
  baseVersion.value = result.basePromptVersion ?? '';
  hasSavedProfile.value = result.hasSavedProfile === true;
  confirmingReset.value = false;
  leaveConfirming.value = false;
  return true;
};

const loadPrompts = async () => {
  loading.value = true;
  prompts.value = null;
  defaults.value = null;
  originalSnapshot.value = null;
  error.value = '';
  message.value = '';

  try {
    applyResult(await developerPromptsApi.get());
  } catch {
    error.value = t(ERROR_MESSAGE_KEYS.CONFIG_FAILED);
  } finally {
    loading.value = false;
  }
};

const close = async () => {
  if (hasUnsavedChanges.value) {
    leaveConfirming.value = true;
    await nextTick();
    leaveDialog.value?.focus();
    return;
  }

  emit('close');
};

const keepEditing = async () => {
  leaveConfirming.value = false;
  await nextTick();
  page.value?.focus();
};

const discardAndClose = () => {
  leaveConfirming.value = false;
  emit('close');
};

const savePrompts = async () => {
  if (!prompts.value || saving.value || resetting.value) {
    return;
  }

  saving.value = true;
  message.value = '';
  error.value = '';

  try {
    const result = await developerPromptsApi.save(
      structuredClone(toRaw(prompts.value)),
    );

    if (applyResult(result)) {
      message.value = t('settings.promptsSaved');
    }
  } catch {
    error.value = t(ERROR_MESSAGE_KEYS.CONFIG_FAILED);
  } finally {
    saving.value = false;
  }
};

const requestReset = () => {
  message.value = '';
  error.value = '';
  confirmingReset.value = true;
};

const cancelReset = () => {
  confirmingReset.value = false;
};

const resetPrompts = async () => {
  if (saving.value || resetting.value) {
    return;
  }

  resetting.value = true;
  message.value = '';
  error.value = '';

  try {
    const result = await developerPromptsApi.reset();

    if (applyResult(result)) {
      message.value = t('settings.promptsReset');
    }
  } catch {
    error.value = t(ERROR_MESSAGE_KEYS.CONFIG_FAILED);
  } finally {
    resetting.value = false;
  }
};

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    if (leaveConfirming.value) {
      void keepEditing();
    } else {
      void close();
    }
  }
};

watch(
  () => props.open,
  async (open) => {
    if (open) {
      leaveConfirming.value = false;
      previousFocus =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      document.addEventListener('keydown', handleKeydown);
      await loadPrompts();
      await nextTick();
      page.value?.focus();
      return;
    }

    confirmingReset.value = false;
    leaveConfirming.value = false;
    message.value = '';
    error.value = '';
    document.removeEventListener('keydown', handleKeydown);
    previousFocus?.focus();
  },
);

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <Transition name="prompt-page">
    <section
      v-if="open"
      ref="page"
      class="prompt-page"
      role="dialog"
      aria-modal="true"
      :aria-label="t('settings.developerPromptsPageTitle')"
      tabindex="-1"
    >
      <header class="prompt-page__header">
        <button class="prompt-page__back" type="button" @click="close">
          <span aria-hidden="true">←</span>
          {{ t('settings.backToSettings') }}
        </button>

        <div class="prompt-page__heading">
          <p>Developer / Prompt Engineering</p>
          <h2>{{ t('settings.developerPromptsPageTitle') }}</h2>
          <span>{{ t('settings.developerPromptsPageDescription') }}</span>
        </div>

        <div class="prompt-page__actions">
          <span
            v-if="hasUnsavedChanges"
            class="prompt-page__dirty"
            role="status"
          >
            <i aria-hidden="true"></i>
            {{ t('settings.unsavedChanges') }}
          </span>
          <span v-if="baseVersion" class="prompt-page__version">
            {{
              t('settings.developerPromptsBaseVersion', {
                version: baseVersion,
              })
            }}
          </span>
          <AppButton
            size="small"
            :disabled="
              !prompts || !hasUnsavedChanges || loading || saving || resetting
            "
            @click="savePrompts"
          >
            {{ saving ? t('common.loading') : t('settings.savePrompts') }}
          </AppButton>
        </div>
      </header>

      <div class="prompt-page__body">
        <div class="prompt-page__rail" aria-hidden="true">
          <span>PROMPTS</span>
          <i></i>
          <small>{{ baseVersion }}</small>
        </div>

        <main class="prompt-page__content">
          <p v-if="loading" class="prompt-page__feedback">
            {{ t('settings.developerPromptsLoading') }}
          </p>

          <template v-else>
            <div class="prompt-page__status">
              <span v-if="hasSavedProfile">
                {{ t('settings.developerPromptsSavedProfile') }}
              </span>
              <span v-else>
                {{ t('settings.developerPromptsUsingDefaults') }}
              </span>
            </div>

            <DeveloperPromptEditor
              v-if="prompts && defaults"
              v-model="prompts"
              :defaults="defaults"
            />

            <p v-if="error" class="prompt-page__error" role="alert">
              {{ error }}
            </p>
            <p v-if="message" class="prompt-page__message" role="status">
              {{ message }}
            </p>

            <section class="prompt-page__reset">
              <div>
                <strong>{{ t('settings.resetPrompts') }}</strong>
                <p>{{ t('settings.resetPromptsWarning') }}</p>
              </div>
              <AppButton
                v-if="!confirmingReset"
                variant="text"
                :disabled="saving || resetting"
                @click="requestReset"
              >
                {{ t('settings.resetPrompts') }}
              </AppButton>
              <div v-else class="prompt-page__reset-actions">
                <AppButton
                  variant="ghost"
                  size="small"
                  :disabled="resetting"
                  @click="cancelReset"
                >
                  {{ t('common.cancel') }}
                </AppButton>
                <AppButton
                  variant="danger"
                  size="small"
                  :disabled="resetting"
                  @click="resetPrompts"
                >
                  {{
                    resetting
                      ? t('common.loading')
                      : t('settings.confirmResetPrompts')
                  }}
                </AppButton>
              </div>
            </section>
          </template>
        </main>
      </div>

      <Transition name="prompt-page-dialog">
        <div
          v-if="leaveConfirming"
          class="prompt-page__leave-layer"
          @mousedown.self="keepEditing"
        >
          <section
            ref="leaveDialog"
            class="prompt-page__leave-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="prompt-page-leave-title"
            tabindex="-1"
          >
            <p class="prompt-page__leave-eyebrow">Unsaved changes</p>
            <h3 id="prompt-page-leave-title">
              {{ t('settings.unsavedChangesTitle') }}
            </h3>
            <p>{{ t('settings.unsavedChangesMessage') }}</p>
            <div class="prompt-page__leave-actions">
              <AppButton variant="ghost" @click="keepEditing">
                {{ t('settings.continueEditing') }}
              </AppButton>
              <AppButton variant="danger" @click="discardAndClose">
                {{ t('settings.discardChangesAndReturn') }}
              </AppButton>
            </div>
          </section>
        </div>
      </Transition>
    </section>
  </Transition>
</template>

<style scoped>
.prompt-page {
  position: absolute;
  inset: 0;
  z-index: 80;
  display: flex;
  min-height: 0;
  flex-direction: column;
  background:
    radial-gradient(circle at 8% 0%, rgb(202 215 204 / 42%), transparent 28%),
    radial-gradient(circle at 92% 92%, rgb(132 106 69 / 10%), transparent 32%),
    var(--paper);
  outline: none;
}

.prompt-page__header {
  display: grid;
  grid-template-columns: minmax(130px, 0.7fr) minmax(280px, 1.6fr) auto;
  gap: 28px;
  align-items: start;
  padding: 24px 34px 22px;
  border-bottom: 1px solid var(--line);
  background: rgb(255 254 250 / 82%);
  backdrop-filter: blur(14px);
}

.prompt-page__back {
  justify-self: start;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--ink-faint);
  font: inherit;
  font-size: 11.5px;
  cursor: pointer;
}

.prompt-page__back:hover {
  color: var(--ink);
}

.prompt-page__back:focus-visible,
.prompt-page__actions :deep(button:focus-visible) {
  outline: 2px solid var(--moss);
  outline-offset: 2px;
}

.prompt-page__heading p {
  margin: 0 0 5px;
  color: var(--moss);
  font-size: 9.5px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
}

.prompt-page__heading h2 {
  margin: 0;
  font-family: var(--serif);
  font-size: 25px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.prompt-page__heading > span {
  display: block;
  margin-top: 7px;
  color: var(--ink-faint);
  font-size: 11px;
  line-height: 1.65;
}

.prompt-page__actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.prompt-page__dirty {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--amber);
  font-size: 10px;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.prompt-page__dirty i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 3px rgb(168 126 58 / 12%);
}

.prompt-page__version {
  color: var(--ink-faint);
  font-size: 10px;
  white-space: nowrap;
}

.prompt-page__body {
  display: grid;
  grid-template-columns: 54px minmax(0, 900px);
  justify-content: center;
  min-height: 0;
  flex: 1;
  overflow: hidden;
}

.prompt-page__rail {
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 16px;
  padding-top: 38px;
  border-right: 1px solid var(--line-soft);
  color: var(--ink-ghost);
  font-size: 8.5px;
  letter-spacing: 0.18em;
  writing-mode: vertical-rl;
}

.prompt-page__rail i {
  width: 1px;
  height: 42px;
  background: var(--line);
}

.prompt-page__rail small {
  font-size: 7.5px;
  letter-spacing: 0.08em;
}

.prompt-page__content {
  overflow-y: auto;
  padding: 30px 36px 54px;
}

.prompt-page__status {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 16px;
  color: var(--moss);
  font-size: 10px;
}

.prompt-page__feedback,
.prompt-page__message,
.prompt-page__error {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.65;
}

.prompt-page__feedback,
.prompt-page__message {
  color: var(--moss);
}

.prompt-page__error {
  margin-top: 14px;
  color: #96645a;
}

.prompt-page__reset {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  margin-top: 34px;
  padding-top: 22px;
  border-top: 1px solid var(--line);
}

.prompt-page__reset strong {
  color: var(--ink-soft);
  font-size: 12px;
  font-weight: 550;
}

.prompt-page__reset p {
  max-width: 520px;
  margin: 6px 0 0;
  color: var(--ink-faint);
  font-size: 10.5px;
  line-height: 1.6;
}

.prompt-page__reset-actions {
  display: flex;
  flex: none;
  gap: 8px;
}

.prompt-page__leave-layer {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(38 34 27 / 22%);
  backdrop-filter: blur(4px);
}

.prompt-page__leave-dialog {
  width: min(430px, 100%);
  padding: 24px 26px 22px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background:
    radial-gradient(circle at 90% 0%, rgb(233 225 208 / 70%), transparent 40%),
    var(--paper-raised);
  box-shadow: 0 22px 55px -24px rgb(44 35 23 / 48%);
  outline: none;
}

.prompt-page__leave-eyebrow {
  margin: 0 0 6px;
  color: var(--amber);
  font-size: 9px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
}

.prompt-page__leave-dialog h3 {
  margin: 0;
  font-family: var(--serif);
  font-size: 20px;
  font-weight: 600;
}

.prompt-page__leave-dialog > p:not(.prompt-page__leave-eyebrow) {
  margin: 10px 0 0;
  color: var(--ink-soft);
  font-size: 11.5px;
  line-height: 1.7;
}

.prompt-page__leave-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
}

.prompt-page-enter-active,
.prompt-page-leave-active {
  transition:
    opacity 180ms ease,
    transform 220ms var(--ease-out);
}

.prompt-page-enter-from,
.prompt-page-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

.prompt-page-dialog-enter-active,
.prompt-page-dialog-leave-active {
  transition: opacity 160ms ease;
}

.prompt-page-dialog-enter-active .prompt-page__leave-dialog,
.prompt-page-dialog-leave-active .prompt-page__leave-dialog {
  transition: transform 180ms var(--ease-out);
}

.prompt-page-dialog-enter-from,
.prompt-page-dialog-leave-to {
  opacity: 0;
}

.prompt-page-dialog-enter-from .prompt-page__leave-dialog,
.prompt-page-dialog-leave-to .prompt-page__leave-dialog {
  transform: translateY(5px) scale(0.985);
}

@media (width <= 760px) {
  .prompt-page__header {
    grid-template-columns: 1fr auto;
    gap: 16px;
    padding: 18px 20px;
  }

  .prompt-page__heading {
    grid-column: 1 / -1;
    grid-row: 2;
  }

  .prompt-page__body {
    grid-template-columns: 1fr;
  }

  .prompt-page__rail {
    display: none;
  }

  .prompt-page__content {
    padding: 24px 20px 44px;
  }

  .prompt-page__reset {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
