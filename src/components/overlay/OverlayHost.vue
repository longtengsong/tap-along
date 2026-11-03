<script setup lang="ts">
import FailedOverlay from '@/components/overlay/FailedOverlay.vue';
import SavingOverlay from '@/components/overlay/SavingOverlay.vue';
import TeacherNoResponseOverlay from '@/components/overlay/TeacherNoResponseOverlay.vue';
import type { OverlayState } from '@/types/session';

defineProps<{
  overlay: OverlayState;
  errorMessage: string;
}>();

const emit = defineEmits<{
  backToEdit: [];
  retrySave: [];
  retryTeacher: [];
  openSettings: [];
}>();
</script>

<template>
  <Transition name="overlay-switch">
    <SavingOverlay v-if="overlay === 'saving'" />
    <FailedOverlay
      v-else-if="overlay === 'failed'"
      :message="errorMessage"
      @back="emit('backToEdit')"
      @retry="emit('retrySave')"
    />
    <TeacherNoResponseOverlay
      v-else-if="overlay === 'teacher-no-response'"
      :message="errorMessage"
      @retry="emit('retryTeacher')"
      @open-settings="emit('openSettings')"
    />
  </Transition>
</template>

<style scoped>
.overlay-switch-enter-active,
.overlay-switch-leave-active {
  transition: opacity 180ms ease;
}

.overlay-switch-enter-from,
.overlay-switch-leave-to {
  opacity: 0;
}
</style>
