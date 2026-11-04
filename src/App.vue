<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { providerApi } from '@/api/providers';
import { settingsApi } from '@/api/settings';
import AppWindow from '@/components/layout/AppWindow.vue';
import CompanionScreen from '@/components/companion/CompanionScreen.vue';
import ArchiveScreen from '@/components/archive/ArchiveScreen.vue';
import FirstRunScreen from '@/components/onboarding/FirstRunScreen.vue';
import NewPageScreen from '@/components/newpage/NewPageScreen.vue';
import OverlayHost from '@/components/overlay/OverlayHost.vue';
import SettingsDialog from '@/components/layout/SettingsDialog.vue';
import DeveloperPromptPage from '@/components/settings/DeveloperPromptPage.vue';
import { ERROR_MESSAGE_KEYS } from '@/shared/errors';
import { isDemoMode, shouldShowFirstRun } from '@/shared/onboarding';
import { useSessionStore } from '@/stores/session';

const { t } = useI18n();
const settingsOpen = ref(false);
const developerPromptsOpen = ref(false);
const developerMode = ref(false);
const providerCheckDone = ref(false);
const hasConfiguredProvider = ref(false);
const onboardingDone = ref(false);
const ONBOARDING_STORAGE_KEY = 'tap-along:onboarding-done';

const {
  state,
  currentPage,
  canGoBack,
  stackIsDeep,
  submitNewPage,
  sendReply,
  useGuidanceSuggestion,
  retryGuidance,
  submitAppend,
  startEditing,
  cancelEditing,
  saveEditing,
  startAppending,
  startNewPage,
  closeCurrentPage,
  openArchive,
  openArchivedPage,
  closeArchive,
  retryArchive,
  goBack,
  toggleHistory,
  retrySave,
  retryTeacher,
  cancelTeacher,
  canCancelTeacher,
  clearConversationData,
  dismissOverlay,
} = useSessionStore();

const overlayErrorMessage = computed(() =>
  t(ERROR_MESSAGE_KEYS[state.errorCode ?? 'UNKNOWN_ERROR']),
);

const archiveErrorMessage = computed(() =>
  state.archiveError ? t('archive.failed') : '',
);

const demoMode = computed(() =>
  isDemoMode({
    providerCheckDone: providerCheckDone.value,
    hasConfiguredProvider: hasConfiguredProvider.value,
  }),
);

const showFirstRun = computed(() =>
  shouldShowFirstRun({
    providerCheckDone: providerCheckDone.value,
    hasConfiguredProvider: hasConfiguredProvider.value,
    onboardingDone: onboardingDone.value,
  }),
);

const submitComposer = () => {
  if (state.composerMode === 'append') {
    void submitAppend();
    return;
  }

  void sendReply();
};

