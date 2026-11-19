<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import AppButton from '@/components/ui/AppButton.vue';
import AppInput from '@/components/ui/AppInput.vue';
import NoteEditor from '@/renderer/note/NoteEditor.vue';
import { tapAlongApi } from '@/api/tap-along';
import type { NoteDoc } from '@/shared/note-doc';
import type { ImageCapabilityStatus } from '@/shared/providers';

defineProps<{
  doc: NoteDoc;
  source: string;
  error: string;
  imageCapability?: ImageCapabilityStatus;
}>();

const emit = defineEmits<{
  'update:doc': [doc: NoteDoc];
  'update:source': [value: string];
  submit: [];
}>();

const { t } = useI18n();
const noteField = ref<InstanceType<typeof NoteEditor> | null>(null);
const uploadingCount = ref(0);

const focus = () => noteField.value?.focus();

const submit = () => {
  if (uploadingCount.value > 0) {
    return;
  }

  emit('submit');
};

defineExpose({ focus });
</script>

<template>
  <form class="form" novalidate @submit.prevent="submit">
    <div class="form__note-wrap">
      <NoteEditor
        ref="noteField"
        class="note-field"
        :doc="doc"
        :invalid="Boolean(error)"
        :aria-label="t('newPage.bodyAria')"
        :image-capability="imageCapability"
        :upload-image="tapAlongApi.createPageImage"
        autofocus
        :placeholder="t('newPage.placeholder')"
        @update:doc="emit('update:doc', $event)"
        @uploading-change="uploadingCount = $event"
      />
      <Transition name="error">
        <p v-if="error" class="form__error" role="alert">{{ error }}</p>
      </Transition>
    </div>

    <label class="source-field">
      <span class="source-field__label">{{ t('newPage.sourceLabel') }}</span>
      <AppInput
        :model-value="source"
        :aria-label="t('newPage.sourceAria')"
        :placeholder="t('newPage.sourcePlaceholder')"
        @update:model-value="emit('update:source', $event)"
      />
    </label>

    <div class="form__submit">
      <AppButton
        type="submit"
        :disabled="uploadingCount > 0"
        :aria-busy="uploadingCount > 0"
      >
        {{ t('newPage.submit') }}
      </AppButton>
    </div>
  </form>
</template>

<style scoped>
.form {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.form__note-wrap {
  position: relative;
  flex: 1;
  min-height: 230px;
  display: flex;
}

.note-field {
  flex: 1;
  min-height: 230px;
  padding: 24px 26px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--paper-raised);
  font-size: 15px;
  line-height: 1.85;
  color: var(--ink);
  transition:
    border-color 180ms ease,
    box-shadow 180ms ease;
}

.note-field:focus-within {
  border-color: #c9c1b4;
  box-shadow: 0 0 0 3px rgb(196 184 166 / 14%);
}

.form__error {
  position: absolute;
  right: 16px;
  bottom: 10px;
  z-index: 1;
  margin: 0;
  padding: 3px 8px;
  border-radius: 6px;
  background: var(--paper-raised);
  color: #8f6358;
  font-size: 11.5px;
  letter-spacing: 0.03em;
}

.error-enter-active,
.error-leave-active {
  transition:
    opacity 160ms ease,
    transform 160ms ease;
}

.error-enter-from,
.error-leave-to {
  opacity: 0;
  transform: translateY(3px);
}

.source-field {
  display: flex;
  align-items: center;
  gap: 10px;
}

.source-field__label {
  color: var(--ink-faint);
  font-size: 12px;
  letter-spacing: 0.08em;
}

.source-field :deep(.input) {
  flex: 1;
}

.form__submit {
  display: flex;
  justify-content: flex-end;
}
</style>
