<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import AppButton from '@/components/ui/AppButton.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppTextArea from '@/components/ui/AppTextArea.vue';

defineProps<{
  body: string;
  source: string;
  error: string;
}>();

const emit = defineEmits<{
  'update:body': [value: string];
  'update:source': [value: string];
  submit: [];
}>();

const { t } = useI18n();
const noteField = ref<InstanceType<typeof AppTextArea> | null>(null);

const focus = () => noteField.value?.focus();

defineExpose({ focus });
</script>

<template>
  <form class="form" novalidate @submit.prevent="emit('submit')">
    <div class="form__note-wrap">
      <AppTextArea
        ref="noteField"
        class="note-field"
        :model-value="body"
        :invalid="Boolean(error)"
        :aria-label="t('newPage.bodyAria')"
        autofocus
        :placeholder="t('newPage.placeholder')"
        @update:model-value="emit('update:body', $event)"
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
      <AppButton type="submit">{{ t('newPage.submit') }}</AppButton>
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
}

.form__error {
  position: absolute;
  right: 16px;
  bottom: 10px;
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
  transform: translateY(2px);
}

.source-field {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 4px 16px;
  border-bottom: 1px solid var(--line);
}

.source-field:focus-within {
  border-bottom-color: var(--ink-ghost);
}

.source-field__label {
  flex-shrink: 0;
  color: var(--ink-faint);
  font-size: 12.5px;
  letter-spacing: 0.08em;
}

.form__submit {
  display: flex;
  justify-content: flex-end;
  padding-top: 2px;
}

@media (width <= 640px) {
  .note-field {
    padding: 20px;
  }
}
</style>
