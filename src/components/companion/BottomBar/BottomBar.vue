<script setup lang="ts">
import ClosedNote from '@/components/companion/BottomBar/ClosedNote.vue';
import Composer from '@/components/companion/BottomBar/Composer.vue';
import type { ComposerMode } from '@/types/session';

defineProps<{
  mode: ComposerMode;
  modelValue: string;
  typing: boolean;
  canCancel: boolean;
  cancelling: boolean;
  sayMoreOpen: boolean;
  closed: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  submit: [];
  cancelTeacher: [];
  toggleSayMore: [];
  edit: [];
  append: [];
  newPage: [];
  close: [];
}>();
</script>

<template>
  <ClosedNote v-if="closed" />
  <Composer
    v-else
    :mode="mode"
    :model-value="modelValue"
    :typing="typing"
    :can-cancel="canCancel"
    :cancelling="cancelling"
    :say-more-open="sayMoreOpen"
    @update:model-value="emit('update:modelValue', $event)"
    @submit="emit('submit')"
    @cancel-teacher="emit('cancelTeacher')"
    @toggle-say-more="emit('toggleSayMore')"
    @edit="emit('edit')"
    @append="emit('append')"
    @new-page="emit('newPage')"
    @close="emit('close')"
  />
</template>
