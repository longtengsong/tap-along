import assert from 'node:assert/strict';
import test from 'node:test';
import {
  WindowStateService,
  parseWindowState,
  resolveInitialWindowState,
  WINDOW_DEFAULT_SIZE,
  WINDOW_MIN_SIZE,
} from '../src/main/services/window-state.ts';

const primaryDisplay = {
  workArea: { x: 0, y: 0, width: 1440, height: 900 },
};

const secondaryDisplay = {
  workArea: { x: 1440, y: 0, width: 1920, height: 1080 },
};

const createStore = (initial = undefined, { readError, writeError } = {}) => {
  let value = initial;
  const writes = [];

  return {
    reads: 0,
    writes,
    read() {
      this.reads += 1;
      if (readError) throw new Error('read failed');
      return value;
    },
    write(next) {
      if (writeError) throw new Error('write failed');
      value = next;
      writes.push(next);
    },
    get value() {
      return value;
    },
  };
};

const createWindow = ({
  bounds = { x: 100, y: 100, width: 1000, height: 700 },
  maximized = false,
  destroyed = false,
  getBounds,
} = {}) => ({
  isDestroyed: () => destroyed,
  isMaximized: () => maximized,
  getNormalBounds: getBounds ?? (() => bounds),
});

test('首次启动时按主屏工作区居中显示默认尺寸', () => {
  const service = new WindowStateService(createStore());
  const state = service.getInitialState([primaryDisplay]);

  assert.deepEqual(state, {
    bounds: { x: 130, y: 60, width: 1180, height: 780 },
    maximized: false,
  });
});

test('首次启动且拿不到屏幕信息时使用默认尺寸', () => {
  const state = resolveInitialWindowState(undefined, []);

  assert.deepEqual(state, {
    bounds: { x: 0, y: 0, ...WINDOW_DEFAULT_SIZE },
    maximized: false,
  });
});

test('恢复上次保存的窗口位置、尺寸与最大化状态', () => {
  const saved = {
    bounds: { x: 220, y: 140, width: 1024, height: 680 },
    maximized: true,
  };
  const state = resolveInitialWindowState(saved, [primaryDisplay]);

  assert.deepEqual(state, saved);
});

test('恢复位于副屏上的窗口', () => {
  const saved = {
    bounds: { x: 1600, y: 200, width: 1100, height: 720 },
    maximized: false,
  };
  const state = resolveInitialWindowState(saved, [
    primaryDisplay,
    secondaryDisplay,
  ]);

  assert.deepEqual(state, saved);
});

test('窗口跑到屏幕外时回到主屏居中，且保留最大化状态', () => {
  const saved = {
    bounds: { x: 5000, y: 4000, width: 1024, height: 680 },
    maximized: true,
  };
  const state = resolveInitialWindowState(saved, [
    primaryDisplay,
    secondaryDisplay,
  ]);

  assert.deepEqual(state, {
    bounds: { x: 130, y: 60, width: 1180, height: 780 },
    maximized: true,
  });
});

test('屏幕边缘只露出很窄一条时视为不可见', () => {
  const saved = {
    bounds: { x: 1340, y: 100, width: 1000, height: 700 },
    maximized: false,
  };
  const state = resolveInitialWindowState(saved, [primaryDisplay]);

  assert.deepEqual(state.bounds, { x: 130, y: 60, width: 1180, height: 780 });

  const justVisible = resolveInitialWindowState(
    { bounds: { x: 1320, y: 100, width: 1000, height: 700 }, maximized: false },
    [primaryDisplay],
  );

  assert.deepEqual(justVisible.bounds, {
    x: 1320,
    y: 100,
    width: 1000,
    height: 700,
  });
});

test('屏幕小于默认尺寸时收窄窗口并居中', () => {
  const small = { workArea: { x: 0, y: 0, width: 800, height: 600 } };
  const state = resolveInitialWindowState(undefined, [small]);

  assert.deepEqual(state.bounds, { x: 0, y: 0, width: 800, height: 600 });
});

