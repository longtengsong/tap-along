import { computed, reactive, watch } from 'vue';
import { extractKeyword, tapAlongApi } from '@/api/tap-along';
import { i18n } from '@/i18n';
import { translateFixedMessage } from '@/i18n/fixed-messages';
import {
  clearDraftSnapshot,
  loadDraftSnapshot,
  saveDraftSnapshot,
} from '@/shared/draft';
import type { AppErrorCode } from '@/shared/errors';
import {
  createPendingGuidance,
  type GuidanceUpdatedEvent,
} from '@/shared/guidance';
import {
  extractContentKeyword,
  resolveMockReplyLanguage,
  type ReplyLanguage,
} from '@/shared/conversation-language';
import type {
  AppendPagePayload,
  ClosePagePayload,
  EditPagePayload,
  PageClearAllResult,
  TeacherChunkEvent,
  TeacherDoneEvent,
} from '@/shared/pages';
import type {
  ComposerMode,
  OverlayState,
  PageDraft,
  PageRecord,
  TalkMessage,
} from '@/types/session';

type ViewState = 'new' | 'companion' | 'archive';

const wait = (duration: number) =>
  new Promise((resolve) => window.setTimeout(resolve, duration));

const createId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const message = (
  role: TalkMessage['role'],
  text: string,
  suggestClose = false,
  id: string = createId(),
  requestId?: string,
): TalkMessage => ({
  id,
  role,
  text,
  suggestClose,
  requestId,
});

interface PendingTeacherRequest {
  kind: 'ask' | 'resume' | 'maintenance';
  pageId: number;
  requestId: string;
  tempMessageId: string;
  userText?: string;
  contextPageId?: number;
  maintenanceKind?: 'edit' | 'append';
}

let pendingTeacherRequest: PendingTeacherRequest | null = null;
let pendingAppendRequest: AppendPagePayload | null = null;
let pendingEditRequest: EditPagePayload | null = null;
let pendingCloseRequest: ClosePagePayload | null = null;
let editRequestInFlight = false;
let closeRequestInFlight = false;
let closingPageId: number | null = null;
let teacherEventsReady = false;
let guidanceEventsReady = false;
let restoreStarted = false;
let archiveOriginView: 'new' | 'companion' = 'new';
let archiveOriginIndex = -1;
let archiveReturn: { pages: PageRecord[]; currentIndex: number } | null = null;

const state = reactive({
  booting: true,
  view: 'new' as ViewState,
  pages: [] as PageRecord[],
  currentIndex: -1,
  overlay: null as OverlayState,
  errorCode: null as AppErrorCode | null,
  draft: {
    body: '',
    source: '',
  } as PageDraft,
  draftError: '',
  replyDraft: '',
  typing: false,
  cancelling: false,
  teacherRequestActive: false,
  sayMoreOpen: false,
  composerMode: 'normal' as ComposerMode,
  archivePages: [] as PageRecord[],
  archiveLoading: false,
  archiveError: null as AppErrorCode | null,
  archiveDetailOpen: false,
});

const restoredDraft = loadDraftSnapshot(localStorage);

if (restoredDraft) {
  state.draft.body = restoredDraft.body;
  state.draft.source = restoredDraft.source;
}

watch(
  () => [state.draft.body, state.draft.source] as const,
  ([body, source]) => {
    if (!body.trim() && !source.trim()) {
      clearDraftSnapshot(localStorage);
      return;
    }

    saveDraftSnapshot(localStorage, { body, source });
  },
  { flush: 'sync' },
);

const findPage = (pageId: number) =>
  state.pages.find((page) => page.id === pageId) ?? null;

const handleTeacherChunk = (event: TeacherChunkEvent) => {
  const pending = pendingTeacherRequest;

  if (
    !pending ||
    pending.requestId !== event.requestId ||
    pending.pageId !== event.pageId
  ) {
    return;
  }

  const page = findPage(event.pageId);

  if (!page) {
    return;
  }

  const streamedMessage = page.messages.find(
    (item) => item.id === pending.tempMessageId,
  );

  if (streamedMessage) {
    streamedMessage.text += event.chunk;
  } else {
    page.messages.push(
      message(
        'teacher',
        event.chunk,
        false,
        pending.tempMessageId,
        pending.requestId,
      ),
    );
  }
};

