<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ContextThought } from '@/shared/context';

const props = defineProps<{
  pageId: number;
  thoughts: ContextThought[];
}>();

const emit = defineEmits<{
  hide: [];
}>();

const { t } = useI18n();

const openIds = ref<Set<number>>(new Set());

const lineThoughts = computed(() =>
  props.thoughts.filter((thought) => thought.kind === 'line'),
);
const branchThoughts = computed(() =>
  props.thoughts.filter((thought) => thought.kind === 'branch'),
);

const anyOpen = computed(() =>
  props.thoughts.some((thought) => openIds.value.has(thought.pageId)),
);

const isOpen = (pageId: number) => openIds.value.has(pageId);

const initializeOpen = (thoughts: ContextThought[]) => {
  const newestBranch = thoughts
    .filter((thought) => thought.kind === 'branch')
    .at(-1);

  if (newestBranch) {
    openIds.value = new Set([newestBranch.pageId]);
    return;
  }

  openIds.value = new Set(thoughts.length > 0 ? [thoughts[0].pageId] : []);
};

watch(
  () => [props.pageId, props.thoughts] as const,
  ([pageId, thoughts], previous) => {
    const pageChanged = !previous || previous[0] !== pageId;

    if (pageChanged) {
      initializeOpen(thoughts);
      return;
    }

    const previousIds = new Set(previous[1].map((thought) => thought.pageId));
    const newBranches = thoughts.filter(
      (thought) =>
        thought.kind === 'branch' && !previousIds.has(thought.pageId),
    );
    const validIds = new Set(thoughts.map((thought) => thought.pageId));
    const nextOpen = new Set(
      [...openIds.value].filter((pageIdValue) => validIds.has(pageIdValue)),
    );

    newBranches.forEach((thought) => nextOpen.add(thought.pageId));
    openIds.value = nextOpen;
  },
  { immediate: true, deep: true },
);

const toggle = (pageId: number) => {
  const next = new Set(openIds.value);

  if (next.has(pageId)) {
    next.delete(pageId);
  } else {
    next.add(pageId);
  }

  openIds.value = next;
};

const toggleAll = () => {
  openIds.value = anyOpen.value
    ? new Set()
    : new Set(props.thoughts.map((thought) => thought.pageId));
};

const indexLabel = (thought: ContextThought) => {
  if (thought.kind === 'branch') {
    return '↳';
  }

  const index = lineThoughts.value.findIndex(
    (entry) => entry.pageId === thought.pageId,
  );

  return String(index + 1).padStart(2, '0');
};
</script>

