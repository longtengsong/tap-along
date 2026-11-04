<script setup lang="ts">
import { computed } from 'vue';
import HistoryToggle from '@/components/ui/HistoryToggle.vue';
import MaintenanceMessage from '@/components/companion/TalkStream/MaintenanceMessage.vue';
import TeacherMessage from '@/components/companion/TalkStream/TeacherMessage.vue';
import UserMessage from '@/components/companion/TalkStream/UserMessage.vue';
import type { TalkMessage } from '@/types/session';

const props = defineProps<{
  messages: TalkMessage[];
  historyOpen: boolean;
  developerMode: boolean;
}>();

const emit = defineEmits<{
  toggleHistory: [];
}>();

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
        :request-id="item.requestId"
        :sources="item.sources"
        :citation-status="item.citationStatus"
      />
      <UserMessage v-else-if="item.role === 'user'" :text="item.text" />
      <MaintenanceMessage v-else :text="item.text" />
    </template>
  </TransitionGroup>
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
