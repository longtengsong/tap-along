<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { tapAlongApi } from '@/api/tap-along';
import SourceList from '@/components/companion/TalkStream/SourceList.vue';
import { ERROR_MESSAGE_KEYS } from '@/shared/errors';
import type { TeacherRequestInspection } from '@/shared/pages';
import type { TeacherSource } from '@/shared/search';

const props = defineProps<{
  text: string;
  suggestClose?: boolean;
  developerMode: boolean;
  requestId?: string;
  sources?: TeacherSource[];
  citationStatus?: 'cited' | 'uncited';
  researchSkipped?: boolean;
}>();

const { t } = useI18n();
const expanded = ref(false);
const loading = ref(false);
const error = ref('');
const inspection = ref<TeacherRequestInspection | null>(null);
const inspectable = ref(false);

/**
 * 只有真实发生过、且仍在主进程内存里的请求才提供入口。
 * 开场白、引导问题等消息也带 requestId，但并没有对应的 LLM 请求；
 * 历史消息可能已超出本次运行的保留范围。先探测再显示，避免点开才报错。
 */
const probeInspection = async () => {
  inspectable.value = false;

  if (!props.developerMode || !props.requestId) {
    return;
  }

  const requestId = props.requestId;

  try {
    const result = await tapAlongApi.inspectTeacherRequest(requestId);

    if (requestId !== props.requestId || !props.developerMode) {
      return;
    }

    inspectable.value = result.ok && Boolean(result.request);
  } catch {
    inspectable.value = false;
  }
};

const loadInspection = async () => {
  if (!props.requestId || loading.value) {
    return;
  }

  loading.value = true;
  error.value = '';

  try {
    const result = await tapAlongApi.inspectTeacherRequest(props.requestId);

    if (!result.ok) {
      error.value = t(ERROR_MESSAGE_KEYS[result.errorCode ?? 'UNKNOWN_ERROR']);
      return;
    }

    if (!result.request) {
      error.value = t('settings.teacherRequestUnavailable');
      return;
    }

    inspection.value = result.request;
  } catch {
    error.value = t(ERROR_MESSAGE_KEYS.READ_FAILED);
  } finally {
    loading.value = false;
  }
};

const toggleInspection = async () => {
  expanded.value = !expanded.value;

  if (expanded.value && !inspection.value) {
    await loadInspection();
  }
};

watch(
  () => [props.developerMode, props.requestId],
  () => {
    expanded.value = false;
    inspection.value = null;
    error.value = '';
    inspectable.value = false;
    void probeInspection();
  },
  { immediate: true },
);
</script>

<template>
  <div
    class="teacher-message"
    :class="{ 'teacher-message--suggestion': suggestClose }"
  >
    <div class="message" :aria-label="t('a11y.teacherMessage')">
      {{ text }}
    </div>

    <SourceList v-if="sources && sources.length > 0" :sources="sources" />
    <p v-if="researchSkipped" class="teacher-message__uncited">
      {{ t('research.notOnline') }}
    </p>
    <p v-if="citationStatus === 'uncited'" class="teacher-message__uncited">
      {{ t('research.uncited') }}
    </p>

    <button
      v-if="developerMode && requestId && inspectable"
      class="teacher-message__inspect"
      type="button"
      :aria-expanded="expanded"
      @click="toggleInspection"
    >
      <span aria-hidden="true">&lt;/&gt;</span>
      {{
        expanded
          ? t('settings.teacherRequestHide')
          : t('settings.teacherRequestView')
      }}
    </button>

    <Transition name="request-panel">
      <section
        v-if="expanded"
        class="teacher-message__request"
        :aria-label="t('settings.teacherRequestTitle')"
      >
        <p v-if="loading" class="teacher-message__feedback">
          {{ t('common.loading') }}
        </p>
        <p v-else-if="error" class="teacher-message__error" role="alert">
          {{ error }}
        </p>
        <template v-else-if="inspection">
          <header class="teacher-message__request-header">
            <div>
              <strong>{{ t('settings.teacherRequestTitle') }}</strong>
              <span v-if="inspection.model">
                {{ inspection.providerId }} / {{ inspection.model }}
              </span>
            </div>
            <span
              class="teacher-message__status"
              :class="`teacher-message__status--${inspection.status}`"
            >
              {{ t(`settings.teacherRequestStatus.${inspection.status}`) }}
            </span>
          </header>

          <p
            v-if="inspection.status === 'fallback'"
            class="teacher-message__fallback"
          >
            {{ t('settings.teacherRequestFallback') }}
          </p>
          <p v-else-if="inspection.errorCode" class="teacher-message__error">
            {{ t(ERROR_MESSAGE_KEYS[inspection.errorCode]) }}
          </p>
          <div v-else class="teacher-message__messages">
            <article
              v-for="(message, index) in inspection.messages"
              :key="`${message.role}-${index}`"
              class="teacher-message__message"
              :class="`teacher-message__message--${message.role}`"
            >
              <span>{{ message.role }}</span>
              <pre>{{ message.content }}</pre>
            </article>
          </div>
        </template>
      </section>
    </Transition>
  </div>
