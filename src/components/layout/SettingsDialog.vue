<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { providerApi } from '@/api/providers';
import { settingsApi } from '@/api/settings';
import AppButton from '@/components/ui/AppButton.vue';
import { setLocale } from '@/i18n';
import type { SupportedLocale } from '@/i18n/locale';
import { ERROR_MESSAGE_KEYS, type AppErrorCode } from '@/shared/errors';
import type { PageClearAllResult } from '@/shared/pages';
import type {
  ModelProviderId,
  ModelProviderState,
  ModelProviderView,
  SaveModelProviderPayload,
} from '@/shared/providers';

const props = defineProps<{
  open: boolean;
  clearConversationData: () => Promise<PageClearAllResult>;
}>();

const emit = defineEmits<{
  close: [];
  openDeveloperPrompts: [];
}>();

const { locale, t } = useI18n();
const dialog = ref<HTMLElement | null>(null);
const activeLocale = computed(() => locale.value as SupportedLocale);
const providerState = ref<ModelProviderState | null>(null);
const selectedProviderId = ref<ModelProviderId>('deepseek');
const providerLoading = ref(false);
const providerSaving = ref(false);
const providerTesting = ref(false);
const providerMessage = ref('');
const providerError = ref('');
const dataConfirming = ref(false);
const dataClearing = ref(false);
const dataMessage = ref('');
const dataError = ref('');
const developerMode = ref(false);
const developerModeLoading = ref(false);
const developerModeSaving = ref(false);
const developerModeMessage = ref('');
const developerModeError = ref('');
let providerSelectionInitialized = false;
const providerForm = reactive({
  name: '',
  model: '',
  baseUrl: '',
  apiKey: '',
});
let previousFocus: HTMLElement | null = null;

const selectedProvider = computed(
  () =>
    providerState.value?.providers.find(
      (provider) => provider.id === selectedProviderId.value,
    ) ?? null,
);

const close = () => {
  emit('close');
};

const selectLocale = (nextLocale: SupportedLocale) => {
  setLocale(nextLocale);
};

const showProviderError = (errorCode?: AppErrorCode) => {
  providerMessage.value = '';
  providerError.value = t(ERROR_MESSAGE_KEYS[errorCode ?? 'UNKNOWN_ERROR']);
};

const applyProviderState = (state: ModelProviderState) => {
  providerState.value = state;
  const selected =
    (!providerSelectionInitialized
      ? state.providers.find((provider) => provider.active)
      : state.providers.find(
          (provider) => provider.id === selectedProviderId.value,
        )) ??
    state.providers.find((provider) => provider.active) ??
    state.providers[0];

  providerSelectionInitialized = true;
  if (selected) {
    selectProvider(selected);
  }
};

const selectProvider = (provider: ModelProviderView) => {
  selectedProviderId.value = provider.id;
  providerForm.name = provider.name;
  providerForm.model = provider.model;
  providerForm.baseUrl = provider.baseUrl;
  providerForm.apiKey = '';
  providerError.value = '';
  providerMessage.value = '';
};

const loadProviders = async () => {
  providerLoading.value = true;
  providerError.value = '';

  try {
    const result = await providerApi.list();
    if (result.ok && result.state) {
      applyProviderState(result.state);
    } else {
      showProviderError(result.errorCode);
    }
  } catch {
    showProviderError('CONFIG_FAILED');
  } finally {
    providerLoading.value = false;
  }
};

const loadDeveloperMode = async () => {
  developerModeLoading.value = true;
  developerModeError.value = '';

  try {
    const result = await settingsApi.getDeveloperMode();

    if (result.ok && result.enabled !== undefined) {
      developerMode.value = result.enabled;
    } else {
      developerModeError.value = t(
        ERROR_MESSAGE_KEYS[result.errorCode ?? 'UNKNOWN_ERROR'],
      );
    }
  } catch {
    developerModeError.value = t(ERROR_MESSAGE_KEYS.CONFIG_FAILED);
  } finally {
    developerModeLoading.value = false;
  }
};

