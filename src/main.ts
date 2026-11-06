import { app, BrowserWindow, dialog, ipcMain, screen, shell } from 'electron';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import type { DatabaseSync } from 'node:sqlite';
import Store from 'electron-store';
import started from 'electron-squirrel-startup';
import {
  allocateDatabasePath,
  closeDatabase,
  openDatabase,
} from './main/db/client';
import { PagesRepository } from './main/db/pages';
import { registerDeveloperPromptHandlers } from './main/ipc/developer-prompts';
import { registerPageHandlers } from './main/ipc/pages';
import { registerContextHandlers } from './main/ipc/context';
import { registerBackupHandlers } from './main/ipc/backup';
import { registerGuidanceHandlers } from './main/ipc/guidance';
import { registerSearchHandlers } from './main/ipc/search';
import { registerShellHandlers } from './main/ipc/shell';
import { registerProviderHandlers } from './main/ipc/providers';
import { registerSettingsHandlers } from './main/ipc/settings';
import { registerTeacherHandlers } from './main/ipc/teacher';
import { ElectronSecretCipher } from './main/config/electron-secret-cipher';
import {
  ProviderConfigService,
  type ProviderSettingsStore,
  type StoredProviderSettings,
} from './main/services/providers';
import {
  ProviderConnectionService,
  ProviderConnectionTester,
} from './main/services/provider-connection';
import { DeveloperModeService } from './main/services/developer-mode';
import { DeveloperPromptConfigService } from './main/services/developer-prompts';
import { TeacherRequestInspector } from './main/services/teacher-request-inspector';
import { buildStartupFailureContent } from './main/services/startup-error';
import { createModelAwareTeacherStream } from './main/services/model-teacher';
import { createGuidancePlanner } from './main/services/guidance-planner';
import { GuidanceService } from './main/services/guidance';
import {
  SearchConfigService,
  type StoredWebSearchSettings,
} from './main/services/search-config';
import { WebSearchService } from './main/services/web-search';
import { createIntentRouter } from './main/services/intent-router';
import { ResearchService } from './main/services/research';
import { createStructuredCompletion } from './main/services/structured-completion';
import { ModelTitleGenerator } from './main/services/title-generator';
import { TitleService } from './main/services/title-service';
import {
  createMockTeacherStream,
  TeacherService,
} from './main/services/teacher';
import {
  WindowStateService,
  WINDOW_DEFAULT_SIZE,
  WINDOW_MIN_SIZE,
  type StoredWindowState,
} from './main/services/window-state';
import type { DeveloperPromptProfile } from './shared/prompts';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

let database: DatabaseSync | null = null;
let developerModeService: DeveloperModeService | null = null;
let windowStateService: WindowStateService | null = null;

/** 连续拖动/缩放时合并写盘，避免每个像素都落一次配置。 */
const WINDOW_STATE_SAVE_DELAY = 250;

const isDeveloperModeEnabled = () => {
  const result = developerModeService?.get();
  return result?.ok === true && result.enabled === true;
};

const createWindow = (developerMode = false) => {
  const restored: StoredWindowState = windowStateService
    ? windowStateService.getInitialState(screen.getAllDisplays())
    : {
        bounds: { x: 0, y: 0, ...WINDOW_DEFAULT_SIZE },
        maximized: false,
      };

  // Create the browser window.
  const mainWindow = new BrowserWindow({
    ...restored.bounds,
    minWidth: WINDOW_MIN_SIZE.width,
    minHeight: WINDOW_MIN_SIZE.height,
    backgroundColor: '#e8e4dc',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (restored.maximized) {
    mainWindow.maximize();
  }

  const persistWindowState = () => {
    windowStateService?.capture(mainWindow);
  };

  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  const scheduleWindowStateSave = () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
    }

    saveTimer = setTimeout(() => {
      saveTimer = null;
      persistWindowState();
    }, WINDOW_STATE_SAVE_DELAY);
  };

  mainWindow.on('resize', scheduleWindowStateSave);
  mainWindow.on('move', scheduleWindowStateSave);
  mainWindow.on('maximize', scheduleWindowStateSave);
  mainWindow.on('unmaximize', scheduleWindowStateSave);
  mainWindow.on('close', () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }

    persistWindowState();
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const currentUrl = mainWindow.webContents.getURL();

    try {
      const next = new URL(url);

      if (url === currentUrl) {
        return;
      }

      if (
        (next.protocol === 'http:' || next.protocol === 'https:') &&
        next.origin === new URL(currentUrl).origin
      ) {
        return;
      }
    } catch {
      // Fall through and block invalid or external navigation.
    }

    event.preventDefault();
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  if (developerMode) {
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    });
  }
};