const handleTeacherDone = (event: TeacherDoneEvent) => {
  const pending = pendingTeacherRequest;

  if (
    !pending ||
    pending.requestId !== event.requestId ||
    pending.pageId !== event.pageId
  ) {
    return;
  }

  if (event.cancelled) {
    const page = findPage(event.pageId);

    if (page) {
      page.messages = page.messages.filter(
        (item) => item.id !== pending.tempMessageId,
      );
      page.pendingGuidanceRefresh = false;
    }

    state.typing = false;
    state.cancelling = false;
    state.teacherRequestActive = false;
    state.overlay = null;
    state.errorCode = null;
    pendingTeacherRequest = null;
    return;
  }

  if (!event.ok || !event.reply) {
    const failedPage = findPage(event.pageId);

    if (failedPage) {
      failedPage.pendingGuidanceRefresh = false;
    }

    state.typing = false;
    state.cancelling = false;
    state.teacherRequestActive = false;
    state.overlay = 'teacher-no-response';
    state.errorCode = event.errorCode ?? 'TEACHER_NO_RESPONSE';
    return;
  }

  const page = findPage(event.pageId);
  if (!page) {
    pendingTeacherRequest = null;
    state.typing = false;
    state.cancelling = false;
    state.teacherRequestActive = false;
    state.overlay = 'teacher-no-response';
    state.errorCode = 'PAGE_NOT_FOUND';
    return;
  }

  const streamedMessage = page.messages.find(
    (item) => item.id === pending.tempMessageId,
  );

  if (streamedMessage) {
    streamedMessage.text = event.reply;
    streamedMessage.suggestClose = event.suggestClose;
    streamedMessage.requestId = pending.requestId;
    streamedMessage.mode = event.mode;
    streamedMessage.sources = event.sources;
    streamedMessage.citationStatus = event.citationStatus;
  } else {
    page.messages.push({
      ...message(
        'teacher',
        event.reply,
        event.suggestClose,
        pending.tempMessageId,
        pending.requestId,
      ),
      ...(event.mode ? { mode: event.mode } : {}),
      ...(event.sources ? { sources: event.sources } : {}),
      ...(event.citationStatus ? { citationStatus: event.citationStatus } : {}),
    });
  }

  if (pending.kind === 'ask' && event.mode !== 'answer') {
    page.teacherTurn += 1;
  }
  const shouldRefreshGuidance =
    pending.kind === 'maintenance' && page.pendingGuidanceRefresh === true;
  page.pendingGuidanceRefresh = false;
  page.suggestClose = Boolean(event.suggestClose);
  state.typing = false;
  state.cancelling = false;
  state.teacherRequestActive = false;
  state.overlay = null;
  state.errorCode = null;
  pendingTeacherRequest = null;

  if (shouldRefreshGuidance && page.status === 'reading') {
    void refreshGuidance(page);
  }
};

const handleGuidanceUpdated = (event: GuidanceUpdatedEvent) => {
  const page = findPage(event.pageId);

  if (!page) {
    return;
  }

  page.guidance = event.guidance;
  page.guidanceError = '';
};

const reconcileGuidance = async (pageId: number) => {
  try {
    const savedPage = await tapAlongApi.getPage(pageId);
    const page = findPage(pageId);

    if (page?.guidance?.status === 'pending' && savedPage?.guidance) {
      page.guidance = savedPage.guidance;
    }
  } catch {
    // 引导对账失败时保留本地 pending；用户继续写不会受影响。
  }
};

const ensureGuidanceEvents = () => {
  if (guidanceEventsReady || !tapAlongApi.supportsGuidance()) {
    return;
  }

  tapAlongApi.onGuidanceUpdated(handleGuidanceUpdated);
  guidanceEventsReady = true;
};

const ensureTeacherEvents = () => {
  if (teacherEventsReady || !tapAlongApi.supportsTeacherStreaming()) {
    return;
  }

  tapAlongApi.onTeacherChunk(handleTeacherChunk);
  tapAlongApi.onTeacherDone(handleTeacherDone);
  teacherEventsReady = true;
};