const toggleDeveloperMode = async () => {
  if (developerModeLoading.value || developerModeSaving.value) {
    return;
  }

  const enabled = !developerMode.value;
  developerModeSaving.value = true;
  developerModeMessage.value = '';
  developerModeError.value = '';

  try {
    const result = await settingsApi.setDeveloperMode(enabled);

    if (!result.ok || result.enabled === undefined) {
      developerModeError.value = t(
        ERROR_MESSAGE_KEYS[result.errorCode ?? 'UNKNOWN_ERROR'],
      );
      return;
    }

    developerMode.value = result.enabled;
    developerModeMessage.value = result.enabled
      ? t('settings.developerModeEnabledMessage')
      : t('settings.developerModeDisabledMessage');
  } catch {
    developerModeError.value = t(ERROR_MESSAGE_KEYS.CONFIG_FAILED);
  } finally {
    developerModeSaving.value = false;
  }
};

const providerPayload = (): SaveModelProviderPayload => ({
  id: selectedProviderId.value,
  name: providerForm.name,
  model: providerForm.model,
  baseUrl: providerForm.baseUrl,
  apiKey: providerForm.apiKey,
});

const saveProvider = async () => {
  if (providerSaving.value || providerTesting.value) {
    return;
  }

  providerSaving.value = true;
  providerMessage.value = '';
  providerError.value = '';

  try {
    const result = await providerApi.save(providerPayload());
    if (!result.ok || !result.state) {
      showProviderError(result.errorCode);
      return;
    }

    applyProviderState(result.state);
    providerForm.apiKey = '';
    providerMessage.value = t('settings.configSaved');
  } catch {
    showProviderError('CONFIG_FAILED');
  } finally {
    providerSaving.value = false;
  }
};

const clearProviderKey = async () => {
  if (providerSaving.value || providerTesting.value) {
    return;
  }

  providerSaving.value = true;
  providerMessage.value = '';
  providerError.value = '';

  try {
    const result = await providerApi.clearKey(selectedProviderId.value);
    if (!result.ok || !result.state) {
      showProviderError(result.errorCode);
      return;
    }

    applyProviderState(result.state);
    providerMessage.value = t('settings.keyCleared');
  } catch {
    showProviderError('CONFIG_FAILED');
  } finally {
    providerSaving.value = false;
  }
};

const setActiveProvider = async () => {
  if (providerSaving.value || providerTesting.value) {
    return;
  }

  providerSaving.value = true;
  providerMessage.value = '';
  providerError.value = '';

  try {
    const result = await providerApi.setActive(selectedProviderId.value);
    if (!result.ok || !result.state) {
      showProviderError(result.errorCode);
      return;
    }

    applyProviderState(result.state);
    providerMessage.value = t('settings.providerActivated');
  } catch {
    showProviderError('CONFIG_FAILED');
  } finally {
    providerSaving.value = false;
  }
};

const testProvider = async () => {
  if (providerTesting.value || providerSaving.value) {
    return;
  }

  if (!selectedProvider.value?.configured) {
    showProviderError('PROVIDER_NOT_CONFIGURED');
    return;
  }

  providerTesting.value = true;
  providerMessage.value = '';
  providerError.value = '';

  try {
    const result = await providerApi.test(selectedProviderId.value);
    if (result.ok) {
      providerMessage.value = t('settings.connectionSuccess');
    } else {
      showProviderError(result.errorCode);
    }
  } catch {
    showProviderError('PROVIDER_TEST_FAILED');
  } finally {
    providerTesting.value = false;
  }
};

const beginClearConversationData = () => {
  if (dataClearing.value) {
    return;
  }

  dataConfirming.value = true;
  dataMessage.value = '';
  dataError.value = '';
};