const focusMainWindow = () => {
  const mainWindow = BrowserWindow.getAllWindows()[0];

  if (!mainWindow) {
    if (app.isReady() && developerModeService) {
      createWindow(isDeveloperModeEnabled());
    }
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
};

const showDatabaseStartupFailure = async (error: unknown) => {
  const dataDirectory = app.getPath('userData');
  const content = buildStartupFailureContent({
    error,
    dataDirectory,
    locale: app.getLocale(),
  });

  try {
    const result = await dialog.showMessageBox({
      type: 'error',
      title: content.title,
      message: content.message,
      detail: content.detail,
      buttons: [content.openButton, content.quitButton],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });

    if (result.response === 0) {
      const failure = await shell.openPath(dataDirectory);

      if (failure) {
        console.error('Failed to open the data directory.', failure);
      }
    }
  } catch (dialogError) {
    console.error('Failed to show the database startup error.', dialogError);
  }
};

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', focusMainWindow);

  const initializeApplication = async () => {
    try {
      database = openDatabase(allocateDatabasePath(app.getPath('userData')));
      const pagesRepository = new PagesRepository(database);
      const settingsStore = new Store<{
        modelProviders?: StoredProviderSettings;
        developerMode?: boolean;
        developerPromptProfile?: DeveloperPromptProfile;
        webSearch?: StoredWebSearchSettings;
        windowState?: StoredWindowState;
      }>({ name: 'tap-along-settings' });
      windowStateService = new WindowStateService({
        read: () => settingsStore.get('windowState'),
        write: (state) => settingsStore.set('windowState', state),
      });
      const providerStore: ProviderSettingsStore = {
        read: () => settingsStore.get('modelProviders'),
        write: (settings) => settingsStore.set('modelProviders', settings),
      };
      developerModeService = new DeveloperModeService({
        read: () => settingsStore.get('developerMode', false),
        write: (enabled) => settingsStore.set('developerMode', enabled),
      });
      const developerPromptService = new DeveloperPromptConfigService(
        developerModeService,
        {
          read: () => settingsStore.get('developerPromptProfile'),
          write: (profile) =>
            settingsStore.set('developerPromptProfile', profile),
          clear: () => settingsStore.delete('developerPromptProfile'),
        },
      );
      const teacherRequestInspector = new TeacherRequestInspector(
        developerModeService,
      );

      registerSettingsHandlers(ipcMain, developerModeService);
      registerDeveloperPromptHandlers(ipcMain, developerPromptService);
      const providerService = new ProviderConfigService(
        providerStore,
        new ElectronSecretCipher(),
      );
      registerProviderHandlers(
        ipcMain,
        providerService,
        new ProviderConnectionService(
          providerService,
          new ProviderConnectionTester(),
          developerPromptService,
        ),
      );
      const guidanceService = new GuidanceService(
        pagesRepository,
        createGuidancePlanner({ configService: providerService }),
      );
      const searchConfigService = new SearchConfigService(
        {
          read: () => settingsStore.get('webSearch'),
          write: (settings) => settingsStore.set('webSearch', settings),
        },
        new ElectronSecretCipher(),
        {
          deepseekKeyProvider: async () => {
            const resolved = await providerService.resolve('deepseek');
            return resolved.ok ? resolved.config.apiKey : null;
          },
        },
      );
      const webSearchService = new WebSearchService({
        configService: searchConfigService,
      });
      const researchService = new ResearchService(
        createIntentRouter({ configService: providerService }),
        webSearchService,
      );
      const titleService = new TitleService(
        pagesRepository,
        new ModelTitleGenerator(
          createStructuredCompletion({ configService: providerService }),
        ),
      );
      registerPageHandlers(
        ipcMain,
        pagesRepository,
        guidanceService,
        titleService,
      );
      registerContextHandlers(ipcMain, pagesRepository);
      registerBackupHandlers(ipcMain, pagesRepository, {
        documentsPath: app.getPath('documents'),
        showSaveDialog: async (options) => {
          const window = BrowserWindow.getFocusedWindow();
          return window
            ? dialog.showSaveDialog(window, options)
            : dialog.showSaveDialog(options);
        },
        writeFile: (filePath, data, encoding) =>
          writeFile(filePath, data, encoding),
      });
      registerGuidanceHandlers(ipcMain, guidanceService);
      registerSearchHandlers(ipcMain, searchConfigService, webSearchService);
      registerShellHandlers(ipcMain, (url) => shell.openExternal(url));
      registerTeacherHandlers(
        ipcMain,
        new TeacherService(
          pagesRepository,
          createModelAwareTeacherStream({
            configService: providerService,
            fallback: createMockTeacherStream,
            promptService: developerPromptService,
            inspector: teacherRequestInspector,
          }),
          researchService,
        ),
        teacherRequestInspector,
      );
    } catch (error) {
      console.error('Failed to initialize the TapAlong database.', error);
      await showDatabaseStartupFailure(error);
      app.quit();
      return;
    }

    createWindow(isDeveloperModeEnabled());

    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow(isDeveloperModeEnabled());
      }
    });
  };

  app.whenReady().then(initializeApplication);

  app.on('before-quit', () => {
    if (!database) {
      return;
    }

    closeDatabase(database);
    database = null;
  });

  // Quit when all windows are closed, except on macOS. There, it's common
  // for applications and their menu bar to stay active until the user quits
  // explicitly with Cmd + Q.
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
