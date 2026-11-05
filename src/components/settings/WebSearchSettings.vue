<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { searchApi } from '@/api/search';
import AppButton from '@/components/ui/AppButton.vue';
import { ERROR_MESSAGE_KEYS } from '@/shared/errors';
import type { WebSearchSettingsView } from '@/shared/search';

const { t } = useI18n();
const loading = ref(true);
const saving = ref(false);
const testing = ref(false);
const enabled = ref(true);
const deepseekEnabled = ref(true);
const apiKey = ref('');
const settings = ref<WebSearchSettingsView | null>(null);
const message = ref('');
const error = ref('');

const applySettings = (next: WebSearchSettingsView) => {
  settings.value = next;
  enabled.value = next.enabled;
  deepseekEnabled.value = next.deepseekEnabled;
  apiKey.value = '';
};

const load = async () => {
  loading.value = true;
  error.value = '';

  try {
    const result = await searchApi.get();

    if (!result.ok || !result.settings) {
      error.value = t(ERROR_MESSAGE_KEYS[result.errorCode ?? 'CONFIG_FAILED']);
      return;
    }

    applySettings(result.settings);
  } catch {
    error.value = t(ERROR_MESSAGE_KEYS.CONFIG_FAILED);
  } finally {
    loading.value = false;
  }
};

const save = async () => {
  if (saving.value || testing.value) {
    return;
  }

  saving.value = true;
  message.value = '';
  error.value = '';

  try {
    const result = await searchApi.save({
      enabled: enabled.value,
      deepseekEnabled: deepseekEnabled.value,
      ...(apiKey.value.trim() ? { apiKey: apiKey.value } : {}),
    });

    if (!result.ok || !result.settings) {
      error.value = t(ERROR_MESSAGE_KEYS[result.errorCode ?? 'CONFIG_FAILED']);
      return;
    }

    applySettings(result.settings);
    message.value = t('settings.searchConfigSaved');
  } catch {
    error.value = t(ERROR_MESSAGE_KEYS.CONFIG_FAILED);
  } finally {
    saving.value = false;
  }
};

const clearKey = async () => {
  if (saving.value || testing.value) {
    return;
  }

  saving.value = true;
  message.value = '';
  error.value = '';

  try {
    const result = await searchApi.clearKey();

    if (!result.ok || !result.settings) {
      error.value = t(ERROR_MESSAGE_KEYS[result.errorCode ?? 'CONFIG_FAILED']);
      return;
    }

    applySettings(result.settings);
    message.value = t('settings.searchKeyCleared');
  } catch {
    error.value = t(ERROR_MESSAGE_KEYS.CONFIG_FAILED);
  } finally {
    saving.value = false;
  }
};

const test = async () => {
  if (saving.value || testing.value) {
    return;
  }

  testing.value = true;
  message.value = '';
  error.value = '';

  try {
    const result = await searchApi.test();

    if (result.ok) {
      message.value = t('settings.searchConnectionSuccess');
    } else {
      error.value = t(
        ERROR_MESSAGE_KEYS[result.errorCode ?? 'SEARCH_REQUEST_FAILED'],
      );
    }
  } catch {
    error.value = t(ERROR_MESSAGE_KEYS.SEARCH_NETWORK_ERROR);
  } finally {
    testing.value = false;
  }
};

onMounted(load);
</script>

