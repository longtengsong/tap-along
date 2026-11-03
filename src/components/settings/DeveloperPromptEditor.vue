<script setup lang="ts">
import { toRaw } from 'vue';
import { useI18n } from 'vue-i18n';
import DeveloperPromptField from '@/components/settings/DeveloperPromptField.vue';
import type { PromptCatalogValues } from '@/shared/prompts';

const props = defineProps<{
  modelValue: PromptCatalogValues;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: PromptCatalogValues];
}>();

const { t } = useI18n();

type PromptPath =
  | 'provider.connectionTest'
  | 'teacher.system'
  | 'teacher.languagePolicy'
  | 'teacher.contextBoundary'
  | 'teacher.resume'
  | 'teacher.maintenance'
  | 'teacher.compressedContextPolicy'
  | 'teacher.context.currentPage'
  | 'teacher.context.closedPage'
  | 'teacher.context.targetPage'
  | 'teacher.maintenanceAction.edit'
  | 'teacher.maintenanceAction.append';

const updateField = (path: PromptPath, value: string) => {
  const next = structuredClone(toRaw(props.modelValue));

  switch (path) {
    case 'provider.connectionTest':
      next.provider.connectionTest = value;
      break;
    case 'teacher.system':
      next.teacher.system = value;
      break;
    case 'teacher.languagePolicy':
      next.teacher.languagePolicy = value;
      break;
    case 'teacher.contextBoundary':
      next.teacher.contextBoundary = value;
      break;
    case 'teacher.resume':
      next.teacher.resume = value;
      break;
    case 'teacher.maintenance':
      next.teacher.maintenance = value;
      break;
    case 'teacher.compressedContextPolicy':
      next.teacher.compressedContextPolicy = value;
      break;
    case 'teacher.context.currentPage':
      next.teacher.context.currentPage = value;
      break;
    case 'teacher.context.closedPage':
      next.teacher.context.closedPage = value;
      break;
    case 'teacher.context.targetPage':
      next.teacher.context.targetPage = value;
      break;
    case 'teacher.maintenanceAction.edit':
      next.teacher.maintenanceAction.edit = value;
      break;
    case 'teacher.maintenanceAction.append':
      next.teacher.maintenanceAction.append = value;
      break;
  }

  emit('update:modelValue', next);
};
</script>

<template>
  <div class="prompt-editor">
    <section
      class="prompt-editor__group"
      aria-labelledby="prompt-group-provider"
    >
      <h4 id="prompt-group-provider">
        {{ t('settings.promptGroups.provider') }}
      </h4>
      <DeveloperPromptField
        :model-value="modelValue.provider.connectionTest"
        :label="t('settings.promptFields.connectionTest.label')"
        :description="t('settings.promptFields.connectionTest.description')"
        @update:model-value="updateField('provider.connectionTest', $event)"
      />
    </section>

    <section class="prompt-editor__group" aria-labelledby="prompt-group-core">
      <h4 id="prompt-group-core">{{ t('settings.promptGroups.core') }}</h4>
      <DeveloperPromptField
        :model-value="modelValue.teacher.system"
        :label="t('settings.promptFields.system.label')"
        :description="t('settings.promptFields.system.description')"
        @update:model-value="updateField('teacher.system', $event)"
      />
      <DeveloperPromptField
        :model-value="modelValue.teacher.languagePolicy"
        :label="t('settings.promptFields.languagePolicy.label')"
        :description="t('settings.promptFields.languagePolicy.description')"
        @update:model-value="updateField('teacher.languagePolicy', $event)"
      />
      <DeveloperPromptField
        :model-value="modelValue.teacher.contextBoundary"
        :label="t('settings.promptFields.contextBoundary.label')"
        :description="t('settings.promptFields.contextBoundary.description')"
        @update:model-value="updateField('teacher.contextBoundary', $event)"
      />
    </section>

    <section class="prompt-editor__group" aria-labelledby="prompt-group-modes">
      <h4 id="prompt-group-modes">{{ t('settings.promptGroups.modes') }}</h4>
      <DeveloperPromptField
        :model-value="modelValue.teacher.resume"
        :label="t('settings.promptFields.resume.label')"
        :description="t('settings.promptFields.resume.description')"
        @update:model-value="updateField('teacher.resume', $event)"
      />
      <DeveloperPromptField
        :model-value="modelValue.teacher.maintenance"
        :label="t('settings.promptFields.maintenance.label')"
        :description="t('settings.promptFields.maintenance.description')"
        @update:model-value="updateField('teacher.maintenance', $event)"
      />
    </section>

    <section
      class="prompt-editor__group"
      aria-labelledby="prompt-group-context"
    >
      <h4 id="prompt-group-context">
        {{ t('settings.promptGroups.context') }}
      </h4>
      <DeveloperPromptField
        :model-value="modelValue.teacher.compressedContextPolicy"
        :label="t('settings.promptFields.compressedContextPolicy.label')"
        :description="
          t('settings.promptFields.compressedContextPolicy.description')
        "
        @update:model-value="
          updateField('teacher.compressedContextPolicy', $event)
        "
      />
      <DeveloperPromptField
        :model-value="modelValue.teacher.context.currentPage"
        :label="t('settings.promptFields.currentPage.label')"
        :description="t('settings.promptFields.currentPage.description')"
        @update:model-value="updateField('teacher.context.currentPage', $event)"
      />
      <DeveloperPromptField
        :model-value="modelValue.teacher.context.closedPage"
        :label="t('settings.promptFields.closedPage.label')"
        :description="t('settings.promptFields.closedPage.description')"
        @update:model-value="updateField('teacher.context.closedPage', $event)"
      />
      <DeveloperPromptField
        :model-value="modelValue.teacher.context.targetPage"
        :label="t('settings.promptFields.targetPage.label')"
        :description="t('settings.promptFields.targetPage.description')"
        @update:model-value="updateField('teacher.context.targetPage', $event)"
      />
    </section>

    <section
      class="prompt-editor__group"
      aria-labelledby="prompt-group-maintenance"
    >
      <h4 id="prompt-group-maintenance">
        {{ t('settings.promptGroups.maintenance') }}
      </h4>
      <DeveloperPromptField
        :model-value="modelValue.teacher.maintenanceAction.edit"
        :label="t('settings.promptFields.editAction.label')"
        :description="t('settings.promptFields.editAction.description')"
        @update:model-value="
          updateField('teacher.maintenanceAction.edit', $event)
        "
      />
      <DeveloperPromptField
        :model-value="modelValue.teacher.maintenanceAction.append"
        :label="t('settings.promptFields.appendAction.label')"
        :description="t('settings.promptFields.appendAction.description')"
        @update:model-value="
          updateField('teacher.maintenanceAction.append', $event)
        "
      />
    </section>
  </div>
</template>

<style scoped>
.prompt-editor {
  display: grid;
  gap: 24px;
}

.prompt-editor__group {
  display: grid;
  gap: 16px;
}

.prompt-editor__group + .prompt-editor__group {
  padding-top: 22px;
  border-top: 1px solid var(--line-soft);
}

.prompt-editor__group h4 {
  margin: 0;
  color: var(--moss);
  font-family: var(--serif);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.06em;
}
</style>
