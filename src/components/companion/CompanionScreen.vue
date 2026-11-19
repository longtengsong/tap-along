<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { tapAlongApi } from '@/api/tap-along';
import AppBar from '@/components/layout/AppBar.vue';
import BottomBar from '@/components/companion/BottomBar/BottomBar.vue';
import ContentColumn from '@/components/layout/ContentColumn.vue';
import PageCard from '@/components/companion/PageCard/PageCard.vue';
import GuidancePanel from '@/components/companion/GuidancePanel.vue';
import SessionThoughtsRail from '@/components/companion/SessionThoughtsRail.vue';
import TalkStream from '@/components/companion/TalkStream/TalkStream.vue';
import type { ContextThought } from '@/shared/context';
import type { NoteDoc } from '@/shared/note-doc';
import type { ImageCapabilityStatus } from '@/shared/providers';
import type { ComposerMode, PageRecord, RetryableTurn } from '@/types/session';

const { t } = useI18n();

const props = defineProps<{
  page: PageRecord;
  developerMode: boolean;
  typing: boolean;
  canBack: boolean;
  archiveVisible: boolean;
  demoMode: boolean;
  composerMode: ComposerMode;
  replyDraft: string;
  sayMoreOpen: boolean;
  canCancel: boolean;
  cancelling: boolean;
  retryableTurn?: RetryableTurn | null;
  canGenerateTitle?: boolean;
  canEditTitle?: boolean;
  imageCapability?: ImageCapabilityStatus;
}>();

const emit = defineEmits<{
  back: [];
  archive: [];
  settings: [];
  updateEditDoc: [doc: NoteDoc];
  saveEdit: [];
  cancelEdit: [];
  toggleHistory: [];
  updateReplyDraft: [value: string];
  submitReply: [];
  cancelTeacher: [];
  toggleSayMore: [];
  edit: [];
  append: [];
  newPage: [];
  close: [];
  retryGuidance: [];
  retryTurn: [];
  generateTitle: [];
  startTitleEdit: [];
  cancelTitleEdit: [];
  saveTitleEdit: [value: string];
}>();

const displayMessages = computed(() => {
  const status = props.page.guidance?.status;

  if (
    props.page.status === 'reading' &&
    (status === 'pending' || status === 'needed' || status === 'not_needed')
  ) {
    return props.page.messages.filter((item) => item.requestId !== 'opening');
  }

  return props.page.messages;
});

const showGuidance = computed(() => {
  const guidance = props.page.guidance;

  return Boolean(
    guidance &&
    props.page.status === 'reading' &&
    !props.page.messages.some((item) => item.role === 'user') &&
    (guidance.status === 'pending' ||
      guidance.status === 'needed' ||
      guidance.status === 'not_needed'),
  );
});

const thoughts = ref<ContextThought[]>([]);
const railHidden = ref(false);
let thoughtsRequest = 0;
let lastPageId = -1;

const fallbackThoughts = (page: PageRecord): ContextThought[] => {
  const result: ContextThought[] = [];
  const seen = new Set<number>();

  for (const suggestion of page.guidance?.suggestions ?? []) {
    for (const note of suggestion.notes) {
      if (seen.has(note.pageId)) {
        continue;
      }

      const body = (note.excerpt ?? '').trim();

      if (!body) {
        continue;
      }

      seen.add(note.pageId);
      result.push({
        pageId: note.pageId,
        title: note.title,
        source: note.source,
        body,
        kind: 'line',
      });
    }
  }

  return result;
};

const loadThoughts = async (page: PageRecord) => {
  const request = ++thoughtsRequest;

  if (page.status !== 'reading') {
    thoughts.value = [];
    return;
  }

  if (!tapAlongApi.supportsContextThoughts()) {
    thoughts.value = fallbackThoughts(page);
    return;
  }

  try {
    const result = await tapAlongApi.listContextThoughts({ pageId: page.id });

    if (request !== thoughtsRequest) {
      return;
    }

    thoughts.value = result.ok
      ? (result.thoughts ?? [])
      : fallbackThoughts(page);
  } catch {
    if (request === thoughtsRequest) {
      thoughts.value = fallbackThoughts(page);
    }
  }
};

watch(
  () => props.page.id,
  (pageId) => {
    lastPageId = pageId;
    railHidden.value = false;
    thoughts.value = [];
  },
  { immediate: true },
);

watch(
  () =>
    [
      props.page.id,
      props.page.status,
      props.page.guidance?.updatedAt,
      props.page.messages.length,
      props.page.body,
    ] as const,
  () => {
    void loadThoughts(props.page);
  },
  { immediate: true },
);

const showThoughtsRail = computed(
  () => props.page.status === 'reading' && thoughts.value.length > 0,
);

const showRailPanel = computed(
  () => showThoughtsRail.value && !railHidden.value,
);
</script>