test('屏幕小于最小尺寸时仍保留最小可读尺寸', () => {
  const tiny = { workArea: { x: 0, y: 0, width: 640, height: 480 } };
  const state = resolveInitialWindowState(undefined, [tiny]);

  assert.deepEqual(state.bounds, {
    x: -40,
    y: -40,
    width: WINDOW_MIN_SIZE.width,
    height: WINDOW_MIN_SIZE.height,
  });
});

test('损坏或不合法的存储值按首次启动处理', () => {
  const invalidValues = [
    'window',
    42,
    null,
    [],
    {},
    { bounds: null },
    { bounds: { x: 0, y: 0, width: '1000', height: 700 } },
    { bounds: { x: 0, y: 0, width: 700, height: 700 } },
    { bounds: { x: 0, y: 0, width: 1000, height: 500 } },
    { bounds: { x: Number.NaN, y: 0, width: 1000, height: 700 } },
    { bounds: { x: 0, y: 0, width: Number.POSITIVE_INFINITY, height: 700 } },
  ];

  for (const value of invalidValues) {
    assert.equal(parseWindowState(value), null, JSON.stringify(value));
    assert.deepEqual(resolveInitialWindowState(value, [primaryDisplay]), {
      bounds: { x: 130, y: 60, width: 1180, height: 780 },
      maximized: false,
    });
  }
});

test('存储值取整并忽略非布尔的最大化标记', () => {
  assert.deepEqual(
    parseWindowState({
      bounds: { x: 10.4, y: -20.6, width: 1000.5, height: 700.4 },
      maximized: 'yes',
    }),
    {
      bounds: { x: 10, y: -21, width: 1001, height: 700 },
      maximized: false,
    },
  );
});

test('读取配置失败或缺屏时仍能给出可用窗口状态', () => {
  const service = new WindowStateService(
    createStore(undefined, { readError: true }),
  );

  assert.deepEqual(service.getInitialState([primaryDisplay]), {
    bounds: { x: 130, y: 60, width: 1180, height: 780 },
    maximized: false,
  });
  assert.deepEqual(service.getInitialState([]).bounds, {
    x: 0,
    y: 0,
    width: 1180,
    height: 780,
  });

  const saved = {
    bounds: { x: 100, y: 100, width: 1000, height: 700 },
    maximized: false,
  };
  assert.deepEqual(resolveInitialWindowState(saved, []), saved);
});

test('移动或缩放后保存当前窗口状态', () => {
  const store = createStore();
  const service = new WindowStateService(store);
  const window = createWindow();

  const saved = service.capture(window);

  assert.deepEqual(saved, {
    bounds: { x: 100, y: 100, width: 1000, height: 700 },
    maximized: false,
  });
  assert.deepEqual(store.value, saved);
  assert.equal(store.writes.length, 1);
});

test('最大化时保存还原后的位置并标记最大化', () => {
  const store = createStore();
  const service = new WindowStateService(store);
  const window = createWindow({
    bounds: { x: 100, y: 100, width: 1000, height: 700 },
    maximized: true,
  });

  assert.deepEqual(service.capture(window), {
    bounds: { x: 100, y: 100, width: 1000, height: 700 },
    maximized: true,
  });
  assert.equal(store.value.maximized, true);
});

test('窗口已销毁、状态非法或写盘失败时跳过保存', () => {
  const destroyedStore = createStore();
  assert.equal(
    new WindowStateService(destroyedStore).capture(
      createWindow({ destroyed: true }),
    ),
    null,
  );
  assert.equal(destroyedStore.writes.length, 0);

  const invalidStore = createStore();
  assert.equal(
    new WindowStateService(invalidStore).capture(
      createWindow({
        getBounds: () => ({ x: 0, y: 0, width: 10, height: 10 }),
      }),
    ),
    null,
  );
  assert.equal(invalidStore.writes.length, 0);

  const failingStore = createStore(undefined, { writeError: true });
  assert.equal(
    new WindowStateService(failingStore).capture(createWindow()),
    null,
  );
});