<template>
  <aside class="thoughts-rail" :aria-label="t('thoughts.heading')">
    <header class="thoughts-rail__head">
      <div class="thoughts-rail__heading">
        <div class="thoughts-rail__title">
          {{ t('thoughts.heading') }}
          <span class="thoughts-rail__count">{{ thoughts.length }}</span>
        </div>
        <div class="thoughts-rail__sub">{{ t('thoughts.sub') }}</div>
      </div>

      <div class="thoughts-rail__tools">
        <button
          v-if="thoughts.length > 1"
          class="thoughts-rail__tool"
          type="button"
          @click="toggleAll"
        >
          {{ anyOpen ? t('thoughts.collapseAll') : t('thoughts.expandAll') }}
        </button>
        <button
          class="thoughts-rail__hide"
          type="button"
          :title="t('thoughts.hideRail')"
          :aria-label="t('thoughts.hideRail')"
          @click="emit('hide')"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="m3 3 5 5-5 5M8 3l5 5-5 5" />
          </svg>
        </button>
      </div>
    </header>

    <div class="thoughts-rail__scroll">
      <section
        v-if="lineThoughts.length > 0"
        class="thoughts-rail__group"
        :aria-label="t('thoughts.lineGroup')"
      >
        <h3 class="thoughts-rail__group-label">
          {{ t('thoughts.lineGroup') }}
        </h3>

        <article
          v-for="thought in lineThoughts"
          :key="thought.pageId"
          class="thought"
          :data-open="isOpen(thought.pageId)"
        >
          <button
            class="thought__head"
            type="button"
            :aria-expanded="isOpen(thought.pageId)"
            :aria-controls="`thought-body-${thought.pageId}`"
            @click="toggle(thought.pageId)"
          >
            <span class="thought__index">{{ indexLabel(thought) }}</span>
            <span class="thought__text">
              <span class="thought__title">
                {{ thought.title || t('thoughts.untitled') }}
              </span>
              <span v-if="thought.source" class="thought__source">
                {{ thought.source }}
              </span>
            </span>
            <svg
              class="thought__chevron"
              viewBox="0 0 16 16"
              aria-hidden="true"
            >
              <path d="m4 6 4 4 4-4" />
            </svg>
          </button>

          <div
            v-show="isOpen(thought.pageId)"
            :id="`thought-body-${thought.pageId}`"
            class="thought__body"
          >
            <p>{{ thought.body }}</p>
          </div>
        </article>
      </section>

      <section
        v-if="branchThoughts.length > 0"
        class="thoughts-rail__group thoughts-rail__group--branch"
        :aria-label="t('thoughts.branchGroup')"
      >
        <h3 class="thoughts-rail__group-label">
          {{ t('thoughts.branchGroup') }}
        </h3>

        <article
          v-for="thought in branchThoughts"
          :key="thought.pageId"
          class="thought thought--branch"
          :data-open="isOpen(thought.pageId)"
        >
          <button
            class="thought__head"
            type="button"
            :aria-expanded="isOpen(thought.pageId)"
            :aria-controls="`thought-body-${thought.pageId}`"
            @click="toggle(thought.pageId)"
          >
            <span class="thought__index">{{ indexLabel(thought) }}</span>
            <span class="thought__text">
              <span class="thought__title">
                {{ thought.title || t('thoughts.untitled') }}
              </span>
              <span v-if="thought.source" class="thought__source">
                {{ thought.source }}
              </span>
            </span>
            <svg
              class="thought__chevron"
              viewBox="0 0 16 16"
              aria-hidden="true"
            >
              <path d="m4 6 4 4 4-4" />
            </svg>
          </button>

          <div
            v-show="isOpen(thought.pageId)"
            :id="`thought-body-${thought.pageId}`"
            class="thought__body"
          >
            <p>{{ thought.body }}</p>
          </div>
        </article>
      </section>
    </div>

    <footer class="thoughts-rail__foot">
      <span>{{ t('thoughts.readOnly') }}</span>
      <span>{{ t('thoughts.noDiscussion') }}</span>
    </footer>
  </aside>
</template>

<style scoped>
.thoughts-rail {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  height: 100%;
  padding: 2rem 0 1.5rem 26px;
  border-left: 1px solid var(--line-soft);
}

.thoughts-rail__head {
  flex: none;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--line-soft);
}

.thoughts-rail__title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--ink);
  font-family: var(--serif);
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.thoughts-rail__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--ink-faint);
  font-family: var(--sans);
  font-size: 9px;
  letter-spacing: 0.04em;
}

.thoughts-rail__sub {
  margin-top: 5px;
  color: var(--ink-ghost);
  font-size: 9.5px;
  letter-spacing: 0.03em;
  line-height: 1.5;
}

.thoughts-rail__tools {
  display: flex;
  flex: none;
  align-items: center;
  gap: 1px;
  margin-top: -2px;
}

.thoughts-rail__tool {
  padding: 4px 5px;
  border: 0;
  background: none;
  color: var(--ink-faint);
  font: inherit;
  font-size: 9.5px;
  letter-spacing: 0.03em;
  cursor: pointer;
  transition: color 160ms ease;
}

.thoughts-rail__tool:hover {
  color: var(--moss);
}

.thoughts-rail__tool:focus-visible,
.thoughts-rail__hide:focus-visible {
  outline: 2px solid var(--moss);
  outline-offset: 2px;
}

.thoughts-rail__hide {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 50%;
  background: none;
  color: var(--ink-faint);
  cursor: pointer;
  transition:
    color 160ms ease,
    background-color 160ms ease;
}

.thoughts-rail__hide:hover {
  background: var(--paper-deep);
  color: var(--ink);
}

.thoughts-rail__hide svg {
  width: 13px;
  height: 13px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.3;
}

.thoughts-rail__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 6px;
  scrollbar-width: thin;
  scrollbar-color: var(--line) transparent;
  overscroll-behavior: contain;
}

.thoughts-rail__scroll::-webkit-scrollbar {
  width: 6px;
}

