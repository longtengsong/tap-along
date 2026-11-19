<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  src: string;
  alt: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

const { t } = useI18n();
const closeButton = ref<HTMLButtonElement | null>(null);
const panel = ref<HTMLElement | null>(null);
let previousFocus: HTMLElement | null = null;

const close = () => {
  emit('close');
};

const onTab = (event: KeyboardEvent) => {
  const elements = Array.from(
    panel.value?.querySelectorAll<HTMLElement>(
      'button, [href], [tabindex]:not([tabindex="-1"])',
    ) ?? [],
  );

  if (elements.length === 0) {
    return;
  }

  const active = document.activeElement;

  if (event.shiftKey && active === elements[0]) {
    event.preventDefault();
    elements[elements.length - 1].focus();
    return;
  }

  if (!event.shiftKey && active === elements[elements.length - 1]) {
    event.preventDefault();
    elements[0].focus();
  }
};

onMounted(() => {
  previousFocus =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

  void nextTick(() => {
    closeButton.value?.focus();
  });
});

onBeforeUnmount(() => {
  if (previousFocus?.isConnected) {
    previousFocus.focus();
  }
});
</script>

<template>
  <Teleport to="body">
    <div
      class="lightbox"
      role="presentation"
      @mousedown.self="close"
      @keydown.esc.stop.prevent="close"
      @keydown.tab="onTab"
    >
      <section
        ref="panel"
        class="lightbox__panel"
        role="dialog"
        aria-modal="true"
        :aria-label="t('companion.image')"
      >
        <button
          ref="closeButton"
          type="button"
          class="lightbox__close"
          @click="close"
        >
          {{ t('companion.closeImage') }}
        </button>
        <img
          class="lightbox__image"
          :src="props.src"
          :alt="props.alt || t('companion.image')"
          @mousedown.stop
        />
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.lightbox {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  background: rgb(20 18 15 / 88%);
}

.lightbox__panel {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  max-width: 100%;
  max-height: 100%;
}

.lightbox__image {
  display: block;
  max-width: 90vw;
  max-height: 85vh;
  border-radius: 6px;
  object-fit: contain;
  box-shadow: 0 24px 80px rgb(0 0 0 / 32%);
}

.lightbox__close {
  position: absolute;
  top: -38px;
  right: 0;
  padding: 4px 0;
  border: 0;
  background: transparent;
  color: rgb(255 255 255 / 76%);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.lightbox__close:hover {
  color: #fff;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.lightbox__close:focus-visible {
  outline: 2px solid rgb(255 255 255 / 76%);
  outline-offset: 3px;
  border-radius: 4px;
}

@media (max-width: 640px) {
  .lightbox {
    padding: 16px;
  }

  .lightbox__image {
    max-width: calc(100vw - 24px);
    max-height: calc(100dvh - 80px);
  }

  .lightbox__close {
    top: -32px;
  }
}
</style>