const restoreLatestPage = async () => {
  if (restoreStarted) {
    return;
  }

  restoreStarted = true;

  try {
    const [page] = await tapAlongApi.listRecentPages(1);

    if (page) {
      state.pages = [page];
      state.currentIndex = 0;
      state.view = 'companion';
    }
  } catch {
    // A restoration failure should leave the user at a usable new page.
  } finally {
    state.booting = false;
  }
};

const currentPage = computed(() => state.pages[state.currentIndex] ?? null);

const canGoBack = computed(
  () =>
    state.archiveDetailOpen ||
    state.view === 'archive' ||
    (state.view === 'new' ? state.pages.length > 0 : state.currentIndex > 0),
);

const stackIsDeep = computed(() => state.pages.length >= 4);

const teacherQuestion = (
  page: PageRecord,
  replyLanguage: ReplyLanguage = resolveMockReplyLanguage(page.body),
) => {
  const keyword = extractContentKeyword(
    page.body,
    replyLanguage === 'en' ? 'en' : 'zh-CN',
  );
  const questionKeys = [
    'teacherFallback.firstQuestion',
    'teacherFallback.followUp',
    'teacherFallback.attentionAllocation',
    'teacherFallback.counterExample',
  ];

  return translateFixedMessage(
    replyLanguage,
    questionKeys[Math.min(page.teacherTurn, 3)],
    {
      keyword,
      optionA: replyLanguage === 'en' ? 'task-driven' : '任务牵引',
      optionB: replyLanguage === 'en' ? 'your own choice' : '你主动分配',
    },
  );
};

type MaintenanceKind = 'append' | 'edit';

const previousUserContents = (page: PageRecord) => [
  ...(page.body ? [page.body] : []),
  ...page.messages
    .filter((item) => item.role === 'user')
    .map((item) => item.text),
];

const respondAfterMaintenance = async (
  page: PageRecord,
  kind: MaintenanceKind,
  triggerText: string,
) => {
  const requestId = createId();
  const tempMessageId = `teacher-${requestId}`;
  pendingTeacherRequest = {
    kind: 'maintenance',
    pageId: page.id,
    requestId,
    tempMessageId,
    userText: triggerText,
    maintenanceKind: kind,
  };
  state.typing = true;
  state.cancelling = false;
  state.teacherRequestActive = false;
  state.overlay = null;
  state.errorCode = null;

  if (tapAlongApi.supportsTeacherMaintenance()) {
    await startTeacherRequest(pendingTeacherRequest);
    return;
  }

  await wait(760);
  const replyLanguage = resolveMockReplyLanguage(
    triggerText,
    previousUserContents(page),
  );

  if (page.teacherTurn >= 4) {
    page.suggestClose = true;
    page.messages.push(
      message(
        'teacher',
        translateFixedMessage(
          replyLanguage,
          'teacherFallback.suggestCloseAfterMaintain',
        ),
        true,
        tempMessageId,
      ),
    );
  } else {
    const reply =
      kind === 'append'
        ? translateFixedMessage(replyLanguage, 'teacherFallback.afterAppend', {
            question: translateFixedMessage(
              replyLanguage,
              'teacherFallback.activeOrDriven',
            ),
          })
        : translateFixedMessage(replyLanguage, 'teacherFallback.afterEdit', {
            keyword: extractKeyword(page.body),
          });
    page.messages.push(message('teacher', reply, false, tempMessageId));
  }

  state.typing = false;
  state.cancelling = false;
  state.teacherRequestActive = false;
  pendingTeacherRequest = null;
};

const completeSave = (page: PageRecord) => {
  if (page.messages.length === 0) {
    page.messages.push(message('teacher', teacherQuestion(page)));
  }
  page.teacherTurn = Math.max(page.teacherTurn, 1);
  if (tapAlongApi.supportsGuidance()) {
    page.guidance = createPendingGuidance();
    page.guidanceError = '';
    void reconcileGuidance(page.id);
  }
  state.pages.push(page);
  state.currentIndex = state.pages.length - 1;
  state.draft.body = '';
  state.draft.source = '';
  state.draftError = '';
  clearDraftSnapshot(localStorage);
  state.overlay = null;
  state.errorCode = null;
  state.view = 'companion';
  state.sayMoreOpen = false;
  state.composerMode = 'normal';
  state.replyDraft = '';
};

