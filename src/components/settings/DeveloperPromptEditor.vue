<script setup lang="ts">
import { toRaw } from 'vue';
import { useI18n } from 'vue-i18n';
import DeveloperPromptField from '@/components/settings/DeveloperPromptField.vue';
import type { PromptCatalogValues } from '@/shared/prompts';

const props = defineProps<{
  modelValue: PromptCatalogValues;
  defaults: PromptCatalogValues;
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
        :default-value="defaults.provider.connectionTest"
        :reset-label="t('settings.restoreFieldDefault')"
        :label="t('settings.promptFields.connectionTest.label')"
        :description="t('settings.promptFields.connectionTest.description')"
        @update:model-value="updateField('provider.connectionTest', $event)"
        @reset="
          updateField(
            'provider.connectionTest',
            defaults.provider.connectionTest,
          )
        "
      />
    </section>

    <section class="prompt-editor__group" aria-labelledby="prompt-group-core">
      <h4 id="prompt-group-core">{{ t('settings.promptGroups.core') }}</h4>
      <DeveloperPromptField
        :model-value="modelValue.teacher.system"
        :default-value="defaults.teacher.system"
        :reset-label="t('settings.restoreFieldDefault')"
        :label="t('settings.promptFields.system.label')"
        :description="t('settings.promptFields.system.description')"
        @update:model-value="updateField('teacher.system', $event)"
        @reset="updateField('teacher.system', defaults.teacher.system)"
      />
      <DeveloperPromptField
        :model-value="modelValue.teacher.languagePolicy"
        :default-value="defaults.teacher.languagePolicy"
        :reset-label="t('settings.restoreFieldDefault')"
        :label="t('settings.promptFields.languagePolicy.label')"
        :description="t('settings.promptFields.languagePolicy.description')"
        @update:model-value="updateField('teacher.languagePolicy', $event)"
        @reset="
          updateField('teacher.languagePolicy', defaults.teacher.languagePolicy)
        "
      />
      <DeveloperPromptField
        :model-value="modelValue.teacher.contextBoundary"
        :default-value="defaults.teacher.contextBoundary"
        :reset-label="t('settings.restoreFieldDefault')"
        :label="t('settings.promptFields.contextBoundary.label')"
        :description="t('settings.promptFields.contextBoundary.description')"
        @update:model-value="updateField('teacher.contextBoundary', $event)"
        @reset="
          updateField(
            'teacher.contextBoundary',
            defaults.teacher.contextBoundary,
          )
        "
      />
    </section>

    <section class="prompt-editor__group" aria-labelledby="prompt-group-modes">
      <h4 id="prompt-group-modes">{{ t('settings.promptGroups.modes') }}</h4>
      <DeveloperPromptField
        :model-value="modelValue.teacher.resume"
        :default-value="defaults.teacher.resume"
        :reset-label="t('settings.restoreFieldDefault')"
        :label="t('settings.promptFields.resume.label')"
        :description="t('settings.promptFields.resume.description')"
        @update:model-value="updateField('teacher.resume', $event)"
        @reset="updateField('teacher.resume', defaults.teacher.resume)"
      />
      <DeveloperPromptField
        :model-value="modelValue.teacher.maintenance"
        :default-value="defaults.teacher.maintenance"
        :reset-label="t('settings.restoreFieldDefault')"
        :label="t('settings.promptFields.maintenance.label')"
        :description="t('settings.promptFields.maintenance.description')"
        @update:model-value="updateField('teacher.maintenance', $event)"
        @reset="
          updateField('teacher.maintenance', defaults.teacher.maintenance)
        "
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
        :default-value="defaults.teacher.compressedContextPolicy"
        :reset-label="t('settings.restoreFieldDefault')"
        :label="t('settings.promptFields.compressedContextPolicy.label')"
        :description="
          t('settings.promptFields.compressedContextPolicy.description')
        "
        @update:model-value="
          updateField('teacher.compressedContextPolicy', $event)
        "
        @reset="
          updateField(
            'teacher.compressedContextPolicy',
            defaults.teacher.compressedContextPolicy,
          )
        "
      />
      <DeveloperPromptField
        :model-value="modelValue.teacher.context.currentPage"
        :default-value="defaults.teacher.context.currentPage"
        :reset-label="t('settings.restoreFieldDefault')"
        :label="t('settings.promptFields.currentPage.label')"
        :description="t('settings.promptFields.currentPage.description')"
        @update:model-value="updateField('teacher.context.currentPage', $event)"
        @reset="
          updateField(
            'teacher.context.currentPage',
            defaults.teacher.context.currentPage,
          )
        "
      />
      <DeveloperPromptField
        :model-value="modelValue.teacher.context.closedPage"
        :default-value="defaults.teacher.context.closedPage"
        :reset-label="t('settings.restoreFieldDefault')"
        :label="t('settings.promptFields.closedPage.label')"
        :description="t('settings.promptFields.closedPage.description')"
        @update:model-value="updateField('teacher.context.closedPage', $event)"
        @reset="
          updateField(
            'teacher.context.closedPage',
            defaults.teacher.context.closedPage,
          )
        "
      />
      <DeveloperPromptField
        :model-value="modelValue.teacher.context.targetPage"
        :default-value="defaults.teacher.context.targetPage"
        :reset-label="t('settings.restoreFieldDefault')"
        :label="t('settings.promptFields.targetPage.label')"
        :description="t('settings.promptFields.targetPage.description')"
        @update:model-value="updateField('teacher.context.targetPage', $event)"
        @reset="
          updateField(
            'teacher.context.targetPage',
            defaults.teacher.context.targetPage,
          )
        "
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
        :default-value="defaults.teacher.maintenanceAction.edit"
        :reset-label="t('settings.restoreFieldDefault')"
        :label="t('settings.promptFields.editAction.label')"
        :description="t('settings.promptFields.editAction.description')"
        @update:model-value="
          updateField('teacher.maintenanceAction.edit', $event)
        "
        @reset="
          updateField(
            'teacher.maintenanceAction.edit',
            defaults.teacher.maintenanceAction.edit,
          )
        "
      />
      <DeveloperPromptField
        :model-value="modelValue.teacher.maintenanceAction.append"
        :default-value="defaults.teacher.maintenanceAction.append"
        :reset-label="t('settings.restoreFieldDefault')"
        :label="t('settings.promptFields.appendAction.label')"
        :description="t('settings.promptFields.appendAction.description')"
        @update:model-value="
          updateField('teacher.maintenanceAction.append', $event)
        "
        @reset="
          updateField(
            'teacher.maintenanceAction.append',
            defaults.teacher.maintenanceAction.append,
          )
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