const cancelClearConversationData = () => {
  if (!dataClearing.value) {
    dataConfirming.value = false;
  }
};

const confirmClearConversationData = async () => {
  if (dataClearing.value) {
    return;
  }

  dataClearing.value = true;
  dataMessage.value = '';
  dataError.value = '';

  try {
    const result = await props.clearConversationData();

    if (!result.ok) {
      dataError.value = t(
        ERROR_MESSAGE_KEYS[result.errorCode ?? 'UNKNOWN_ERROR'],
      );
      return;
    }

    dataConfirming.value = false;
    dataMessage.value = t('settings.conversationsCleared', {
      count: result.cleared ?? 0,
    });
  } catch {
    dataError.value = t(ERROR_MESSAGE_KEYS.SAVE_FAILED);
  } finally {
    dataClearing.value = false;
  }
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
      void loadProviders();
      void loadDeveloperMode();
      await nextTick();
      dialog.value?.focus();
      return;
    }

    dataConfirming.value = false;
    dataMessage.value = '';
    dataError.value = '';
    developerModeMessage.value = '';
    developerModeError.value = '';
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

        <section
          class="settings-section"
          aria-labelledby="settings-developer-mode"
        >
          <div class="settings-section__heading">
            <h3 id="settings-developer-mode">
              {{ t('settings.developerMode') }}
            </h3>
            <span>{{ t('settings.developerModeHint') }}</span>
          </div>

          <div class="developer-mode">
            <div class="developer-mode__copy">
              <strong>{{ t('settings.developerModeLabel') }}</strong>
              <p>{{ t('settings.developerModeDescription') }}</p>
            </div>
            <button
              class="developer-mode__toggle"
              :class="{
                'developer-mode__toggle--enabled': developerMode,
              }"
              type="button"
              role="switch"
              :aria-checked="developerMode"
              :aria-label="t('a11y.developerModeToggle')"
              :disabled="developerModeLoading || developerModeSaving"
              @click="toggleDeveloperMode"
            >
              <span class="developer-mode__track" aria-hidden="true">
                <span class="developer-mode__thumb"></span>
              </span>
              <span>
                {{
                  developerModeLoading || developerModeSaving
                    ? t('common.loading')
                    : developerMode
                      ? t('settings.developerModeOn')
                      : t('settings.developerModeOff')
                }}
              </span>
            </button>
          </div>

          <p v-if="developerModeError" class="provider-error" role="alert">
            {{ developerModeError }}
          </p>
          <p
            v-if="developerModeMessage"
            class="provider-feedback"
            role="status"
          >
            {{ developerModeMessage }}
          </p>

          <div class="developer-mode__tools">
            <AppButton
              v-if="developerMode"
              variant="ghost"
              size="small"
              @click="emit('openDeveloperPrompts')"
            >
              {{ t('settings.editPrompts') }}
            </AppButton>
            <span v-else>{{ t('settings.developerPromptsLockedHint') }}</span>
          </div>
        </section>

        <section class="settings-section" aria-labelledby="settings-model">
          <div class="settings-section__heading">
            <h3 id="settings-model">{{ t('settings.modelService') }}</h3>
            <span>{{ t('settings.modelServiceHint') }}</span>
          </div>

          <p v-if="providerLoading" class="provider-feedback">
            {{ t('common.loading') }}
          </p>

          <template v-else-if="providerState">
            <div
              class="provider-options"
              role="group"
              :aria-label="t('a11y.providerOptions')"
            >
              <button
                v-for="provider in providerState.providers"
                :key="provider.id"
                class="provider-option"
                :class="{
                  'provider-option--active': selectedProviderId === provider.id,
                }"
                type="button"
                :aria-pressed="selectedProviderId === provider.id"
                @click="selectProvider(provider)"
              >
                <span>{{ provider.name }}</span>
                <small v-if="provider.active">
                  {{ t('settings.activeProvider') }}
                </small>
              </button>
            </div>

            <div class="provider-status">
              <span
                class="provider-status__dot"
                :class="{
                  'provider-status__dot--configured':
                    selectedProvider?.configured,
                }"
                aria-hidden="true"
              ></span>
              {{
                selectedProvider?.configured
                  ? t('settings.keyConfigured')
                  : t('settings.keyNotConfigured')
              }}
            </div>

            <div class="provider-fields">
              <label v-if="selectedProvider?.isCustom" class="settings-field">
                <span>{{ t('settings.providerName') }}</span>
                <input
                  v-model="providerForm.name"
                  type="text"
                  :placeholder="t('settings.providerNamePlaceholder')"
                  autocomplete="off"
                />
              </label>

              <label class="settings-field">
                <span>{{ t('settings.model') }}</span>
                <input
                  v-model="providerForm.model"
                  type="text"
                  :placeholder="t('settings.modelPlaceholder')"
                  autocomplete="off"
                  spellcheck="false"
                />
              </label>

              <label
                v-if="selectedProvider?.isCustom"
                class="settings-field settings-field--wide"
              >
                <span>{{ t('settings.baseUrl') }}</span>
                <input
                  v-model="providerForm.baseUrl"
                  type="url"
                  :placeholder="t('settings.baseUrlPlaceholder')"
                  autocomplete="off"
                  spellcheck="false"
                />
              </label>

              <label class="settings-field settings-field--wide">
                <span class="settings-field__heading">
                  <span>{{ t('settings.apiKey') }}</span>
                  <span
                    v-if="selectedProvider?.configured"
                    class="settings-field__saved"
                  >
                    <span aria-hidden="true">✓</span>
                    {{ t('settings.keySavedBadge') }}
                  </span>
                </span>
                <input
                  v-model="providerForm.apiKey"
                  type="password"
                  :class="{
                    'settings-field__input--saved':
                      selectedProvider?.configured && !providerForm.apiKey,
                  }"
                  :placeholder="
                    selectedProvider?.configured
                      ? t('settings.apiKeySavedPlaceholder')
                      : t('settings.apiKeyPlaceholder')
                  "
                  autocomplete="new-password"
                  spellcheck="false"
                />
                <small v-if="selectedProvider?.configured">
                  {{ t('settings.apiKeyConfigured') }}
                </small>
                <small>{{ t('settings.keySecurityHint') }}</small>
              </label>
            </div>

            <p
              v-if="!providerState.secureStorageAvailable"
              class="provider-warning"
            >
              {{ t('settings.keyStorageUnavailable') }}
            </p>
            <p v-if="providerError" class="provider-error" role="alert">
              {{ providerError }}
            </p>
            <p v-if="providerMessage" class="provider-feedback" role="status">
              {{ providerMessage }}
            </p>

            <div class="provider-actions">
              <AppButton
                size="small"
                :disabled="providerSaving || providerTesting"
                @click="saveProvider"
              >
                {{ t('settings.saveConfig') }}
              </AppButton>
              <AppButton
                v-if="selectedProvider?.configured && !selectedProvider.active"
                variant="ghost"
                :disabled="providerSaving || providerTesting"
                @click="setActiveProvider"
              >
                {{ t('settings.setActive') }}
              </AppButton>
              <AppButton
                v-if="selectedProvider?.configured"
                variant="ghost"
                :disabled="providerTesting || providerSaving"
                @click="testProvider"
              >
                {{ t('settings.testConnection') }}
              </AppButton>
              <AppButton
                v-if="selectedProvider?.configured"
                variant="text"
                :disabled="providerSaving || providerTesting"
                @click="clearProviderKey"
              >
                {{ t('settings.clearKey') }}
              </AppButton>
            </div>
          </template>

          <p v-else class="provider-error" role="alert">
            {{ providerError }}
          </p>
        </section>

        <section class="settings-section" aria-labelledby="settings-data">
          <div class="settings-section__heading">
            <h3 id="settings-data">{{ t('settings.conversationData') }}</h3>
            <span>{{ t('settings.conversationDataHint') }}</span>
          </div>

          <div class="settings-data">
            <div class="settings-data__copy">
              <strong>{{ t('settings.clearConversations') }}</strong>
              <p>{{ t('settings.clearConversationsDescription') }}</p>
            </div>
            <AppButton
              v-if="!dataConfirming"
              variant="text"
              :disabled="dataClearing"
              @click="beginClearConversationData"
            >
              {{ t('settings.clearConversationsAction') }}
            </AppButton>
          </div>

          <div
            v-if="dataConfirming"
            class="settings-data__confirm"
            role="alertdialog"
            :aria-label="t('settings.confirmClearConversations')"
          >
            <p>{{ t('settings.clearConversationsWarning') }}</p>
            <div class="settings-data__actions">
              <AppButton
                variant="ghost"
                :disabled="dataClearing"
                @click="cancelClearConversationData"
              >
                {{ t('common.cancel') }}
              </AppButton>
              <AppButton
                variant="danger"
                :disabled="dataClearing"
                @click="confirmClearConversationData"
              >
                {{
                  dataClearing
                    ? t('settings.clearingConversations')
                    : t('settings.confirmClearConversations')
                }}
              </AppButton>
            </div>
          </div>

          <p v-if="dataError" class="provider-error" role="alert">
            {{ dataError }}
          </p>
          <p v-if="dataMessage" class="provider-feedback" role="status">
            {{ dataMessage }}
          </p>
        </section>

        <section class="settings-privacy">
          <h3>{{ t('settings.privacy') }}</h3>
          <p>{{ t('settings.privacyText') }}</p>
        </section>

        <div class="settings-panel__footer">
          <AppButton variant="ghost" @click="close">
            {{ t('settings.closeSettings') }}
          </AppButton>
        </div>
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
  max-height: calc(100vh - 56px);
  overflow-y: auto;
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