const readOnboardingDone = () => {
  try {
    return localStorage.getItem(ONBOARDING_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};

const markOnboardingDone = () => {
  onboardingDone.value = true;

  try {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
  } catch {
    // 本地标记失败不阻断使用；下次可能再次显示首用页。
  }
};

const refreshProviderState = async () => {
  try {
    const result = await providerApi.list();
    const active = result.ok
      ? result.state?.providers.find((provider) => provider.active)
      : undefined;

    hasConfiguredProvider.value = result.ok
      ? active?.configured === true
      : true;
  } catch {
    // 读取失败不拦截用户，也不误报为未配置。
    hasConfiguredProvider.value = true;
  } finally {
    providerCheckDone.value = true;

    if (hasConfiguredProvider.value) {
      markOnboardingDone();
    }
  }
};

const chooseDemo = () => {
  markOnboardingDone();
};

const configureFromFirstRun = () => {
  markOnboardingDone();
  settingsOpen.value = true;
};

const closeSettings = async () => {
  settingsOpen.value = false;
  await refreshProviderState();
};

const openModelSettings = () => {
  settingsOpen.value = true;
};

const openDeveloperPrompts = () => {
  settingsOpen.value = false;
  developerPromptsOpen.value = true;
};

const closeDeveloperPrompts = () => {
  developerPromptsOpen.value = false;
  settingsOpen.value = true;
};

const applyDeveloperMode = (enabled: boolean) => {
  developerMode.value = enabled;
};

onMounted(async () => {
  onboardingDone.value = readOnboardingDone();

  await Promise.all([
    (async () => {
      try {
        const result = await settingsApi.getDeveloperMode();
        developerMode.value = result.ok && result.enabled === true;
      } catch {
        developerMode.value = false;
      }
    })(),
    refreshProviderState(),
  ]);
});
</script>

<template>
  <AppWindow>
    <div
      v-if="state.booting"
      class="restoring"
      role="status"
      aria-live="polite"
    >
      <span class="restoring__mark" aria-hidden="true"></span>
      <p>{{ t('common.restoring') }}</p>
    </div>

    <FirstRunScreen
      v-else-if="showFirstRun"
      @configure="configureFromFirstRun"
      @demo="chooseDemo"
    />

    <Transition v-else name="screen-switch" mode="out-in">
      <ArchiveScreen
        v-if="state.view === 'archive'"
        :pages="state.archivePages"
        :loading="state.archiveLoading"
        :error="archiveErrorMessage"
        :demo-mode="demoMode"
        @back="closeArchive"
        @open="openArchivedPage"
        @retry="retryArchive"
        @settings="settingsOpen = true"
      />
      <NewPageScreen
        v-else-if="state.view === 'new'"
        :body="state.draft.body"
        :source="state.draft.source"
        :can-back="canGoBack"
        :demo-mode="demoMode"
        :deep="stackIsDeep"
        :error="state.draftError ? t(state.draftError) : ''"
        @update:body="state.draft.body = $event"
        @update:source="state.draft.source = $event"
        @submit="submitNewPage"
        @back="goBack"
        @archive="openArchive"
        @settings="settingsOpen = true"
      />
      <CompanionScreen
        v-else-if="currentPage"
        :developer-mode="developerMode"
        :page="currentPage"
        :typing="state.typing"
        :can-back="canGoBack"
        :archive-visible="!state.archiveDetailOpen"
        :demo-mode="demoMode"
        :composer-mode="state.composerMode"
        :reply-draft="state.replyDraft"
        :say-more-open="state.sayMoreOpen"
        :can-cancel="canCancelTeacher"
        :cancelling="state.cancelling"
        @back="goBack"
        @archive="openArchive"
        @settings="settingsOpen = true"
        @update-edit-draft="currentPage.editDraft = $event"
        @save-edit="saveEditing"
        @cancel-edit="cancelEditing"
        @toggle-history="toggleHistory"
        @update-reply-draft="state.replyDraft = $event"
        @submit-reply="submitComposer"
        @cancel-teacher="cancelTeacher"
        @use-guidance="useGuidanceSuggestion"
        @retry-guidance="retryGuidance"
        @toggle-say-more="state.sayMoreOpen = !state.sayMoreOpen"
        @edit="startEditing"
        @append="startAppending"
        @new-page="startNewPage"
        @close="closeCurrentPage"
      />
    </Transition>

    <OverlayHost
      :overlay="state.overlay"
      :error-message="overlayErrorMessage"
      @back-to-edit="dismissOverlay"
      @retry-save="retrySave"
      @retry-teacher="retryTeacher"
      @open-settings="openModelSettings"
    />

    <SettingsDialog
      :open="settingsOpen"
      :clear-conversation-data="clearConversationData"
      @close="closeSettings"
      @open-developer-prompts="openDeveloperPrompts"
      @developer-mode-changed="applyDeveloperMode"
    />

    <DeveloperPromptPage
      :open="developerPromptsOpen"
      @close="closeDeveloperPrompts"
    />
  </AppWindow>
</template>

<style scoped>
.restoring {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 16px;
  color: var(--ink-faint);
  font-size: 12px;
  letter-spacing: 0.08em;
}

.restoring p {
  margin: 0;
}

.restoring__mark {
  width: 28px;
  height: 20px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--paper-raised);
  box-shadow:
    4px 4px 0 -1px var(--paper),
    4px 4px 0 0 var(--line);
  animation: page-breathe 1.4s ease-in-out infinite;
}

@keyframes page-breathe {
  50% {
    opacity: 0.55;
    transform: translateY(-2px);
  }
}

.screen-switch-enter-active,
.screen-switch-leave-active {
  transition:
    opacity 200ms ease,
    transform 240ms var(--ease-out);
}

.screen-switch-enter-from {
  opacity: 0;
  transform: translateY(5px);
}

.screen-switch-leave-to {
  opacity: 0;
  transform: translateY(-3px);
}
</style>
