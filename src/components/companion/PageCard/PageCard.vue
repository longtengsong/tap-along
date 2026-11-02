<script setup lang="ts">
import PageCardEditMode from '@/components/companion/PageCard/PageCardEditMode.vue';
import PageCardHeader from '@/components/companion/PageCard/PageCardHeader.vue';
import PageCardSummary from '@/components/companion/PageCard/PageCardSummary.vue';
import type { PageRecord } from '@/types/session';

defineProps<{
  page: PageRecord;
}>();

const emit = defineEmits<{
  'update-edit-draft': [value: string];
  saveEdit: [];
  cancelEdit: [];
}>();
</script>

<template>
  <article class="page-card" :class="{ 'page-card--editing': page.editing }">
    <PageCardHeader
      :title="page.title"
      :source="page.source"
      :status="page.status"
    />
    <PageCardEditMode
      v-if="page.editing"
      :value="page.editDraft"
      @update:value="emit('update-edit-draft', $event)"
      @save="emit('saveEdit')"
      @cancel="emit('cancelEdit')"
    />
    <PageCardSummary v-else :body="page.body" />
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
