import { safeStorage } from 'electron';
import type { SecretCipher } from '../services/providers.ts';

export class ElectronSecretCipher implements SecretCipher {
  async isAvailable(): Promise<boolean> {
    if (!(await safeStorage.isAsyncEncryptionAvailable())) {
      return false;
    }

    return (
      process.platform !== 'linux' ||
      safeStorage.getSelectedStorageBackend() !== 'basic_text'
    );
  }

  async encrypt(value: string): Promise<string> {
    return (await safeStorage.encryptStringAsync(value)).toString('base64');
  }
}
