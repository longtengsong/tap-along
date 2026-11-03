<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import AppBar from '@/components/layout/AppBar.vue';
import BottomBar from '@/components/companion/BottomBar/BottomBar.vue';
import ContentColumn from '@/components/layout/ContentColumn.vue';
import PageCard from '@/components/companion/PageCard/PageCard.vue';
import TalkStream from '@/components/companion/TalkStream/TalkStream.vue';
import type { ComposerMode, PageRecord } from '@/types/session';

const { t } = useI18n();

defineProps<{
  page: PageRecord;
  typing: boolean;
  canBack: boolean;
  composerMode: ComposerMode;
  replyDraft: string;
  sayMoreOpen: boolean;
  canCancel: boolean;
  cancelling: boolean;
}>();

const emit = defineEmits<{
  back: [];
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
}>();
</script>

<template>
  <section
    class="screen screen--companion"
    aria-labelledby="companion-page-title"
  >
    <AppBar
      :back-visible="canBack"
      @back="emit('back')"
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
      <TalkStream
        :messages="page.messages"
        :history-open="page.historyOpen"
        :typing="typing"
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
