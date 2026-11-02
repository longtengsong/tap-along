<script setup lang="ts">
import AppButton from '@/components/ui/AppButton.vue';
import AppTextArea from '@/components/ui/AppTextArea.vue';

defineProps<{
  value: string;
}>();

const emit = defineEmits<{
  'update:value': [value: string];
  save: [];
  cancel: [];
}>();
</script>

<template>
  <AppTextArea
    class="edit-area"
    :model-value="value"
    aria-label="编辑页边正文"
    @update:model-value="emit('update:value', $event)"
  />
  <div class="edit-actions">
    <AppButton variant="text" @click="emit('cancel')">取消</AppButton>
    <AppButton size="small" @click="emit('save')">收好批注</AppButton>
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
  resize: vertical;
}

.edit-area:focus {
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
