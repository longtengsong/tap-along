<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import MessageList from '@/components/companion/TalkStream/MessageList.vue';
import TypingIndicator from '@/components/ui/TypingIndicator.vue';
import type { RetryableTurn, TalkMessage } from '@/types/session';

const props = defineProps<{
  messages: TalkMessage[];
  historyOpen: boolean;
  typing: boolean;
  developerMode: boolean;
  demoMode?: boolean;
  retryableTurn?: RetryableTurn | null;
}>();

const emit = defineEmits<{
  toggleHistory: [];
  retry: [];
}>();

const scroller = ref<HTMLElement | null>(null);

const scrollToBottom = async () => {
  await nextTick();
  if (scroller.value) {
    scroller.value.scrollTop = scroller.value.scrollHeight;
  }
};

watch(
  () => [
    props.messages.length,
    props.historyOpen,
    props.typing,
    props.retryableTurn,
  ],
  scrollToBottom,
  { immediate: true },
);
</script>

<template>
  <div ref="scroller" class="talk-stream" aria-live="polite">
    <MessageList
      :messages="messages"
      :history-open="historyOpen"
      :developer-mode="developerMode"
      :demo-mode="demoMode === true"
      :retryable-turn="retryableTurn"
      @toggle-history="emit('toggleHistory')"
      @retry="emit('retry')"
    />
    <TypingIndicator v-if="typing" />
  </div>
</template>

<style scoped>
.talk-stream {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 25px 4px 16px;
  scrollbar-color: var(--line) transparent;
  scrollbar-width: thin;
  overscroll-behavior: contain;
}

.talk-stream::-webkit-scrollbar {
  width: 6px;
}

.talk-stream::-webkit-scrollbar-track {
  background: transparent;
}

.talk-stream::-webkit-scrollbar-thumb {
  border-radius: 3px;
  background: var(--line);
}

.talk-stream::-webkit-scrollbar-thumb:hover {
  background: var(--ink-ghost);
}
</style>
