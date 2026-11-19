<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import AppBar from '@/components/layout/AppBar.vue';
import ContentColumn from '@/components/layout/ContentColumn.vue';
import NewPageForm from '@/components/newpage/NewPageForm.vue';
import NoticeBar from '@/components/ui/NoticeBar.vue';
import type { NoteDoc } from '@/shared/note-doc';
import type { ImageCapabilityStatus } from '@/shared/providers';

const props = defineProps<{
  doc: NoteDoc;
  source: string;
  canBack: boolean;
  demoMode: boolean;
  deep: boolean;
  error: string;
  draftRevision: number;
  imageCapability?: ImageCapabilityStatus;
}>();

const emit = defineEmits<{
  'update:doc': [doc: NoteDoc];
  'update:source': [value: string];
  submit: [];
  back: [];
  archive: [];
  settings: [];
}>();

const { t } = useI18n();
const form = ref<InstanceType<typeof NewPageForm> | null>(null);

watch(
  () => props.error,
  async (error) => {
    if (!error) {
      return;
    }

    await nextTick();
    form.value?.focus();
  },
);
</script>

<template>
  <section class="screen screen--new" aria-labelledby="new-page-title">
    <AppBar
      :back-visible="canBack"
      :demo-mode="demoMode"
      @back="emit('back')"
      @archive="emit('archive')"
      @settings="emit('settings')"
    />
    <ContentColumn>
      <h2 id="new-page-title" class="sr-only">{{ t('newPage.title') }}</h2>
      <div class="new-page">
        <NoticeBar v-if="deep" :text="t('errors.stackTooDeep')" />
        <NewPageForm
          :key="draftRevision"
          ref="form"
          :doc="doc"
          :source="source"
          :error="error"
          :image-capability="imageCapability"
          @update:doc="emit('update:doc', $event)"
          @update:source="emit('update:source', $event)"
          @submit="emit('submit')"
        />
      </div>
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

.new-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 16px 40px 40px;
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
  .new-page {
    padding: 12px 20px 28px;
  }
}
</style>