const submitNewPage = async () => {
  const body = state.draft.body.trim();
  const source = state.draft.source.trim();
  const parentPage = currentPage.value;

  if (!body) {
    state.draftError = 'newPage.emptyError';
    return;
  }

  state.draftError = '';
  state.overlay = 'saving';
  state.errorCode = null;

  try {
    const response = await tapAlongApi.savePage({
      body,
      source,
      parentPageId: parentPage?.id,
    });
    if (!response.ok || !response.page) {
      state.overlay = 'failed';
      state.errorCode = response.errorCode ?? 'SAVE_FAILED';
      return;
    }

    // 父页在主进程里落了分叉锚点记录，这里同步内存，返回父页时时间线才完整。
    if (parentPage) {
      parentPage.messages.push(
        message('maintenance', i18n.global.t('messages.newPage')),
      );
    }

    completeSave(response.page);
  } catch {
    state.overlay = 'failed';
    state.errorCode = 'SAVE_FAILED';
  }
};

const markTeacherFailure = (
  errorCode: AppErrorCode = 'TEACHER_NO_RESPONSE',
) => {
  state.typing = false;
  state.cancelling = false;
  state.teacherRequestActive = false;
  state.overlay = 'teacher-no-response';
  state.errorCode = errorCode;
};

const startTeacherRequest = async (pending: PendingTeacherRequest) => {
  state.teacherRequestActive = true;
  state.cancelling = false;

  try {
    let response;

    if (pending.kind === 'resume' && pending.contextPageId) {
      response = await tapAlongApi.resumeTeacher({
        targetPageId: pending.pageId,
        contextPageId: pending.contextPageId,
        requestId: pending.requestId,
      });
    } else if (pending.kind === 'maintenance' && pending.maintenanceKind) {
      response = await tapAlongApi.maintainTeacher({
        pageId: pending.pageId,
        kind: pending.maintenanceKind,
        triggerText: pending.userText ?? '',
        requestId: pending.requestId,
      });
    } else {
      response = await tapAlongApi.askTeacher({
        pageId: pending.pageId,
        userText: pending.userText ?? '',
        requestId: pending.requestId,
      });
    }

    if (!response.ok) {
      markTeacherFailure(response.errorCode);
    }
  } catch {
    markTeacherFailure();
  }
};

const sendMockReply = async (
  page: PageRecord,
  userText: string,
  userMessageId: string,
) => {
  try {
    await wait(820);
    const replyLanguage = resolveMockReplyLanguage(
      userText,
      page.messages
        .filter((item) => item.role === 'user' && item.id !== userMessageId)
        .map((item) => item.text),
    );

    if (page.teacherTurn >= 4) {
      page.suggestClose = true;
      page.messages.push(
        message(
          'teacher',
          translateFixedMessage(
            replyLanguage,
            'teacherFallback.suggestCloseInTalk',
          ),
          true,
        ),
      );
    } else {
      page.messages.push(
        message('teacher', teacherQuestion(page, replyLanguage)),
      );
      page.teacherTurn += 1;
    }
  } catch {
    state.overlay = 'teacher-no-response';
    state.errorCode = 'TEACHER_NO_RESPONSE';
  } finally {
    state.typing = false;
    state.cancelling = false;
    state.teacherRequestActive = false;
  }
};

const sendReply = async () => {
  const page = currentPage.value;
  const text = state.replyDraft.trim();

  if (!page || state.typing || !text) {
    return;
  }

  if (page.guidance?.status === 'pending') {
    page.guidance = undefined;
  }
  page.guidanceError = '';

  const requestId = createId();
  const userMessageId = `user-${requestId}`;
  page.messages.push(message('user', text, false, userMessageId));
  state.replyDraft = '';
  state.typing = true;
  state.cancelling = false;
  state.teacherRequestActive = false;
  state.overlay = null;
  state.errorCode = null;

  if (!tapAlongApi.supportsTeacherStreaming()) {
    await sendMockReply(page, text, userMessageId);
    return;
  }

  pendingTeacherRequest = {
    kind: 'ask',
    pageId: page.id,
    userText: text,
    requestId,
    tempMessageId: `teacher-${requestId}`,
  };
  await startTeacherRequest(pendingTeacherRequest);
};