.thoughts-rail__scroll::-webkit-scrollbar-thumb {
  border-radius: 3px;
  background: var(--line);
}

.thoughts-rail__group + .thoughts-rail__group {
  margin-top: 2px;
  border-top: 1px solid var(--line);
}

.thoughts-rail__group-label {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 12px 0 3px;
  color: var(--ink-ghost);
  font-family: var(--sans);
  font-size: 9px;
  font-weight: 400;
  letter-spacing: 0.08em;
}

.thoughts-rail__group-label::before {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--ink-ghost);
  content: '';
}

.thoughts-rail__group--branch .thoughts-rail__group-label {
  color: var(--moss);
}

.thoughts-rail__group--branch .thoughts-rail__group-label::before {
  background: var(--moss);
}

.thought {
  border-bottom: 1px solid var(--line-soft);
}

.thoughts-rail__group .thought:last-child {
  border-bottom: 0;
}

.thought__head {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) 16px;
  gap: 8px;
  align-items: start;
  width: 100%;
  padding: 15px 0 14px;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.thought__head:focus-visible {
  outline: 2px solid var(--moss);
  outline-offset: 2px;
}

.thought__index {
  padding-top: 2px;
  color: var(--ink-ghost);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 9px;
  letter-spacing: 0.06em;
  font-variant-numeric: tabular-nums;
}

.thought__text {
  display: block;
  min-width: 0;
}

.thought__title {
  display: block;
  color: var(--ink-soft);
  font-family: var(--serif);
  font-size: 14px;
  font-weight: 500;
  line-height: 1.55;
  letter-spacing: 0.01em;
  transition: color 160ms ease;
}

.thought__source {
  display: block;
  margin-top: 4px;
  overflow: hidden;
  color: var(--ink-ghost);
  font-size: 10px;
  letter-spacing: 0.03em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.thought__chevron {
  width: 14px;
  height: 14px;
  margin-top: 4px;
  fill: none;
  stroke: var(--ink-ghost);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.35;
  transition:
    transform 220ms cubic-bezier(0.2, 0.8, 0.3, 1),
    stroke 160ms ease;
}

.thought__head:hover .thought__title {
  color: var(--ink);
}

.thought__head:hover .thought__chevron {
  stroke: var(--ink-faint);
}

.thought[data-open='true'] .thought__title {
  color: var(--ink);
}

.thought[data-open='true'] .thought__chevron {
  stroke: var(--ink-faint);
  transform: rotate(180deg);
}

.thought__body {
  padding: 0 0 21px 32px;
}

.thought__body p {
  margin: 0;
  color: var(--ink-soft);
  font-family: var(--serif);
  font-size: 13px;
  line-height: 1.95;
  letter-spacing: 0.008em;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.thought--branch .thought__index {
  color: var(--moss);
  font-family: var(--sans);
  font-size: 11px;
}

.thoughts-rail__foot {
  flex: none;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--line-soft);
  color: var(--ink-ghost);
  font-size: 9px;
  letter-spacing: 0.03em;
  white-space: nowrap;
}

@media (width <= 1024px) {
  .thoughts-rail {
    padding: 1.5rem 0 1.25rem 16px;
  }

  .thoughts-rail__title {
    gap: 6px;
    font-size: 13px;
  }

  .thoughts-rail__count {
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    font-size: 8.5px;
  }

  .thoughts-rail__sub {
    margin-top: 4px;
    font-size: 9px;
    white-space: normal;
  }

  .thoughts-rail__tool {
    padding: 4px 3px;
    font-size: 8.5px;
  }

  .thoughts-rail__hide {
    width: 22px;
    height: 22px;
  }

  .thought__head {
    grid-template-columns: 20px minmax(0, 1fr) 14px;
    gap: 6px;
    padding: 12px 0 11px;
  }

  .thought__index {
    font-size: 8.5px;
  }

  .thought__title {
    font-size: 13px;
    line-height: 1.5;
  }

  .thought__source {
    margin-top: 3px;
    font-size: 9px;
  }

  .thought__body {
    padding: 0 0 16px 26px;
  }

  .thought__body p {
    font-size: 12px;
    line-height: 1.9;
  }

  .thoughts-rail__foot {
    padding-top: 10px;
    font-size: 8.5px;
  }
}
</style>