<template>
  <section class="settings-section" aria-labelledby="settings-search">
    <div class="settings-section__heading">
      <h3 id="settings-search">{{ t('settings.webSearch') }}</h3>
      <span>{{ t('settings.webSearchHint') }}</span>
    </div>

    <p v-if="loading" class="search-feedback">
      {{ t('common.loading') }}
    </p>

    <template v-else>
      <label class="search-toggle">
        <input v-model="enabled" type="checkbox" />
        <span>
          <strong>{{ t('settings.webSearchEnabled') }}</strong>
          <small>{{ t('settings.webSearchEnabledHint') }}</small>
        </span>
      </label>

      <div class="search-channel">
        <label class="search-toggle">
          <input v-model="deepseekEnabled" type="checkbox" />
          <span>
            <strong>{{ t('settings.deepseekSearchEnabled') }}</strong>
            <small>{{ t('settings.deepseekSearchHint') }}</small>
          </span>
        </label>
        <p
          v-if="settings"
          class="search-feedback"
          :class="{ 'search-feedback--missing': !settings.deepseekConfigured }"
        >
          {{
            settings.deepseekConfigured
              ? t('settings.deepseekReady')
              : t('settings.deepseekMissing')
          }}
        </p>
      </div>

      <label class="search-field">
        <span class="search-field__heading">
          <span>{{ t('settings.searchApiKey') }}</span>
          <span v-if="settings?.tavilyConfigured" class="search-field__saved">
            <span aria-hidden="true">✓</span>
            {{ t('settings.keySavedBadge') }}
          </span>
        </span>
        <input
          v-model="apiKey"
          type="password"
          :placeholder="
            settings?.tavilyConfigured
              ? t('settings.apiKeySavedPlaceholder')
              : t('settings.searchApiKeyPlaceholder')
          "
          autocomplete="new-password"
          spellcheck="false"
        />
        <small>{{ t('settings.searchPrivacyHint') }}</small>
      </label>

      <p
        v-if="
          settings && !settings.deepseekEnabled && !settings.tavilyConfigured
        "
        class="search-warning"
      >
        {{ t('settings.searchChannelMissing') }}
      </p>

      <p
        v-if="settings && !settings.secureStorageAvailable"
        class="search-warning"
      >
        {{ t('settings.keyStorageUnavailable') }}
      </p>
      <p v-if="error" class="search-error" role="alert">{{ error }}</p>
      <p v-if="message" class="search-feedback" role="status">{{ message }}</p>

      <div class="search-actions">
        <AppButton size="small" :disabled="saving || testing" @click="save">
          {{ t('settings.saveConfig') }}
        </AppButton>
        <AppButton
          v-if="settings?.configured"
          variant="ghost"
          :disabled="saving || testing"
          @click="test"
        >
          {{ t('settings.testConnection') }}
        </AppButton>
        <AppButton
          v-if="settings?.tavilyConfigured"
          variant="text"
          :disabled="saving || testing"
          @click="clearKey"
        >
          {{ t('settings.clearKey') }}
        </AppButton>
      </div>
    </template>
  </section>
</template>

<style scoped>
.settings-section {
  display: grid;
  gap: 12px;
}

.settings-section__heading {
  display: grid;
  gap: 5px;
}

.settings-section h3 {
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

.search-feedback,
.search-warning,
.search-error {
  margin: 0;
  font-size: 10.5px;
  line-height: 1.6;
}

.search-feedback {
  color: var(--ink-faint);
}

.search-feedback--missing {
  color: var(--amber);
}

.search-warning {
  color: var(--amber);
}

.search-error {
  color: #96645a;
}

.search-channel {
  display: grid;
  gap: 6px;
}

.search-toggle {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  color: var(--ink-soft);
  font-size: 11.5px;
  cursor: pointer;
}

.search-toggle input {
  margin-top: 3px;
  accent-color: var(--moss);
}

.search-toggle strong,
.search-toggle small {
  display: block;
}

.search-toggle strong {
  font-weight: 550;
}

.search-toggle small {
  margin-top: 2px;
  color: var(--ink-ghost);
  font-size: 10px;
  line-height: 1.55;
}

.search-field {
  display: grid;
  gap: 5px;
}

.search-field__heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  color: var(--ink-soft);
  font-size: 11.5px;
}

.search-field__saved {
  color: var(--moss);
  font-size: 9.5px;
}

.search-field input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--paper);
  color: var(--ink);
  font: inherit;
  font-size: 11.5px;
}

.search-field input:focus-visible {
  outline: 2px solid var(--moss);
  outline-offset: 1px;
}

.search-field small {
  color: var(--ink-ghost);
  font-size: 9.5px;
  line-height: 1.55;
}

.search-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
