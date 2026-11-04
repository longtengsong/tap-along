<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import AppBar from '@/components/layout/AppBar.vue';
import ContentColumn from '@/components/layout/ContentColumn.vue';
import AppButton from '@/components/ui/AppButton.vue';
import type { PageRecord } from '@/types/session';

defineProps<{
  pages: PageRecord[];
  loading: boolean;
  error: string;
  demoMode: boolean;
}>();

const emit = defineEmits<{
  back: [];
  open: [pageId: number];
  retry: [];
  settings: [];
}>();

const { t } = useI18n();
</script>

<template>
  <section class="screen screen--archive" aria-labelledby="archive-title">
    <AppBar
      back-visible
      :archive-visible="false"
      :demo-mode="demoMode"
      @back="emit('back')"
      @settings="emit('settings')"
    />
    <ContentColumn>
      <div class="archive">
        <header class="archive__header">
          <h2 id="archive-title" class="archive__title">
            {{ t('archive.title') }}
          </h2>
          <p class="archive__subtitle">{{ t('archive.subtitle') }}</p>
        </header>

        <p v-if="loading" class="archive__message" role="status">
          {{ t('archive.loading') }}
        </p>

        <div v-else-if="error" class="archive__message" role="alert">
          <p>{{ error }}</p>
          <AppButton variant="ghost" size="small" @click="emit('retry')">
            {{ t('archive.retry') }}
          </AppButton>
        </div>

        <p v-else-if="pages.length === 0" class="archive__message">
          {{ t('archive.empty') }}
        </p>

        <ul v-else class="archive__list">
          <li v-for="page in pages" :key="page.id">
            <button
              class="archive__item"
              type="button"
              @click="emit('open', page.id)"
            >
              <span class="archive__item-title">{{ page.title }}</span>
              <span class="archive__item-meta">
                {{ t('companion.sourcePrefix') }}{{ page.source || '—' }}
                <span aria-hidden="true">·</span>
                {{ t('status.closed') }}
              </span>
            </button>
          </li>
        </ul>
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

.archive {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 24px 40px 40px;
}

.archive__header {
  flex-shrink: 0;
}

.archive__title {
  margin: 0;
  color: var(--ink);
  font-family: var(--serif);
  font-size: 22px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.archive__subtitle {
  margin: 8px 0 0;
  color: var(--ink-faint);
  font-size: 12.5px;
  line-height: 1.7;
  letter-spacing: 0.03em;
}

.archive__message {
  flex-shrink: 0;
  margin: 0;
  padding: 18px 20px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--paper-raised);
  color: var(--ink-faint);
  font-size: 13px;
  line-height: 1.7;
}

.archive__message p {
  margin: 0 0 12px;
}

.archive__list {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.archive__item {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 17px 20px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--paper-raised);
  color: var(--ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 180ms ease,
    background-color 180ms ease;
}

.archive__item:hover {
  border-color: var(--ink-ghost);
  background: #f6f2ea;
}

.archive__item:focus-visible {
  outline: 2px solid var(--moss);
  outline-offset: 3px;
}

.archive__item-title {
  font-family: var(--serif);
  font-size: 16px;
  font-weight: 600;
  line-height: 1.5;
}

.archive__item-meta {
  color: var(--ink-faint);
  font-size: 11.5px;
  letter-spacing: 0.03em;
}

@keyframes screen-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
}

@media (width <= 640px) {
  .archive {
    padding: 12px 20px 28px;
  }
}
</style>