const useGuidanceSuggestion = async (suggestionId: string) => {
  const page = currentPage.value;

  if (!page || !page.guidance || page.status !== 'reading' || state.typing) {
    return;
  }

  page.guidanceError = '';

  try {
    const result = await tapAlongApi.useGuidanceSuggestion({
      pageId: page.id,
      suggestionId,
    });

    if (!result.ok || !result.question || !result.guidance) {
      page.guidanceError = i18n.global.t('guidance.useFailed');
      return;
    }

    page.guidance = result.guidance;
    const requestId = `guidance-${suggestionId}`;

    if (!page.messages.some((item) => item.requestId === requestId)) {
      page.messages.push(
        message('teacher', result.question, false, requestId, requestId),
      );
    }
  } catch {
    page.guidanceError = i18n.global.t('guidance.useFailed');
  }
};

const refreshGuidance = async (page: PageRecord) => {
  if (!tapAlongApi.supportsGuidanceRefresh()) {
    return;
  }

  try {
    await tapAlongApi.runGuidance({ pageId: page.id, mode: 'refresh' });
  } catch {
    // 刷新失败保持静默；维护老师的问题仍然有效。
  }
};

const retryGuidance = async () => {
  const page = currentPage.value;

  if (
    !page ||
    page.status !== 'reading' ||
    state.typing ||
    page.messages.some((message) => message.role === 'user') ||
    !tapAlongApi.supportsGuidanceRefresh()
  ) {
    return;
  }

  const previous = page.guidance;
  page.guidance = createPendingGuidance();
  page.guidanceError = '';

  try {
    const result = await tapAlongApi.runGuidance({
      pageId: page.id,
      mode: 'retry',
    });

    if (!result.ok) {
      page.guidance = previous;
      page.guidanceError = i18n.global.t('guidance.retryFailed');
    }
  } catch {
    page.guidance = previous;
    page.guidanceError = i18n.global.t('guidance.retryFailed');
  }
};

const retryTeacher = async () => {
  const pending = pendingTeacherRequest;

  if (!pending) {
    state.overlay = null;
    state.errorCode = null;
    return;
  }

  const page = findPage(pending.pageId);
  const streamedMessage = page?.messages.find(
    (item) => item.id === pending.tempMessageId,
  );

  if (streamedMessage) {
    streamedMessage.text = '';
  }

  state.overlay = null;
  state.errorCode = null;
  state.typing = true;
  state.cancelling = false;
  state.teacherRequestActive = false;
  await startTeacherRequest(pending);
};

const cancelTeacher = async () => {
  const pending = pendingTeacherRequest;

  if (!pending || !state.teacherRequestActive || state.cancelling) {
    return;
  }

  state.cancelling = true;

  try {
    const result = await tapAlongApi.cancelTeacher({
      requestId: pending.requestId,
    });

    if (!result.ok) {
      state.cancelling = false;
      markTeacherFailure(result.errorCode);
    }
  } catch {
    state.cancelling = false;
  }
};

const canCancelTeacher = computed(
  () =>
    state.typing &&
    state.teacherRequestActive &&
    tapAlongApi.supportsTeacherCancellation(),
);

const clearGuidanceAfterBodyChange = (page: PageRecord) => {
  const hadTerminalGuidance =
    page.guidance !== undefined && page.guidance.status !== 'pending';

  page.guidance = undefined;
  page.guidanceError = '';

  if (hadTerminalGuidance) {
    page.messages = page.messages.filter(
      (item) => item.requestId !== 'opening',
    );
  }
};

const submitAppend = async () => {
  const page = currentPage.value;
  const text = state.replyDraft.trim();

  if (!page || !text) {
    return;
  }

  const requestId =
    pendingAppendRequest?.pageId === page.id &&
    pendingAppendRequest.content === text
      ? pendingAppendRequest.requestId
      : createId();
  pendingAppendRequest = {
    pageId: page.id,
    content: text,
    requestId,
  };
  state.overlay = null;
  state.errorCode = null;
  state.typing = true;
  state.cancelling = false;
  state.teacherRequestActive = false;

  try {
    const response = await tapAlongApi.appendPage(page.id, text, requestId);

    if (!response.ok) {
      state.typing = false;
      state.cancelling = false;
      state.teacherRequestActive = false;
      state.overlay = 'failed';
      state.errorCode = response.errorCode ?? 'MAINTENANCE_FAILED';
      return;
    }

    pendingAppendRequest = null;
    page.body = `${page.body}\n\n${text}`;
    page.editDraft = page.body;
    clearGuidanceAfterBodyChange(page);
    page.pendingGuidanceRefresh = true;
    const brief = text.length > 16 ? `${text.slice(0, 16)}…` : text;
    page.messages.push(
      message(
        'maintenance',
        i18n.global.t('messages.appended', { content: brief }),
      ),
    );
    state.replyDraft = '';
    state.composerMode = 'normal';
    await respondAfterMaintenance(page, 'append', text);
  } catch {
    page.pendingGuidanceRefresh = false;
    state.typing = false;
    state.cancelling = false;
    state.teacherRequestActive = false;
    state.overlay = 'failed';
    state.errorCode = 'MAINTENANCE_FAILED';
  }
};