.provider-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 13px;
}

.provider-option {
  min-height: 48px;
  padding: 9px 13px;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: transparent;
  color: var(--ink-soft);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    color 180ms ease,
    border-color 180ms ease,
    background-color 180ms ease;
}

.provider-option span,
.provider-option small {
  display: block;
}

.provider-option span {
  font-size: 12.5px;
}

.provider-option small {
  margin-top: 3px;
  color: var(--moss);
  font-size: 10px;
  letter-spacing: 0.04em;
}

.provider-option:hover {
  border-color: var(--ink-ghost);
  color: var(--ink);
}

.provider-option--active {
  border-color: #c9d6cb;
  background: var(--moss-soft);
  color: var(--ink);
}

.provider-option:focus-visible,
.settings-field input:focus-visible {
  outline: 2px solid var(--moss);
  outline-offset: 2px;
}

.provider-status {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 12px;
  color: var(--ink-faint);
  font-size: 11.5px;
}

.provider-status__dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--ink-ghost);
}

.provider-status__dot--configured {
  background: var(--moss);
  box-shadow: 0 0 0 3px rgb(79 118 93 / 9%);
}

.provider-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 14px;
}

.settings-field {
  display: grid;
  gap: 6px;
}

.settings-field--wide {
  grid-column: 1 / -1;
}

