<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import AppBar from '@/components/layout/AppBar.vue';
import BottomBar from '@/components/companion/BottomBar/BottomBar.vue';
import ContentColumn from '@/components/layout/ContentColumn.vue';
import PageCard from '@/components/companion/PageCard/PageCard.vue';
import GuidancePanel from '@/components/companion/GuidancePanel.vue';
import TalkStream from '@/components/companion/TalkStream/TalkStream.vue';
import type { ComposerMode, PageRecord } from '@/types/session';

const { t } = useI18n();

const props = defineProps<{
  page: PageRecord;
  developerMode: boolean;
  typing: boolean;
  canBack: boolean;
  archiveVisible: boolean;
  demoMode: boolean;
  composerMode: ComposerMode;
  replyDraft: string;
  sayMoreOpen: boolean;
  canCancel: boolean;
  cancelling: boolean;
}>();

const emit = defineEmits<{
  back: [];
  archive: [];
  settings: [];
  updateEditDraft: [value: string];
  saveEdit: [];
  cancelEdit: [];
  toggleHistory: [];
  updateReplyDraft: [value: string];
  submitReply: [];
  cancelTeacher: [];
  toggleSayMore: [];
  edit: [];
  append: [];
  newPage: [];
  close: [];
  useGuidance: [suggestionId: string];
  retryGuidance: [];
}>();

const displayMessages = computed(() => {
  const status = props.page.guidance?.status;

  if (
    props.page.status === 'reading' &&
    (status === 'pending' || status === 'needed' || status === 'not_needed')
  ) {
    return props.page.messages.filter((item) => item.requestId !== 'opening');
  }

  return props.page.messages;
});

const showGuidance = computed(() => {
  const guidance = props.page.guidance;

  return Boolean(
    guidance &&
    props.page.status === 'reading' &&
    !props.page.messages.some((item) => item.role === 'user') &&
    (guidance.status === 'pending' ||
      guidance.status === 'needed' ||
      guidance.status === 'not_needed'),
  );
});
</script>

<template>
  <section
    class="screen screen--companion"
    aria-labelledby="companion-page-title"
  >
    <AppBar
      :back-visible="canBack"
      :archive-visible="archiveVisible"
      :demo-mode="demoMode"
      @back="emit('back')"
      @archive="emit('archive')"
      @settings="emit('settings')"
    />
    <ContentColumn>
      <h1 id="companion-page-title" class="sr-only">
        {{ t('companion.title') }}
      </h1>
      <PageCard
        :page="page"
        @update-edit-draft="emit('updateEditDraft', $event)"
        @save-edit="emit('saveEdit')"
        @cancel-edit="emit('cancelEdit')"
      />
      <GuidancePanel
        v-if="showGuidance && page.guidance"
        :guidance="page.guidance"
        :typing="typing"
        :error="page.guidanceError"
        @use="emit('useGuidance', $event)"
        @retry="emit('retryGuidance')"
      />
      <TalkStream
        :messages="displayMessages"
        :history-open="page.historyOpen"
        :typing="typing"
        :developer-mode="developerMode"
        @toggle-history="emit('toggleHistory')"
      />
      <BottomBar
        v-if="!page.editing"
        :mode="composerMode"
        :model-value="replyDraft"
        :typing="typing"
        :say-more-open="sayMoreOpen"
        :can-cancel="canCancel"
        :cancelling="cancelling"
        :closed="page.status === 'closed'"
        @update:model-value="emit('updateReplyDraft', $event)"
        @submit="emit('submitReply')"
        @cancel-teacher="emit('cancelTeacher')"
        @toggle-say-more="emit('toggleSayMore')"
        @edit="emit('edit')"
        @append="emit('append')"
        @new-page="emit('newPage')"
        @close="emit('close')"
      />
    </ContentColumn>
  </section>
</template>

<style scoped>
.screen {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  animation: screen-in 300ms var(--ease-out) both;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  clip-path: inset(50%);
}

@keyframes screen-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
}

@media (width <= 640px) {
  .screen {
    padding: 0;
  }
}
</style>