const startEditing = () => {
  const page = currentPage.value;
  if (!page) {
    return;
  }

  page.editDraft = page.body;
  page.editing = true;
  state.sayMoreOpen = false;
};

const cancelEditing = () => {
  const page = currentPage.value;
  if (page) {
    page.editDraft = page.body;
    page.editing = false;
  }
};

const saveEditing = async () => {
  const page = currentPage.value;
  if (!page || editRequestInFlight) {
    return;
  }

  const body = page.editDraft.trim();

  if (!body) {
    state.overlay = 'failed';
    state.errorCode = 'INVALID_BODY';
    return;
  }

  const requestId =
    pendingEditRequest?.pageId === page.id && pendingEditRequest.body === body
      ? pendingEditRequest.requestId
      : createId();
  pendingEditRequest = {
    pageId: page.id,
    body,
    requestId,
  };
  state.overlay = null;
  state.errorCode = null;
  editRequestInFlight = true;

  try {
    const response = await tapAlongApi.editPage(page.id, body, requestId);

    if (!response.ok) {
      state.overlay = 'failed';
      state.errorCode = response.errorCode ?? 'MAINTENANCE_FAILED';
      return;
    }

    pendingEditRequest = null;
    page.body = body;
    page.title = extractKeyword(body);
    page.editing = false;
    clearGuidanceAfterBodyChange(page);
    page.pendingGuidanceRefresh = true;
    page.messages.push(
      message('maintenance', i18n.global.t('messages.edited')),
    );
    await respondAfterMaintenance(page, 'edit', body);
  } catch {
    page.pendingGuidanceRefresh = false;
    state.overlay = 'failed';
    state.errorCode = 'MAINTENANCE_FAILED';
  } finally {
    editRequestInFlight = false;
  }
};

const startAppending = () => {
  state.composerMode = 'append';
  state.replyDraft = '';
  state.sayMoreOpen = false;
};

const startNewPage = () => {
  state.draft.body = '';
  state.draft.source = '';
  state.draftError = '';
  clearDraftSnapshot(localStorage);
  state.replyDraft = '';
  state.sayMoreOpen = false;
  state.composerMode = 'normal';
  state.view = 'new';
};

const clearConversationData = async (): Promise<PageClearAllResult> => {
  if (pendingTeacherRequest && state.teacherRequestActive) {
    try {
      await tapAlongApi.cancelTeacher({
        requestId: pendingTeacherRequest.requestId,
      });
    } catch {
      // Clearing persisted data should still proceed if cancellation fails.
    }
  }

  try {
    const result = await tapAlongApi.clearAllPages();

    if (!result.ok) {
      return result;
    }

    pendingTeacherRequest = null;
    pendingAppendRequest = null;
    pendingEditRequest = null;
    pendingCloseRequest = null;
    editRequestInFlight = false;
    closeRequestInFlight = false;
    closingPageId = null;
    state.pages = [];
    state.currentIndex = -1;
    state.view = 'new';
    state.archivePages = [];
    state.archiveLoading = false;
    state.archiveError = null;
    state.archiveDetailOpen = false;
    archiveReturn = null;
    state.overlay = null;
    state.errorCode = null;
    state.draft.body = '';
    state.draft.source = '';
    state.draftError = '';
    clearDraftSnapshot(localStorage);
    state.replyDraft = '';
    state.typing = false;
    state.cancelling = false;
    state.teacherRequestActive = false;
    state.sayMoreOpen = false;
    state.composerMode = 'normal';

    return result;
  } catch {
    return { ok: false, errorCode: 'SAVE_FAILED' };
  }
};

