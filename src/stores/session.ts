import { computed, reactive } from 'vue';
import { extractKeyword, tapAlongApi } from '@/api/tap-along';
import { i18n } from '@/i18n';
import { translateFixedMessage } from '@/i18n/fixed-messages';
import {
  resolveMockReplyLanguage,
  type ReplyLanguage,
} from '@/shared/conversation-language';
import type {
  TeacherAskPayload,
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

type ViewState = 'new' | 'companion';

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
): TalkMessage => ({
  id,
  role,
  text,
  suggestClose,
});

interface PendingTeacherRequest extends TeacherAskPayload {
  tempMessageId: string;
}

let pendingTeacherRequest: PendingTeacherRequest | null = null;
let teacherEventsReady = false;
let restoreStarted = false;

const state = reactive({
  booting: true,
  view: 'new' as ViewState,
  pages: [] as PageRecord[],
  currentIndex: -1,
  overlay: null as OverlayState,
  draft: {
    body: '',
    source: '',
  } as PageDraft,
  draftError: '',
  replyDraft: '',
  typing: false,
  sayMoreOpen: false,
  composerMode: 'normal' as ComposerMode,
});

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
      message('teacher', event.chunk, false, pending.tempMessageId),
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

  if (!event.ok || !event.reply) {
    state.typing = false;
    state.overlay = 'teacher-no-response';
    return;
  }

  const page = findPage(event.pageId);
  if (!page) {
    pendingTeacherRequest = null;
    state.typing = false;
    return;
  }

  const streamedMessage = page.messages.find(
    (item) => item.id === pending.tempMessageId,
  );

  if (streamedMessage) {
    streamedMessage.text = event.reply;
    streamedMessage.suggestClose = event.suggestClose;
  } else {
    page.messages.push(
      message(
        'teacher',
        event.reply,
        event.suggestClose,
        pending.tempMessageId,
      ),
    );
  }

  page.teacherTurn += 1;
  page.suggestClose = Boolean(event.suggestClose);
  state.typing = false;
  state.overlay = null;
  pendingTeacherRequest = null;
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

const canGoBack = computed(() =>
  state.view === 'new' ? state.pages.length > 0 : state.currentIndex > 0,
);

const stackIsDeep = computed(() => state.pages.length >= 4);

const teacherQuestion = (
  page: PageRecord,
  replyLanguage: ReplyLanguage = resolveMockReplyLanguage(page.body),
) => {
  const keyword = extractKeyword(page.body);
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
  state.typing = true;
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
    page.messages.push(message('teacher', reply));
  }

  state.typing = false;
};

const completeSave = (page: PageRecord) => {
  page.messages.push(message('teacher', teacherQuestion(page)));
  page.teacherTurn = 1;
  state.pages.push(page);
  state.currentIndex = state.pages.length - 1;
  state.draft.body = '';
  state.draft.source = '';
  state.draftError = '';
  state.overlay = null;
  state.view = 'companion';
  state.sayMoreOpen = false;
  state.composerMode = 'normal';
  state.replyDraft = '';
};

const submitNewPage = async () => {
  const body = state.draft.body.trim();
  const source = state.draft.source.trim();

  if (!body) {
    state.draftError = 'newPage.emptyError';
    return;
  }

  state.draftError = '';
  state.overlay = 'saving';

  try {
    const response = await tapAlongApi.savePage({ body, source });
    if (!response.ok || !response.page) {
      state.overlay = 'failed';
      return;
    }

    completeSave(response.page);
  } catch {
    state.overlay = 'failed';
  }
};

const markTeacherFailure = () => {
  state.typing = false;
  state.overlay = 'teacher-no-response';
};

const startTeacherRequest = async (pending: PendingTeacherRequest) => {
  try {
    const response = await tapAlongApi.askTeacher({
      pageId: pending.pageId,
      userText: pending.userText,
      requestId: pending.requestId,
    });

    if (!response.ok) {
      markTeacherFailure();
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
  } finally {
    state.typing = false;
  }
};

const sendReply = async () => {
  const page = currentPage.value;
  const text = state.replyDraft.trim();

  if (!page || state.typing || !text) {
    return;
  }

  const requestId = createId();
  const userMessageId = `user-${requestId}`;
  page.messages.push(message('user', text, false, userMessageId));
  state.replyDraft = '';
  state.typing = true;
  state.overlay = null;

  if (!tapAlongApi.supportsTeacherStreaming()) {
    await sendMockReply(page, text, userMessageId);
    return;
  }

  pendingTeacherRequest = {
    pageId: page.id,
    userText: text,
    requestId,
    tempMessageId: `teacher-${requestId}`,
  };
  await startTeacherRequest(pendingTeacherRequest);
};

const retryTeacher = async () => {
  const pending = pendingTeacherRequest;

  if (!pending) {
    state.overlay = null;
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
  state.typing = true;
  await startTeacherRequest(pending);
};

const submitAppend = async () => {
  const page = currentPage.value;
  const text = state.replyDraft.trim();

  if (!page || !text) {
    return;
  }

  page.body = `${page.body}\n\n${text}`;
  page.editDraft = page.body;
  const brief = text.length > 16 ? `${text.slice(0, 16)}…` : text;
  page.messages.push(
    message(
      'maintenance',
      i18n.global.t('messages.appended', { content: brief }),
    ),
  );
  state.replyDraft = '';
  state.composerMode = 'normal';

  await tapAlongApi.appendPage(page.id, text);
  await respondAfterMaintenance(page, 'append', text);
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
  if (!page) {
    return;
  }

  const body = page.editDraft.trim() || page.body;
  page.body = body;
  page.title = extractKeyword(body);
  page.editing = false;
  page.messages.push(message('maintenance', i18n.global.t('messages.edited')));

  await tapAlongApi.editPage(page.id, body);
  await respondAfterMaintenance(page, 'edit', body);
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
  state.replyDraft = '';
  state.sayMoreOpen = false;
  state.composerMode = 'normal';
  state.view = 'new';
};

const closeCurrentPage = async () => {
  const page = currentPage.value;
  if (!page) {
    return;
  }

  page.status = 'closed';
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

  await tapAlongApi.closePage(page.id);
  await wait(1000);

  state.pages.splice(state.currentIndex, 1);

  if (state.pages.length === 0) {
    state.currentIndex = -1;
    state.view = 'new';
    state.draft.body = '';
    state.draft.source = '';
    return;
  }

  state.currentIndex = Math.min(
    Math.max(state.currentIndex - 1, 0),
    state.pages.length - 1,
  );
  state.view = 'companion';
};

const goBack = () => {
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
};

export const useSessionStore = () => {
  ensureTeacherEvents();
  void restoreLatestPage();

  return {
    state,
    currentPage,
    canGoBack,
    stackIsDeep,
    submitNewPage,
    sendReply,
    submitAppend,
    startEditing,
    cancelEditing,
    saveEditing,
    startAppending,
    startNewPage,
    closeCurrentPage,
    goBack,
    toggleHistory,
    retrySave,
    retryTeacher,
    dismissOverlay,
  };
};
