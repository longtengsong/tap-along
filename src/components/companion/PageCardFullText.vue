<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import NoteDocView from '@/components/note/NoteDocView.vue';
import type { NoteDoc } from '@/shared/note-doc';

const props = defineProps<{
  title: string;
  doc: NoteDoc;
}>();

const emit = defineEmits<{
  close: [];
  'image-click': [imageId: string, alt: string];
}>();

const { t } = useI18n();
const panel = ref<HTMLElement | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);
let previousFocus: HTMLElement | null = null;
let previousOverflow = '';

const close = () => {
  emit('close');
};

const onImageClick = (imageId: string, alt: string) => {
  emit('image-click', imageId, alt);
};

const focusableElements = () =>
  Array.from(
    panel.value?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ) ?? [],
  );

const onTab = (event: KeyboardEvent) => {
  const elements = focusableElements();

  if (elements.length === 0) {
    return;
  }

  const first = elements[0];
  const last = elements[elements.length - 1];
  const active = document.activeElement;

  if (
    event.shiftKey &&
    (active === first || !elements.includes(active as HTMLElement))
  ) {
    event.preventDefault();
    last.focus();
    return;
  }

  if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
};

onMounted(() => {
  previousFocus =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  void nextTick(() => {
    closeButton.value?.focus();
  });
});

onBeforeUnmount(() => {
  document.body.style.overflow = previousOverflow;

  if (previousFocus?.isConnected) {
    previousFocus.focus();
  }
});
</script>

<template>
  <Teleport to="body">
    <div
      class="full-text"
      role="presentation"
      @mousedown.self="close"
      @keydown.esc.stop.prevent="close"
      @keydown.tab="onTab"
    >
      <section
        ref="panel"
        class="full-text__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="full-text-title"
      >
        <header class="full-text__header">
          <h2 id="full-text-title" class="full-text__title">
            {{ props.title || t('companion.fullText') }}
          </h2>
          <button
            ref="closeButton"
            type="button"
            class="full-text__close"
            @click="close"
          >
            {{ t('companion.closeFullText') }}
          </button>
        </header>
        <div class="full-text__body">
          <NoteDocView :doc="doc" @image-click="onImageClick" />
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.full-text {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgb(38 34 28 / 48%);
  backdrop-filter: blur(3px);
}

.full-text__panel {
  width: min(720px, 100%);
  max-height: min(86vh, 900px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--paper-raised);
  box-shadow: 0 24px 80px rgb(38 34 28 / 22%);
}

.full-text__header {
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 22px 14px;
  border-bottom: 1px solid var(--line-soft);
}

.full-text__title {
  margin: 0;
  color: var(--ink);
  font-size: 17px;
  font-weight: 500;
  line-height: 1.5;
}

.full-text__close {
  flex-shrink: 0;
  padding: 4px 0;
  border: 0;
  background: transparent;
  color: var(--ink-faint);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.full-text__close:hover {
  color: var(--ink);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.full-text__close:focus-visible {
  outline: 2px solid var(--moss);
  outline-offset: 3px;
  border-radius: 4px;
}

.full-text__body {
  min-height: 0;
  overflow-y: auto;
  padding: 18px 22px 24px;
}

@media (max-width: 640px) {
  .full-text {
    padding: 12px;
  }

  .full-text__panel {
    max-height: calc(100dvh - 24px);
    border-radius: 14px;
  }

  .full-text__header {
    padding: 16px 16px 12px;
  }

  .full-text__body {
    padding: 14px 16px calc(20px + env(safe-area-inset-bottom));
  }
}
</style>