const resumeFromContext = async (
  targetPage: PageRecord,
  contextPage: PageRecord,
) => {
  const requestId = createId();
  const tempMessageId = `teacher-${requestId}`;
  pendingTeacherRequest = {
    kind: 'resume',
    pageId: targetPage.id,
    contextPageId: contextPage.id,
    requestId,
    tempMessageId,
  };
  state.typing = true;
  state.cancelling = false;
  state.teacherRequestActive = false;
  state.overlay = null;
  state.errorCode = null;

  if (tapAlongApi.supportsTeacherResume()) {
    await startTeacherRequest(pendingTeacherRequest);
    return;
  }

  await wait(650);
  const contextUserTexts = contextPage.messages
    .filter((messageItem) => messageItem.role === 'user')
    .map((messageItem) => messageItem.text);
  const targetUserTexts = targetPage.messages
    .filter((messageItem) => messageItem.role === 'user')
    .map((messageItem) => messageItem.text);
  const latestUserText = contextUserTexts.at(-1) ?? contextPage.body;
  const replyLanguage = resolveMockReplyLanguage(latestUserText, [
    targetPage.body,
    ...targetUserTexts,
    ...contextUserTexts.slice(0, -1),
  ]);

  targetPage.messages.push(
    message(
      'teacher',
      translateFixedMessage(
        replyLanguage,
        'teacherFallback.resumeWithContext',
        {
          contextTitle: contextPage.title,
          contextKeyword: extractContentKeyword(
            contextPage.body,
            resolveMockReplyLanguage(contextPage.body),
          ),
          targetKeyword: extractContentKeyword(
            targetPage.body,
            resolveMockReplyLanguage(targetPage.body),
          ),
        },
      ),
      false,
      tempMessageId,
    ),
  );
  state.typing = false;
  state.cancelling = false;
  state.teacherRequestActive = false;
  pendingTeacherRequest = null;
};

const closeCurrentPage = async () => {
  const page = currentPage.value;
  if (!page || closeRequestInFlight) {
    return;
  }

  const closingIndex = state.pages.findIndex((item) => item.id === page.id);
  const previousReadingPage =
    closingIndex > 0
      ? (state.pages
          .slice(0, closingIndex)
          .reverse()
          .find((item) => item.status === 'reading') ?? null)
      : null;
  const requestId =
    pendingCloseRequest?.pageId === page.id
      ? pendingCloseRequest.requestId
      : createId();
  pendingCloseRequest = { pageId: page.id, requestId };
  closeRequestInFlight = true;
  closingPageId = page.id;
  state.overlay = null;
  state.errorCode = null;
  state.sayMoreOpen = false;

  try {
    const response = await tapAlongApi.closePage(page.id, requestId);

    if (!response.ok) {
      state.overlay = 'failed';
      state.errorCode = response.errorCode ?? 'MAINTENANCE_FAILED';
      closingPageId = null;
      return;
    }

    pendingCloseRequest = null;
    page.status = 'closed';
  } catch {
    state.overlay = 'failed';
    state.errorCode = 'MAINTENANCE_FAILED';
    closingPageId = null;
    return;
  } finally {
    closeRequestInFlight = false;
  }

  const latestUserText =
    [...page.messages].reverse().find((item) => item.role === 'user')?.text ??
    page.body;
  const replyLanguage = resolveMockReplyLanguage(
    latestUserText,
    previousUserContents(page),
  );
  page.messages.push(
    message(
      'teacher',
      translateFixedMessage(replyLanguage, 'teacherFallback.userClosed'),
    ),
  );
  page.editing = false;
  state.sayMoreOpen = false;
  state.composerMode = 'normal';
  state.replyDraft = '';
  state.typing = false;

  if (pendingTeacherRequest?.pageId === page.id) {
    pendingTeacherRequest = null;
  }

  await wait(1000);

  const closedPageIndex = state.pages.findIndex((item) => item.id === page.id);
  if (closedPageIndex >= 0) {
    state.pages.splice(closedPageIndex, 1);
  }
  closingPageId = null;

  if (state.pages.length === 0) {
    state.currentIndex = -1;
    state.view = 'new';
    return;
  }

  if (
    previousReadingPage &&
    state.pages.some((item) => item.id === previousReadingPage.id)
  ) {
    state.currentIndex = state.pages.findIndex(
      (item) => item.id === previousReadingPage.id,
    );
    state.view = 'companion';
    void resumeFromContext(previousReadingPage, page);
    return;
  }

  state.currentIndex = -1;
  state.view = 'new';
  state.draft.body = '';
  state.draft.source = '';
};

