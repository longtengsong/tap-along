<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import AppButton from '@/components/ui/AppButton.vue';
import ContentColumn from '@/components/layout/ContentColumn.vue';

const emit = defineEmits<{
  configure: [];
  demo: [];
}>();

const { t } = useI18n();
</script>

<template>
  <section class="first-run" aria-labelledby="first-run-title">
    <ContentColumn>
      <div class="first-run__card">
        <p class="first-run__eyebrow">{{ t('app.name') }}</p>
        <h1 id="first-run-title" class="first-run__title">
          {{ t('onboarding.title') }}
        </h1>
        <p class="first-run__lead">{{ t('onboarding.lead') }}</p>
        <p class="first-run__detail">{{ t('onboarding.detail') }}</p>

        <div class="first-run__actions">
          <AppButton @click="emit('configure')">
            {{ t('onboarding.configure') }}
          </AppButton>
          <AppButton variant="ghost" @click="emit('demo')">
            {{ t('onboarding.demo') }}
          </AppButton>
        </div>

        <p class="first-run__privacy">{{ t('settings.privacyText') }}</p>
      </div>
    </ContentColumn>
  </section>
</template>

<style scoped>
.first-run {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 32px;
  overflow-y: auto;
}

.first-run__card {
  max-width: 480px;
  margin: 0 auto;
  padding: 42px 44px;
  border: 1px solid var(--line);
  border-radius: 20px;
  background:
    linear-gradient(135deg, rgb(255 255 255 / 82%), transparent 62%),
    var(--paper-raised);
  box-shadow: 0 1px 0 rgb(255 255 255 / 72%) inset;
}

.first-run__eyebrow {
  margin: 0 0 18px;
  color: var(--ink-ghost);
  font-size: 10.5px;
  letter-spacing: 0.16em;
}

.first-run__title {
  margin: 0;
  color: var(--ink);
  font-family: var(--serif);
  font-size: 26px;
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: 0.03em;
}

.first-run__lead {
  margin: 16px 0 0;
  color: var(--ink-soft);
  font-family: var(--serif);
  font-size: 14px;
  line-height: 1.8;
}

.first-run__detail {
  margin: 10px 0 0;
  color: var(--ink-faint);
  font-size: 12.5px;
  line-height: 1.8;
}

.first-run__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 26px;
}

.first-run__privacy {
  margin: 24px 0 0;
  padding-top: 16px;
  border-top: 1px solid var(--line-soft);
  color: var(--ink-ghost);
  font-size: 11px;
  line-height: 1.7;
}

@media (width <= 640px) {
  .first-run {
    padding: 20px;
  }

  .first-run__card {
    padding: 30px 24px;
  }

  .first-run__title {
    font-size: 23px;
  }
}
</style>