.settings-field > span {
  color: var(--ink-soft);
  font-size: 11.5px;
  letter-spacing: 0.03em;
}

.settings-field__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.settings-field__saved {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--moss);
  font-size: 10.5px;
  letter-spacing: 0.02em;
}

.settings-field input {
  width: 100%;
  height: 38px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: rgb(255 254 250 / 75%);
  color: var(--ink);
  font: inherit;
  font-size: 12.5px;
}

.settings-field input::placeholder {
  color: var(--ink-ghost);
}

.settings-field input.settings-field__input--saved::placeholder {
  color: var(--moss);
  letter-spacing: 0.12em;
}

.settings-field small {
  color: var(--ink-faint);
  font-size: 10.5px;
  line-height: 1.55;
}

.provider-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-top: 14px;
}

.provider-feedback,
.provider-warning,
.provider-error {
  margin: 12px 0 0;
  font-size: 11.5px;
  line-height: 1.6;
}

.provider-feedback {
  color: var(--moss);
}

.provider-warning {
  color: var(--amber);
}

.provider-error {
  color: #96645a;
}

.settings-panel__header {
  position: sticky;
  top: 0;
  z-index: 4;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  margin: -4px -4px 0;
  padding: 4px 4px 14px;
  background: linear-gradient(
    rgb(255 254 250 / 98%) 78%,
    rgb(255 254 250 / 0%)
  );
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

.developer-mode {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-top: 13px;
  padding: 14px 16px;
  border: 1px solid var(--line-soft);
  border-radius: 12px;
  background: rgb(255 254 250 / 58%);
}

.developer-mode__copy {
  min-width: 0;
}

.developer-mode__copy strong {
  color: var(--ink-soft);
  font-size: 12px;
  font-weight: 500;
}

.developer-mode__copy p {
  margin: 5px 0 0;
  color: var(--ink-faint);
  font-size: 10.5px;
  line-height: 1.6;
}

.developer-mode__toggle {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 8px;
  min-width: 76px;
  padding: 5px 8px 5px 5px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: transparent;
  color: var(--ink-faint);
  font: inherit;
  font-size: 10.5px;
  cursor: pointer;
  transition:
    color 180ms ease,
    border-color 180ms ease,
    background-color 180ms ease;
}

.developer-mode__toggle:hover:not(:disabled) {
  border-color: var(--ink-ghost);
  color: var(--ink-soft);
}

.developer-mode__toggle--enabled {
  border-color: #c9d6cb;
  background: var(--moss-soft);
  color: var(--moss);
}

.developer-mode__toggle:disabled {
  cursor: wait;
  opacity: 0.65;
}

.developer-mode__toggle:focus-visible {
  outline: 2px solid var(--moss);
  outline-offset: 2px;
}

.developer-mode__track {
  position: relative;
  width: 28px;
  height: 16px;
  border-radius: 999px;
  background: var(--line);
  transition: background-color 180ms ease;
}

.developer-mode__thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--paper-raised);
  box-shadow: 0 1px 3px rgb(44 35 23 / 18%);
  transition: transform 180ms var(--ease-out);
}