</template>

<style scoped>
.teacher-message {
  max-width: 82%;
  align-self: flex-start;
}

.message {
  white-space: pre-wrap;
  color: var(--ink);
  font-family: var(--serif);
  font-size: 15.5px;
  line-height: 1.9;
  letter-spacing: 0.01em;
}

.teacher-message--suggestion .message {
  position: relative;
  padding-left: 14px;
}

.teacher-message--suggestion .message::before {
  position: absolute;
  top: 0.52em;
  bottom: 0.52em;
  left: 0;
  width: 2px;
  border-radius: 2px;
  background: var(--moss-soft);
  content: '';
}

.teacher-message__inspect {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-top: 5px;
  padding: 3px 0;
  border: 0;
  background: transparent;
  color: var(--ink-ghost);
  font: inherit;
  font-size: 9px;
  letter-spacing: 0.06em;
  cursor: pointer;
}

.teacher-message__inspect:hover {
  color: var(--moss);
}

.teacher-message__inspect:focus-visible {
  outline: 2px solid var(--moss);
  outline-offset: 2px;
}

.teacher-message__inspect span {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.teacher-message__request {
  margin-top: 8px;
  padding: 13px;
  border: 1px solid var(--line-soft);
  border-radius: 12px;
  background: rgb(255 254 250 / 66%);
  box-shadow: 0 10px 24px -22px rgb(44 35 23 / 40%);
}

.teacher-message__request-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.teacher-message__request-header strong,
.teacher-message__request-header span {
  display: block;
}

.teacher-message__request-header strong {
  color: var(--ink-soft);
  font-family: inherit;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.teacher-message__request-header div > span {
  margin-top: 3px;
  color: var(--ink-ghost);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 8.5px;
}

.teacher-message__status {
  flex: none;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--line-soft);
  color: var(--ink-faint);
  font-family: inherit;
  font-size: 8.5px;
}

.teacher-message__status--sent {
  background: var(--moss-soft);
  color: var(--moss);
}

.teacher-message__status--failed {
  background: rgb(142 85 75 / 9%);
  color: #96645a;
}

.teacher-message__status--fallback {
  background: rgb(168 126 58 / 10%);
  color: var(--amber);
}

.teacher-message__messages {
  display: grid;
  gap: 8px;
  margin-top: 11px;
}

.teacher-message__message {
  overflow: hidden;
  border-left: 2px solid var(--line);
  border-radius: 0 7px 7px 0;
  background: rgb(255 255 255 / 38%);
}

.teacher-message__message > span {
  display: block;
  padding: 6px 9px 0;
  color: var(--ink-ghost);
  font-size: 7.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.teacher-message__message pre {
  max-height: 190px;
  overflow: auto;
  margin: 0;
  padding: 6px 9px 9px;
  color: var(--ink-soft);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 9.5px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.teacher-message__message--system {
  border-left-color: var(--moss);
}

.teacher-message__message--user {
  border-left-color: var(--amber);
}

.teacher-message__message--assistant {
  border-left-color: var(--ink-ghost);
}

.teacher-message__feedback,
.teacher-message__error,
.teacher-message__fallback {
  margin: 0;
  font-family: inherit;
  font-size: 10px;
  line-height: 1.6;
  white-space: normal;
}

.teacher-message__feedback {
  color: var(--ink-faint);
}

.teacher-message__error {
  margin-top: 8px;
  color: #96645a;
}

.teacher-message__uncited {
  margin: 6px 0 0;
  color: var(--amber);
  font-size: 10px;
  line-height: 1.55;
}

.teacher-message__fallback {
  margin-top: 10px;
  color: var(--amber);
}

.request-panel-enter-active,
.request-panel-leave-active {
  transition:
    opacity 160ms ease,
    transform 180ms var(--ease-out);
}

.request-panel-enter-from,
.request-panel-leave-to {
  opacity: 0;
  transform: translateY(-3px);
}
</style>
