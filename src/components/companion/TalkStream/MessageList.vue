<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import HistoryToggle from '@/components/ui/HistoryToggle.vue';
import MaintenanceMessage from '@/components/companion/TalkStream/MaintenanceMessage.vue';
import RetryNotice from '@/components/companion/TalkStream/RetryNotice.vue';
import TeacherMessage from '@/components/companion/TalkStream/TeacherMessage.vue';
import UserMessage from '@/components/companion/TalkStream/UserMessage.vue';
import { ERROR_MESSAGE_KEYS } from '@/shared/errors';
import type { RetryableTurn, TalkMessage } from '@/types/session';

const props = defineProps<{
  messages: TalkMessage[];
  historyOpen: boolean;
  developerMode: boolean;
  demoMode?: boolean;
  retryableTurn?: RetryableTurn | null;
}>();

const emit = defineEmits<{
  toggleHistory: [];
  retry: [];
}>();

const { t } = useI18n();

const retryMessage = computed(() =>
  props.retryableTurn?.errorCode
    ? t(ERROR_MESSAGE_KEYS[props.retryableTurn.errorCode])
    : t('companion.noReply'),
);

const hasHistory = computed(() => props.messages.length > 4);

const visibleMessages = computed(() => {
  if (!hasHistory.value || props.historyOpen) {
    return props.messages;
  }

  return props.messages.slice(-4);
});
</script>

<template>
  <HistoryToggle
    v-if="hasHistory"
    :expanded="historyOpen"
    @toggle="emit('toggleHistory')"
  />

  <TransitionGroup name="message" tag="div" class="message-list">
    <template v-for="item in visibleMessages" :key="item.id">
      <TeacherMessage
        v-if="item.role === 'teacher'"
        :text="item.text"
        :suggest-close="item.suggestClose"
        :developer-mode="developerMode"
        :demo-mode="demoMode === true"
        :request-id="item.requestId"
        :sources="item.sources"
        :citation-status="item.citationStatus"
        :research-skipped="item.researchSkipped"
      />
      <UserMessage v-else-if="item.role === 'user'" :text="item.text" />
      <MaintenanceMessage v-else :text="item.text" />
    </template>
  </TransitionGroup>

  <RetryNotice
    v-if="retryableTurn"
    :message="retryMessage"
    @retry="emit('retry')"
  />
</template>

<style scoped>
.message-list {
  display: contents;
}

.message-enter-active,
.message-leave-active,
.message-move {
  transition:
    opacity 240ms ease,
    transform 240ms var(--ease-out);
}

.message-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.message-leave-to {
  opacity: 0;
}

.message-leave-active {
  position: absolute;
}
</style>
