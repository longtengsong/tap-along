import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createMockTeacherStream,
  TeacherService,
} from '../src/main/services/teacher.ts';
import { SearchError } from '../src/main/services/web-search.ts';

const page = () => ({
  id: 1,
  title: '注意力与带宽',
  body: '注意力是一种有限资源。',
  source: '课程',
  status: 'reading',
  parseStatus: 'pending',
  teachingRoundCount: 0,
  messages: [],
});

const evidence = [
  {
    source: {
      index: 1,
      title: 'Cognitive load',
      url: 'https://en.wikipedia.org/wiki/Cognitive_load',
      domain: 'en.wikipedia.org',
    },
    snippet: '认知负荷指工作记忆的负担。',
  },
];

const createRepository = () => {
  const state = { page: page(), calls: { research: [], reflect: [] } };
  const repository = {
    beginTeacherTurn(pageId, userText, requestId) {
      state.page = {
        ...state.page,
        messages: [
          ...state.page.messages,
          { role: 'user', text: userText, requestId },
        ],
      };
      return state.page;
    },
    findById(id) {
      return id === state.page.id ? state.page : null;
    },
    listClosedDescendantBodies() {
      return [];
    },
    appendTeacherPrompt(text, requestId) {
      state.page = {
        ...state.page,
        messages: [
          ...state.page.messages,
          { role: 'teacher', text, requestId },
        ],
      };
      return { ok: true, page: state.page };
    },
    completeTeacherTurn(pageId, reply, suggestClose, requestId) {
      state.calls.reflect.push({ pageId, reply, suggestClose, requestId });
      state.page = {
        ...state.page,
        teachingRoundCount: state.page.teachingRoundCount + 1,
        messages: [
          ...state.page.messages,
          { role: 'teacher', text: reply, suggestClose, requestId },
        ],
      };
      return state.page;
    },
    completeResearchAnswer(pageId, reply, sources, requestId) {
      state.calls.research.push({ pageId, reply, sources, requestId });
      state.page = {
        ...state.page,
        messages: [
          ...state.page.messages,
          {
            role: 'teacher',
            text: reply,
            requestId,
            mode: 'answer',
            sources,
          },
        ],
      };
      return state.page;
    },
  };

  return { repository, state };
};

const generator = (chunks, calls) =>
  async function* (input) {
    calls.push(input);
    for (const chunk of chunks) {
      yield chunk;
    }
  };

const research = (route, search) => ({
  route: async () => route,
  search: async (input) => search(input),
});

const start = async (service, requestId = 'ask-1') => {
  const events = [];
  const outcome = service.start(
    { pageId: 1, userText: '什么是认知负荷？', requestId },
    (event) => events.push(event),
  );
  assert.equal(outcome.result.ok, true);
  const done = await outcome.completion;
  return { events, done };
};

test('research 分支应检索、流式回答、清洗引用并持久化来源', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { repository, state } = createRepository();
  const calls = [];
  const service = new TeacherService(
    repository,
    generator(['认知负荷是负担 [1]，未知 [9]。'], calls),
    research(
      { mode: 'research', queries: ['认知负荷 定义'] },
      async () => evidence,
    ),
  );

  const { events, done } = await start(service);

  assert.equal(done.ok, true);
  assert.equal(done.mode, 'answer');
  assert.equal(done.sources.length, 1);
  assert.equal(done.citationStatus, 'cited');
  assert.equal(done.reply, '认知负荷是负担 [1]，未知 。');
  assert.equal(done.suggestClose, false);
  assert.equal(state.calls.research.length, 1);
  assert.equal(state.calls.reflect.length, 0);
  assert.equal(state.page.teachingRoundCount, 0);
  assert.equal(calls[0].research.length, 1);
  assert.equal(events.filter((event) => 'chunk' in event).length >= 1, true);
});

test('路由失败应回退到原有老师叩问', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { repository, state } = createRepository();
  const calls = [];
  const service = new TeacherService(
    repository,
    generator(['你为什么这么想？'], calls),
    {
      route: async () => {
        throw new Error('router down');
      },
      search: async () => evidence,
    },
  );

  const { done } = await start(service);

  assert.equal(done.ok, true);
  assert.equal(done.mode, undefined);
  assert.equal(calls[0].research, undefined);
  assert.equal(state.calls.reflect.length, 1);
  assert.equal(state.calls.research.length, 0);
});

test('搜索未配置应返回受控错误码且不生成回答', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { repository, state } = createRepository();
  const calls = [];
  const service = new TeacherService(
    repository,
    generator(['不应生成'], calls),
    research({ mode: 'research', queries: ['问题'] }, async () => {
      throw new SearchError('SEARCH_NOT_CONFIGURED');
    }),
  );

  const { done } = await start(service);

  assert.equal(done.ok, false);
  assert.equal(done.errorCode, 'SEARCH_NOT_CONFIGURED');
  assert.equal(calls.length, 0);
  assert.equal(state.calls.research.length, 0);
});

test('证据为空应返回 RESEARCH_NO_EVIDENCE', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { repository } = createRepository();
  const service = new TeacherService(
    repository,
    generator(['不应生成'], []),
    research({ mode: 'research', queries: ['问题'] }, async () => []),
  );

  const { done } = await start(service);
  assert.equal(done.ok, false);
  assert.equal(done.errorCode, 'RESEARCH_NO_EVIDENCE');
});

test('research 分支 provider 不可用时应返回受控错误而不是 mock 叩问', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { repository, state } = createRepository();
  const service = new TeacherService(
    repository,
    createMockTeacherStream,
    research({ mode: 'research', queries: ['问题'] }, async () => evidence),
  );

  const { done } = await start(service);

  assert.equal(done.ok, false);
  assert.equal(done.errorCode, 'PROVIDER_NOT_CONFIGURED');
  assert.equal(state.calls.research.length, 0);
});

test('取消搜索应发送 cancelled 且不保存部分回答', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { repository, state } = createRepository();
  let abortSearch;
  const service = new TeacherService(
    repository,
    generator(['不应生成'], []),
    research(
      { mode: 'research', queries: ['问题'] },
      ({ signal }) =>
        new Promise((_resolve, reject) => {
          abortSearch = () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          };
          signal.addEventListener('abort', abortSearch, { once: true });
        }),
    ),
  );

  const events = [];
  const outcome = service.start(
    { pageId: 1, userText: '什么是认知负荷？', requestId: 'ask-cancel' },
    (event) => events.push(event),
  );

  await new Promise((resolve) => setTimeout(resolve, 5));
  service.cancel({ requestId: 'ask-cancel' });
  const done = await outcome.completion;

  assert.equal(done.cancelled, true);
  assert.equal(state.calls.research.length, 0);
  assert.equal(state.page.messages.length, 1);
  assert.equal(
    events.some((event) => event.cancelled === true),
    true,
  );
});
