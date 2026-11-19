<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import PageCardEditMode from '@/components/companion/PageCard/PageCardEditMode.vue';
import PageCardFullText from '@/components/companion/PageCardFullText.vue';
import PageCardHeader from '@/components/companion/PageCard/PageCardHeader.vue';
import PageCardSummary from '@/components/companion/PageCard/PageCardSummary.vue';
import ImageLightbox from '@/components/companion/ImageLightbox.vue';
import { countNoteImages, docFromPlainText } from '@/shared/note-doc';
import type { NoteDoc } from '@/shared/note-doc';
import type { ImageCapabilityStatus } from '@/shared/providers';
import type { PageRecord } from '@/types/session';

const props = defineProps<{
  page: PageRecord;
  canGenerateTitle?: boolean;
  canEditTitle?: boolean;
  imageCapability?: ImageCapabilityStatus;
}>();

const emit = defineEmits<{
  'update-edit-doc': [doc: NoteDoc];
  saveEdit: [];
  cancelEdit: [];
  generateTitle: [];
  startTitleEdit: [];
  cancelTitleEdit: [];
  saveTitleEdit: [value: string];
}>();

const fullTextOpen = ref(false);
const lightboxImage = ref<{ src: string; alt: string } | null>(null);
const readerDoc = computed(
  () => props.page.doc ?? docFromPlainText(props.page.body),
);
const imageCount = computed(() => countNoteImages(readerDoc.value));

const openFullText = () => {
  fullTextOpen.value = true;
};

const closeFullText = () => {
  fullTextOpen.value = false;
  lightboxImage.value = null;
};

const openLightbox = (imageId: string, alt: string) => {
  lightboxImage.value = {
    src: `tap-image://img/${imageId}`,
    alt,
  };
};

watch(
  () => props.page.editing,
  (editing) => {
    if (editing) {
      closeFullText();
    }
  },
);
</script>

<template>
  <article class="page-card" :class="{ 'page-card--editing': page.editing }">
    <PageCardHeader
      :title="page.title"
      :source="page.source"
      :status="page.status"
      :can-generate="canGenerateTitle && !page.editing"
      :generating="page.titleGenerating"
      :can-edit="canEditTitle && !page.editing"
      :editing="page.titleEditing"
      :saving="page.titleSaving"
      :error="page.titleError"
      @generate-title="emit('generateTitle')"
      @start-edit="emit('startTitleEdit')"
      @cancel-edit="emit('cancelTitleEdit')"
      @save-edit="emit('saveTitleEdit', $event)"
    />
    <PageCardEditMode
      v-if="page.editing && page.editDoc"
      :doc="page.editDoc"
      :image-capability="imageCapability"
      @update:doc="emit('update-edit-doc', $event)"
      @save="emit('saveEdit')"
      @cancel="emit('cancelEdit')"
    />
    <PageCardSummary
      v-else
      :body="page.body"
      :image-count="imageCount"
      @open-full-text="openFullText"
    />

    <PageCardFullText
      v-if="fullTextOpen && !page.editing"
      :title="page.title"
      :doc="readerDoc"
      @close="closeFullText"
      @image-click="openLightbox"
    />
    <ImageLightbox
      v-if="lightboxImage"
      :src="lightboxImage.src"
      :alt="lightboxImage.alt"
      @close="lightboxImage = null"
    />
  </article>
</template>

<style scoped>
.page-card {
  flex-shrink: 0;
  margin-top: 4px;
  padding: 20px 24px 18px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background:
    linear-gradient(120deg, rgb(255 255 255 / 82%), transparent 58%),
    var(--paper-raised);
  box-shadow: 0 1px 0 rgb(255 255 255 / 72%) inset;
  transition:
    border-color 220ms ease,
    box-shadow 220ms ease;
}

.page-card--editing {
  padding-bottom: 14px;
  border-color: #d8d1c5;
  box-shadow: 0 8px 24px -22px rgb(70 56 36 / 42%);
}

@media (width <= 640px) {
  .page-card {
    padding: 17px 18px 16px;
  }
}
</style>
