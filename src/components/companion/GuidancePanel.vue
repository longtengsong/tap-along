<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { GuidanceView } from '@/shared/guidance';

defineProps<{
  guidance: GuidanceView;
  typing: boolean;
  error?: string;
}>();

const emit = defineEmits<{
  use: [suggestionId: string];
  retry: [];
}>();

const { t } = useI18n();
</script>

<template>
  <div
    v-if="guidance.status === 'pending'"
    class="guidance guidance--pending"
    role="status"
  >
    <span class="guidance__pulse" aria-hidden="true"></span>
    {{ t('guidance.pending') }}
  </div>

  <section
    v-else-if="guidance.status === 'needed'"
    class="guidance guidance--needed"
    aria-labelledby="guidance-heading"
  >
    <h2 id="guidance-heading" class="guidance__heading">
      {{ t('guidance.heading') }}
    </h2>

    <ul class="guidance__list">
      <li
        v-for="suggestion in guidance.suggestions"
        :key="suggestion.id"
        class="guidance__card"
      >
        <p v-if="suggestion.anchorQuote" class="guidance__anchor">
          {{ t('guidance.anchor', { quote: suggestion.anchorQuote }) }}
        </p>
        <p class="guidance__meta">
          {{ t('guidance.fromPage', { title: suggestion.title }) }}
          <span v-if="suggestion.source"> · {{ suggestion.source }}</span>
        </p>
        <p class="guidance__why">{{ suggestion.why }}</p>
        <button
          class="guidance__action"
          type="button"
          :disabled="suggestion.used || typing"
          @click="emit('use', suggestion.id)"
        >
          {{ suggestion.used ? t('guidance.used') : t('guidance.action') }}
        </button>
      </li>
    </ul>

    <p v-if="error" class="guidance__error" role="alert">
      {{ error }}
    </p>
  </section>

  <div
    v-else-if="
      guidance.status === 'failed' || guidance.status === 'no_candidates'
    "
    class="guidance guidance--retry"
    role="status"
  >
    <p class="guidance__retry-hint">{{ t('guidance.retryHint') }}</p>
    <button class="guidance__retry" type="button" @click="emit('retry')">
      {{ t('guidance.retryAction') }}
    </button>
    <p v-if="error" class="guidance__error" role="alert">{{ error }}</p>
  </div>

  <div
    v-else-if="guidance.status === 'not_needed'"
    class="guidance guidance--notice"
    role="status"
  >
    {{ t('guidance.notNeeded') }}
  </div>
</template>

<style scoped>
.guidance {
  flex-shrink: 0;
  margin-top: 12px;
}

.guidance--pending {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 2px 0;
  color: var(--ink-ghost);
  font-size: 10.5px;
  letter-spacing: 0.04em;
}

.guidance__pulse {
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: var(--moss-soft);
  animation: guidance-pulse 1.5s ease-in-out infinite;
}

.guidance--needed {
  padding: 12px 14px 10px;
  border: 1px solid var(--line-soft);
  border-radius: 14px;
  background: rgb(255 254 250 / 48%);
}

.guidance__heading {
  margin: 0 0 8px;
  color: var(--ink-faint);
  font-family: var(--serif);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.08em;
}

.guidance__list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.guidance__card {
  display: grid;
  gap: 4px;
  padding: 10px 11px;
  border: 1px solid var(--line-soft);
  border-radius: 11px;
  background: rgb(255 255 255 / 38%);
}

.guidance__anchor {
  margin: 0;
  overflow: hidden;
  color: var(--ink-soft);
  font-family: var(--serif);
  font-size: 11.5px;
  line-height: 1.6;
  letter-spacing: 0.01em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.guidance__meta {
  margin: 0;
  color: var(--ink-ghost);
  font-size: 9.5px;
  letter-spacing: 0.03em;
}

.guidance__why {
  margin: 0;
  color: var(--ink-soft);
  font-family: var(--serif);
  font-size: 12.5px;
  line-height: 1.7;
}

.guidance__action {
  justify-self: start;
  margin-top: 2px;
  padding: 3px 0;
  border: 0;
  background: transparent;
  color: var(--moss);
  font: inherit;
  font-size: 10.5px;
  letter-spacing: 0.04em;
  cursor: pointer;
}

.guidance__action:hover:not(:disabled) {
  color: var(--ink);
}

.guidance__action:disabled {
  color: var(--ink-ghost);
  cursor: default;
}

.guidance__action:focus-visible {
  outline: 2px solid var(--moss);
  outline-offset: 2px;
}

.guidance--retry {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 12px;
  padding: 10px 12px;
  border: 1px solid var(--line-soft);
  border-radius: 12px;
  background: rgb(255 254 250 / 48%);
}

.guidance__retry-hint {
  margin: 0;
  color: var(--ink-faint);
  font-family: var(--serif);
  font-size: 12px;
  line-height: 1.7;
}

.guidance__retry {
  padding: 2px 0;
  border: 0;
  background: transparent;
  color: var(--moss);
  font: inherit;
  font-size: 10.5px;
  letter-spacing: 0.04em;
  cursor: pointer;
}

.guidance__retry:hover {
  color: var(--ink);
}

.guidance__retry:focus-visible {
  outline: 2px solid var(--moss);
  outline-offset: 2px;
}

.guidance--notice {
  padding: 2px 2px 0;
  color: var(--ink-faint);
  font-family: var(--serif);
  font-size: 12px;
  line-height: 1.7;
}

.guidance__error {
  margin: 8px 0 0;
  color: #96645a;
  font-size: 10.5px;
}

@keyframes guidance-pulse {
  50% {
    opacity: 0.35;
    transform: scale(0.85);
  }
}

@media (width <= 640px) {
  .guidance--needed {
    padding: 10px 12px 8px;
  }
}
</style>