const loadArchive = async () => {
  state.archiveLoading = true;
  state.archiveError = null;

  try {
    const result = await tapAlongApi.listClosedPages(50);

    if (!result.ok) {
      state.archiveError = result.errorCode ?? 'LIST_FAILED';
      return;
    }

    state.archivePages = result.pages ?? [];
  } catch {
    state.archiveError = 'LIST_FAILED';
  } finally {
    state.archiveLoading = false;
  }
};

const openArchive = async () => {
  if (
    state.view === 'archive' ||
    state.archiveDetailOpen ||
    state.typing ||
    closingPageId !== null
  ) {
    return;
  }

  state.overlay = null;
  state.errorCode = null;
  archiveOriginView = state.view === 'companion' ? 'companion' : 'new';
  archiveOriginIndex = state.currentIndex;
  state.view = 'archive';
  state.archivePages = [];
  state.archiveError = null;
  await loadArchive();
};

const openArchivedPage = (pageId: number) => {
  const page = state.archivePages.find((item) => item.id === pageId);

  if (!page) {
    return;
  }

  state.overlay = null;
  state.errorCode = null;
  archiveReturn = {
    pages: state.pages,
    currentIndex: state.currentIndex,
  };
  state.pages = [page];
  state.currentIndex = 0;
  state.archiveDetailOpen = true;
  state.view = 'companion';
  state.replyDraft = '';
  state.sayMoreOpen = false;
  state.composerMode = 'normal';
};

const closeArchivedDetail = () => {
  if (archiveReturn) {
    state.pages = archiveReturn.pages;
    state.currentIndex = archiveReturn.currentIndex;
  }

  archiveReturn = null;
  state.archiveDetailOpen = false;
  state.view = 'archive';
  state.replyDraft = '';
  state.sayMoreOpen = false;
  state.composerMode = 'normal';
};

const closeArchive = () => {
  state.view = archiveOriginView;
  state.currentIndex = archiveOriginIndex;
  state.archivePages = [];
  state.archiveError = null;
  state.archiveLoading = false;
  state.archiveDetailOpen = false;
  archiveReturn = null;
};

const retryArchive = () => {
  void loadArchive();
};

const goBack = () => {
  if (closingPageId !== null) {
    return;
  }

  if (state.archiveDetailOpen) {
    closeArchivedDetail();
    return;
  }

  if (state.view === 'archive') {
    closeArchive();
    return;
  }

  if (state.view === 'new' && state.pages.length > 0) {
    state.currentIndex = state.pages.length - 1;
    state.view = 'companion';
    return;
  }

  if (state.view === 'companion' && state.currentIndex > 0) {
    state.currentIndex -= 1;
    state.replyDraft = '';
    state.sayMoreOpen = false;
    state.composerMode = 'normal';
  }
};

const toggleHistory = () => {
  if (currentPage.value) {
    currentPage.value.historyOpen = !currentPage.value.historyOpen;
  }
};

const retrySave = () => {
  state.overlay = 'saving';
  window.setTimeout(() => {
    void submitNewPage();
  }, 0);
};

const dismissOverlay = () => {
  state.overlay = null;
  state.errorCode = null;
};

export const useSessionStore = () => {
  ensureTeacherEvents();
  ensureGuidanceEvents();
  void restoreLatestPage();

  return {
    state,
    currentPage,
    canGoBack,
    stackIsDeep,
    submitNewPage,
    sendReply,
    useGuidanceSuggestion,
    retryGuidance,
    submitAppend,
    startEditing,
    cancelEditing,
    saveEditing,
    startAppending,
    startNewPage,
    closeCurrentPage,
    openArchive,
    openArchivedPage,
    closeArchive,
    retryArchive,
    goBack,
    toggleHistory,
    retrySave,
    retryTeacher,
    cancelTeacher,
    canCancelTeacher,
    clearConversationData,
    dismissOverlay,
  };
};
