export const IMAGE_PRIVACY_NOTICE_KEY = 'tap-along:image-privacy-notice';

export const claimImagePrivacyNotice = (
  storage: Pick<Storage, 'getItem' | 'setItem'>,
): boolean => {
  try {
    if (storage.getItem(IMAGE_PRIVACY_NOTICE_KEY)) {
      return false;
    }

    storage.setItem(IMAGE_PRIVACY_NOTICE_KEY, '1');
    return true;
  } catch {
    return false;
  }
};
