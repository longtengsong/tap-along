export interface WindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StoredWindowState {
  bounds: WindowRect;
  maximized: boolean;
}

export interface WindowStateStore {
  read(): unknown;
  write(state: StoredWindowState): void;
}

/** 与 Electron `Display` 结构兼容，只依赖排布窗口所需的工作区。 */
export interface DisplayLike {
  workArea: WindowRect;
}

/** 与 Electron `BrowserWindow` 结构兼容，便于脱离 Electron 测试。 */
export interface WindowLike {
  isDestroyed(): boolean;
  isMaximized(): boolean;
  getNormalBounds(): WindowRect;
}

export const WINDOW_DEFAULT_SIZE = { width: 1180, height: 780 } as const;
export const WINDOW_MIN_SIZE = { width: 720, height: 560 } as const;

/** 判定窗口“还在屏幕上”的最小可见区域，避免只露出一个像素。 */
const MIN_VISIBLE_WIDTH = 120;
const MIN_VISIBLE_HEIGHT = 48;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const parseBounds = (raw: unknown): WindowRect | null => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const candidate = raw as Partial<WindowRect>;

  if (
    !isFiniteNumber(candidate.x) ||
    !isFiniteNumber(candidate.y) ||
    !isFiniteNumber(candidate.width) ||
    !isFiniteNumber(candidate.height)
  ) {
    return null;
  }

  if (
    candidate.width < WINDOW_MIN_SIZE.width ||
    candidate.height < WINDOW_MIN_SIZE.height
  ) {
    return null;
  }

  return {
    x: Math.round(candidate.x),
    y: Math.round(candidate.y),
    width: Math.round(candidate.width),
    height: Math.round(candidate.height),
  };
};

/** 把存储里的原始值收敛成可用状态；任何异常形状都当作没存过。 */
export const parseWindowState = (raw: unknown): StoredWindowState | null => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const record = raw as { bounds?: unknown; maximized?: unknown };
  const bounds = parseBounds(record.bounds);

  if (!bounds) {
    return null;
  }

  return { bounds, maximized: record.maximized === true };
};

const clampSize = (preferred: number, minimum: number, available: number) =>
  Math.min(preferred, Math.max(minimum, Math.round(available)));

const centeredBounds = (display: DisplayLike): WindowRect => {
  const { workArea } = display;
  const width = clampSize(
    WINDOW_DEFAULT_SIZE.width,
    WINDOW_MIN_SIZE.width,
    workArea.width,
  );
  const height = clampSize(
    WINDOW_DEFAULT_SIZE.height,
    WINDOW_MIN_SIZE.height,
    workArea.height,
  );

  return {
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + Math.round((workArea.height - height) / 2),
    width,
    height,
  };
};

const defaultBounds = (displays: readonly DisplayLike[]): WindowRect => {
  const [primary] = displays;

  return primary
    ? centeredBounds(primary)
    : { x: 0, y: 0, ...WINDOW_DEFAULT_SIZE };
};

const isVisibleOnDisplay = (bounds: WindowRect, display: DisplayLike) => {
  const { workArea } = display;
  const overlapWidth =
    Math.min(bounds.x + bounds.width, workArea.x + workArea.width) -
    Math.max(bounds.x, workArea.x);
  const overlapHeight =
    Math.min(bounds.y + bounds.height, workArea.y + workArea.height) -
    Math.max(bounds.y, workArea.y);

  return (
    overlapWidth >= MIN_VISIBLE_WIDTH && overlapHeight >= MIN_VISIBLE_HEIGHT
  );
};

const isVisibleAnywhere = (
  bounds: WindowRect,
  displays: readonly DisplayLike[],
) => displays.some((display) => isVisibleOnDisplay(bounds, display));

/**
 * 决定启动时的窗口位置：
 * - 保存过且仍落在某块屏幕上 → 原样恢复；
 * - 屏幕已拔掉/分辨率变化导致窗口跑到屏幕外 → 回到主屏居中；
 * - 没有保存过 → 主屏居中。
 */
export const resolveInitialWindowState = (
  raw: unknown,
  displays: readonly DisplayLike[],
): StoredWindowState => {
  const saved = parseWindowState(raw);

  if (!saved) {
    return { bounds: defaultBounds(displays), maximized: false };
  }

  if (displays.length === 0) {
    return saved;
  }

  if (isVisibleAnywhere(saved.bounds, displays)) {
    return saved;
  }

  return { bounds: defaultBounds(displays), maximized: saved.maximized };
};

export class WindowStateService {
  private readonly store: WindowStateStore;

  constructor(store: WindowStateStore) {
    this.store = store;
  }

  /** 读取保存的窗口状态；读取失败时按首次启动处理。 */
  getInitialState(displays: readonly DisplayLike[]): StoredWindowState {
    let stored: unknown = null;

    try {
      stored = this.store.read();
    } catch {
      stored = null;
    }

    return resolveInitialWindowState(stored, displays);
  }

  /**
   * 记录当前窗口状态。最大化时保存的是还原后的位置，
   * 这样用户取消最大化后还能回到原来的尺寸。
   */
  capture(window: WindowLike): StoredWindowState | null {
    try {
      if (window.isDestroyed()) {
        return null;
      }

      const state = parseWindowState({
        bounds: window.getNormalBounds(),
        maximized: window.isMaximized(),
      });

      if (!state) {
        return null;
      }

      this.store.write(state);
      return state;
    } catch {
      return null;
    }
  }
}
