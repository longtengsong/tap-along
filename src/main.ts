import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
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
import { createModelAwareTeacherStream } from './main/services/model-teacher';
import {
  createMockTeacherStream,
  TeacherService,
} from './main/services/teacher';
import type { DeveloperPromptProfile } from './shared/prompts';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

let database: DatabaseSync | null = null;
let developerModeService: DeveloperModeService | null = null;

const isDeveloperModeEnabled = () => {
  const result = developerModeService?.get();
  return result?.ok === true && result.enabled === true;
};

const createWindow = (developerMode = false) => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 720,
    minHeight: 560,
    backgroundColor: '#e8e4dc',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
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

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', focusMainWindow);

  app.whenReady().then(() => {
    try {
      database = openDatabase(allocateDatabasePath(app.getPath('userData')));
      const pagesRepository = new PagesRepository(database);
      const settingsStore = new Store<{
        modelProviders?: StoredProviderSettings;
        developerMode?: boolean;
        developerPromptProfile?: DeveloperPromptProfile;
      }>({ name: 'tap-along-settings' });
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

      registerPageHandlers(ipcMain, pagesRepository);
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
      registerTeacherHandlers(
        ipcMain,
        new TeacherService(
          pagesRepository,
          createModelAwareTeacherStream({
            configService: providerService,
            fallback: createMockTeacherStream,
            promptService: developerPromptService,
          }),
        ),
      );
    } catch (error) {
      console.error('Failed to initialize the TapAlong database.', error);
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
  });

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
