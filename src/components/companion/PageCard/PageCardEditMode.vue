<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { tapAlongApi } from '@/api/tap-along';
import AppButton from '@/components/ui/AppButton.vue';
import NoteEditor from '@/renderer/note/NoteEditor.vue';
import type { NoteDoc } from '@/shared/note-doc';
import type { ImageCapabilityStatus } from '@/shared/providers';

defineProps<{
  doc: NoteDoc;
  imageCapability?: ImageCapabilityStatus;
}>();

const emit = defineEmits<{
  'update:doc': [doc: NoteDoc];
  save: [];
  cancel: [];
}>();

const { t } = useI18n();
const uploadingCount = ref(0);

const save = () => {
  if (uploadingCount.value > 0) {
    return;
  }

  emit('save');
};
</script>

<template>
  <NoteEditor
    class="edit-area"
    :doc="doc"
    :aria-label="t('companion.editBodyAria')"
    :image-capability="imageCapability"
    :upload-image="tapAlongApi.createPageImage"
    autofocus
    compact
    @update:doc="emit('update:doc', $event)"
    @uploading-change="uploadingCount = $event"
  />
  <div class="edit-actions">
    <AppButton variant="text" @click="emit('cancel')">
      {{ t('common.cancel') }}
    </AppButton>
    <AppButton
      size="small"
      :disabled="uploadingCount > 0"
      :aria-busy="uploadingCount > 0"
      @click="save"
    >
      {{ t('actions.saveEdit') }}
    </AppButton>
  </div>
</template>

<style scoped>
.edit-area {
  min-height: 92px;
  margin-top: 12px;
  padding: 13px 15px;
  border: 0;
  border-radius: 10px;
  background: var(--line-soft);
  font-size: 15px;
  line-height: 1.85;
}

.edit-area:focus-within {
  box-shadow: inset 0 0 0 1px #d9d2c7;
}

.edit-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 7px;
  margin-top: 10px;
}
</style>