.developer-mode__toggle--enabled .developer-mode__track {
  background: var(--moss);
}

.developer-mode__toggle--enabled .developer-mode__thumb {
  transform: translateX(12px);
}

.developer-mode__tools {
  display: flex;
  align-items: center;
  margin-top: 10px;
}

.developer-mode__tools > span {
  color: var(--ink-faint);
  font-size: 10.5px;
  line-height: 1.55;
}

.settings-data {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-top: 13px;
  padding: 14px 16px;
  border: 1px solid var(--line-soft);
  border-radius: 12px;
  background: rgb(255 254 250 / 58%);
}

.settings-data__copy {
  min-width: 0;
}

.settings-data__copy strong {
  color: var(--ink-soft);
  font-size: 12px;
  font-weight: 500;
}

.settings-data__copy p {
  margin: 5px 0 0;
  color: var(--ink-faint);
  font-size: 10.5px;
  line-height: 1.6;
}

.settings-data__confirm {
  margin-top: 10px;
  padding: 14px 16px;
  border: 1px solid rgb(142 85 75 / 24%);
  border-radius: 12px;
  background: rgb(142 85 75 / 5%);
}

.settings-data__confirm p {
  margin: 0;
  color: #7e4d45;
  font-size: 11.5px;
  line-height: 1.65;
}

.settings-data__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 13px;
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

.settings-panel__footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
  padding-top: 18px;
  border-top: 1px solid var(--line-soft);
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