<template>
  <section
    class="screen screen--companion"
    aria-labelledby="companion-page-title"
  >
    <AppBar
      :back-visible="canBack"
      :archive-visible="archiveVisible"
      :demo-mode="demoMode"
      @back="emit('back')"
      @archive="emit('archive')"
      @settings="emit('settings')"
    />

    <div
      class="workbench"
      :class="{
        'workbench--rail': showThoughtsRail,
        'workbench--rail-hidden': showThoughtsRail && railHidden,
      }"
    >
      <ContentColumn class="conversation-column">
        <h1 id="companion-page-title" class="sr-only">
          {{ t('companion.title') }}
        </h1>
        <PageCard
          :page="page"
          :can-generate-title="canGenerateTitle"
          :can-edit-title="canEditTitle"
          :image-capability="imageCapability"
          @update-edit-doc="emit('updateEditDoc', $event)"
          @save-edit="emit('saveEdit')"
          @cancel-edit="emit('cancelEdit')"
          @generate-title="emit('generateTitle')"
          @start-title-edit="emit('startTitleEdit')"
          @cancel-title-edit="emit('cancelTitleEdit')"
          @save-title-edit="emit('saveTitleEdit', $event)"
        />
        <GuidancePanel
          v-if="showGuidance && page.guidance"
          :guidance="page.guidance"
          :error="page.guidanceError"
          @retry="emit('retryGuidance')"
        />
        <TalkStream
          :messages="displayMessages"
          :history-open="page.historyOpen"
          :typing="typing"
          :developer-mode="developerMode"
          :retryable-turn="retryableTurn"
          @toggle-history="emit('toggleHistory')"
          @retry="emit('retryTurn')"
        />
        <BottomBar
          v-if="!page.editing"
          :mode="composerMode"
          :model-value="replyDraft"
          :typing="typing"
          :say-more-open="sayMoreOpen"
          :can-cancel="canCancel"
          :cancelling="cancelling"
          :closed="page.status === 'closed'"
          @update:model-value="emit('updateReplyDraft', $event)"
          @submit="emit('submitReply')"
          @cancel-teacher="emit('cancelTeacher')"
          @toggle-say-more="emit('toggleSayMore')"
          @edit="emit('edit')"
          @append="emit('append')"
          @new-page="emit('newPage')"
          @close="emit('close')"
        />
      </ContentColumn>

      <SessionThoughtsRail
        v-if="showThoughtsRail"
        v-show="showRailPanel"
        :key="page.id"
        :page-id="page.id"
        :thoughts="thoughts"
        @hide="railHidden = true"
      />

      <button
        v-if="showThoughtsRail && railHidden"
        class="rail-dock"
        type="button"
        :aria-label="t('thoughts.showRail')"
        @click="railHidden = false"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="m6 3 5 5-5 5" />
        </svg>
        <span class="rail-dock__label">{{ t('thoughts.dockLabel') }}</span>
        <span class="rail-dock__count">{{ thoughts.length }}</span>
      </button>
    </div>
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

.workbench {
  flex: 1;
  min-height: 0;
  width: 100%;
  max-width: 1180px;
  margin: 0 auto;
  padding: 0 32px;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
}

.workbench .conversation-column {
  width: 100%;
  max-width: 860px;
  margin: 0 auto;
  padding: 2rem;
}

.workbench--rail {
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 32px;
}

.workbench.workbench--rail .conversation-column {
  max-width: 744px;
  padding: 2rem 0;
}

.workbench--rail-hidden {
  grid-template-columns: minmax(0, 1fr) 34px;
  gap: 0;
  padding-right: 0;
}

.workbench.workbench--rail-hidden .conversation-column {
  max-width: 860px;
}

.rail-dock {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  width: 34px;
  padding: 18px 0 14px;
  border: 0;
  border-left: 1px solid var(--line-soft);
  background: linear-gradient(180deg, rgb(255 255 255 / 45%), transparent 32%);
  color: var(--ink-soft);
  font-family: var(--serif);
  font-size: 10.5px;
  letter-spacing: 0.12em;
  cursor: pointer;
  transition:
    color 160ms ease,
    background-color 160ms ease;
}

.rail-dock__label {
  writing-mode: vertical-rl;
  line-height: 1.2;
}

.rail-dock__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  border-radius: 999px;
  background: var(--paper-deep);
  color: var(--ink-faint);
  font-family: var(--sans);
  font-size: 9px;
  letter-spacing: 0;
}

.rail-dock svg {
  width: 12px;
  height: 12px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.3;
  transform: rotate(180deg);
}

.rail-dock:hover {
  background: rgb(255 254 250 / 82%);
  color: var(--moss);
}

.rail-dock:focus-visible {
  outline: 2px solid var(--moss);
  outline-offset: -2px;
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

@media (width <= 1024px) {
  .workbench {
    padding: 0 20px;
  }

  .workbench--rail {
    grid-template-columns: minmax(0, 1fr) 280px;
    gap: 18px;
  }

  .workbench--rail-hidden {
    grid-template-columns: minmax(0, 1fr) 34px;
  }

  .workbench.workbench--rail .conversation-column {
    padding: 1.5rem 0;
  }

  .workbench .conversation-column {
    padding: 1.5rem;
  }

  .workbench--rail-hidden {
    padding-right: 0;
  }
}

@media (width <= 640px) {
  .screen {
    padding: 0;
  }

  .workbench {
    padding: 0 12px;
  }

  .workbench .conversation-column {
    padding: 1.25rem 0;
  }

  .workbench--rail {
    grid-template-columns: minmax(0, 1fr) 240px;
    gap: 12px;
  }

  .workbench--rail-hidden {
    grid-template-columns: minmax(0, 1fr) 34px;
  }
}
</style>
