<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import AppBar from '@/components/layout/AppBar.vue';
import ContentColumn from '@/components/layout/ContentColumn.vue';
import NewPageForm from '@/components/newpage/NewPageForm.vue';
import NoticeBar from '@/components/ui/NoticeBar.vue';

const props = defineProps<{
  body: string;
  source: string;
  canBack: boolean;
  deep: boolean;
  error: string;
}>();

const emit = defineEmits<{
  'update:body': [value: string];
  'update:source': [value: string];
  submit: [];
  back: [];
  settings: [];
}>();

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
      @back="emit('back')"
      @settings="emit('settings')"
    />
    <ContentColumn>
      <h2 id="new-page-title" class="sr-only">新页边</h2>
      <div class="new-page">
        <NoticeBar v-if="deep" text="页叠得有点深了，先合上一页再继续？" />
        <NewPageForm
          ref="form"
          :body="body"
          :source="source"
          :error="error"
          @update:body="emit('update:body', $event)"
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
