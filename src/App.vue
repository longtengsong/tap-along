<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import AppWindow from '@/components/layout/AppWindow.vue';
import CompanionScreen from '@/components/companion/CompanionScreen.vue';
import NewPageScreen from '@/components/newpage/NewPageScreen.vue';
import OverlayHost from '@/components/overlay/OverlayHost.vue';
import SettingsDialog from '@/components/layout/SettingsDialog.vue';
import { useSessionStore } from '@/stores/session';

const { t } = useI18n();
const settingsOpen = ref(false);

const {
  state,
  currentPage,
  canGoBack,
  stackIsDeep,
  submitNewPage,
  sendReply,
  submitAppend,
  startEditing,
  cancelEditing,
  saveEditing,
  startAppending,
  startNewPage,
  closeCurrentPage,
  goBack,
  toggleHistory,
  retrySave,
  retryTeacher,
  dismissOverlay,
} = useSessionStore();

const submitComposer = () => {
  if (state.composerMode === 'append') {
    void submitAppend();
    return;
  }

  void sendReply();
};
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

    <Transition v-else name="screen-switch" mode="out-in">
      <NewPageScreen
        v-if="state.view === 'new'"
        :body="state.draft.body"
        :source="state.draft.source"
        :can-back="canGoBack"
        :deep="stackIsDeep"
        :error="state.draftError ? t(state.draftError) : ''"
        @update:body="state.draft.body = $event"
        @update:source="state.draft.source = $event"
        @submit="submitNewPage"
        @back="goBack"
        @settings="settingsOpen = true"
      />
      <CompanionScreen
        v-else-if="currentPage"
        :page="currentPage"
        :typing="state.typing"
        :can-back="canGoBack"
        :composer-mode="state.composerMode"
        :reply-draft="state.replyDraft"
        :say-more-open="state.sayMoreOpen"
        @back="goBack"
        @settings="settingsOpen = true"
        @update-edit-draft="currentPage.editDraft = $event"
        @save-edit="saveEditing"
        @cancel-edit="cancelEditing"
        @toggle-history="toggleHistory"
        @update-reply-draft="state.replyDraft = $event"
        @submit-reply="submitComposer"
        @toggle-say-more="state.sayMoreOpen = !state.sayMoreOpen"
        @edit="startEditing"
        @append="startAppending"
        @new-page="startNewPage"
        @close="closeCurrentPage"
      />
    </Transition>

    <OverlayHost
      :overlay="state.overlay"
      @back-to-edit="dismissOverlay"
      @retry-save="retrySave"
      @retry-teacher="retryTeacher"
    />

    <SettingsDialog :open="settingsOpen" @close="settingsOpen = false" />
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
