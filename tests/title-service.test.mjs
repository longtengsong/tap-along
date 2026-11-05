import assert from 'node:assert/strict';
import test from 'node:test';
import { TitleService } from '../src/main/services/title-service.ts';

const page = (overrides = {}) => ({
  id: 1,
  title: '注意力像带宽',
  body: '注意力是一种有限资源，分配决定能处理多少事。',
  source: '课程',
  status: 'reading',
  parseStatus: 'pending',
  teachingRoundCount: 0,
  messages: [],
  ...overrides,
});

const createRepository = (initial = page()) => {
  const calls = { update: [] };
  let current = initial;
  const repository = {
    findById(id) {
      return current && id === current.id ? current : null;
    },
    updateTitle(pageId, title) {
      calls.update.push({ pageId, title });
      current = { ...current, title };
      return current;
    },
  };

  return {
    repository,
    calls,
    setPage(next) {
      current = next;
    },
    getPage() {
      return current;
    },
  };
};

const generator = (generate) => ({ generate });

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test('应生成标题、持久化并发出更新事件', async () => {
  const { repository, calls } = createRepository();
  const emitted = [];
  const service = new TitleService(
    repository,
    generator(async () => '注意力像带宽'),
  );

  await service.run(1, (event) => emitted.push(event));

  assert.deepEqual(calls.update, [{ pageId: 1, title: '注意力像带宽' }]);
  assert.deepEqual(emitted, [{ pageId: 1, title: '注意力像带宽' }]);
});

test('正文太短时应保留截断标题，不调用模型', async () => {
  const { repository, calls } = createRepository(page({ body: '嗯。' }));
  let generated = 0;
  const service = new TitleService(
    repository,
    generator(async () => {
      generated += 1;
      return '短标题';
    }),
  );

  await service.run(1, () => {});

  assert.equal(generated, 0);
  assert.deepEqual(calls.update, []);
});

test('生成失败应静默降级并保留截断标题', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { repository, calls } = createRepository();
  const service = new TitleService(
    repository,
    generator(async () => {
      throw new Error('provider down');
    }),
  );

  await service.run(1, () => {});

  assert.deepEqual(calls.update, []);
});

test('模型返回空标题时不应写入', async () => {
  const { repository, calls } = createRepository();
  const service = new TitleService(
    repository,
    generator(async () => '   '),
  );

  await service.run(1, () => {});
  assert.deepEqual(calls.update, []);
});

test('生成期间正文被修改时应丢弃旧标题并重算', async () => {
  const initial = page();
  const { repository, calls, setPage } = createRepository(initial);
  let attempts = 0;
  const service = new TitleService(
    repository,
    generator(async () => {
      attempts += 1;

      if (attempts === 1) {
        setPage({ ...initial, body: '改过之后的正文。' });
        return '旧标题';
      }

      return '新标题';
    }),
  );

  await service.run(1, () => {});

  assert.equal(attempts, 2);
  assert.deepEqual(calls.update, [{ pageId: 1, title: '新标题' }]);
});

test('已合上或不存在的页边不应生成标题', async () => {
  let generated = 0;
  const service = new TitleService(
    createRepository(page({ status: 'closed' })).repository,
    generator(async () => {
      generated += 1;
      return '标题';
    }),
  );
  await service.run(1, () => {});

  const missing = new TitleService(
    {
      findById: () => null,
      updateTitle: () => null,
    },
    generator(async () => {
      generated += 1;
      return '标题';
    }),
  );
  await missing.run(2, () => {});

  assert.equal(generated, 0);
});

test('更新时页面已消失应放弃写入和广播', async () => {
  const { repository } = createRepository();
  const broken = {
    findById: () => page(),
    updateTitle: () => null,
  };
  const emitted = [];
  const service = new TitleService(
    broken,
    generator(async () => '标题'),
  );

  await service.run(1, (event) => emitted.push(event));

  assert.deepEqual(emitted, []);
  assert.equal(repository.findById(1).title, '注意力像带宽');
});

test('并发触发应复用进行中的任务并补跑一次', async () => {
  const { repository, calls } = createRepository();
  let attempts = 0;
  let release;
  const firstRun = new Promise((resolve) => {
    release = resolve;
  });
  const service = new TitleService(
    repository,
    generator(async () => {
      attempts += 1;
      return attempts === 1 ? firstRun : Promise.resolve('第二次标题');
    }),
  );

  const running = service.run(1, () => {});
  const queued = service.run(1, () => {});

  assert.equal(running, queued);
  release('第一次标题');
  await running;
  await flush();

  assert.equal(attempts, 2);
  assert.equal(calls.update.at(-1).title, '第二次标题');
});

test('无效页边编号应直接返回', async () => {
  let generated = 0;
  const service = new TitleService(
    createRepository().repository,
    generator(async () => {
      generated += 1;
      return '标题';
    }),
  );

  await service.run(0, () => {});
  await service.run(-1, () => {});

  assert.equal(generated, 0);
});
