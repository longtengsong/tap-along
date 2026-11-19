import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { AppErrorCode } from '@/shared/errors';
import type { CreatePageImageResult } from '@/shared/images';
import {
  compressImageFile,
  ImageCompressionError,
  isSupportedImageFile,
} from './image-compress';

export type UploadPageImage = (
  bytes: Uint8Array,
) => Promise<CreatePageImageResult>;

export interface NoteImageUploaderCallbacks {
  onUploadingChange: (count: number) => void;
  onError: (errorCode: AppErrorCode) => void;
  onImageUploaded?: () => void;
}

class UploadFailure extends Error {
  readonly errorCode: AppErrorCode;

  constructor(errorCode: AppErrorCode) {
    super(errorCode);
    this.name = 'UploadFailure';
    this.errorCode = errorCode;
  }
}

const findPendingNode = (
  editor: Editor,
  pendingId: string,
): { pos: number; node: ProseMirrorNode } | null => {
  let found: { pos: number; node: ProseMirrorNode } | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'noteImage' && node.attrs.pendingId === pendingId) {
      found = { pos, node };
      return false;
    }

    return true;
  });

  return found;
};

export const extractImageFiles = (
  data: DataTransfer | null | undefined,
): File[] => {
  if (!data) {
    return [];
  }

  const candidates = [
    ...Array.from(data.files ?? []),
    ...Array.from(data.items ?? []).flatMap((item) => {
      if (item.kind !== 'file') {
        return [];
      }

      const file = item.getAsFile();
      return file ? [file] : [];
    }),
  ];
  const seen = new Set<string>();
  const files: File[] = [];

  for (const file of candidates) {
    if (!file.type.startsWith('image/') && !isSupportedImageFile(file)) {
      continue;
    }

    const key = `${file.name}:${file.size}:${file.lastModified}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    files.push(file);
  }

  return files;
};

export class NoteImageUploader {
  private readonly editor: Editor;
  private readonly uploadImage: UploadPageImage;
  private readonly callbacks: NoteImageUploaderCallbacks;
  private readonly pending = new Set<string>();

  constructor(
    editor: Editor,
    uploadImage: UploadPageImage,
    callbacks: NoteImageUploaderCallbacks,
  ) {
    this.editor = editor;
    this.uploadImage = uploadImage;
    this.callbacks = callbacks;
  }

  addFiles(files: File[]): void {
    if (this.editor.isDestroyed) {
      return;
    }

    const imageFiles = files.filter(
      (file) => file.type.startsWith('image/') || isSupportedImageFile(file),
    );

    if (imageFiles.length === 0) {
      return;
    }

    for (const file of imageFiles) {
      if (!isSupportedImageFile(file)) {
        this.callbacks.onError('IMAGE_INVALID');
        continue;
      }

      const pendingId = crypto.randomUUID();
      const inserted = this.editor
        .chain()
        .focus()
        .insertContent({
          type: 'noteImage',
          attrs: {
            imageId: '',
            alt: file.name,
            pendingId,
          },
        })
        .run();

      if (!inserted) {
        this.callbacks.onError('IMAGE_SAVE_FAILED');
        continue;
      }

      this.pending.add(pendingId);
      this.notify();

      void this.process(file, pendingId);
    }
  }

  private async process(file: File, pendingId: string): Promise<void> {
    try {
      const bytes = await compressImageFile(file);
      const result = await this.uploadImage(bytes);

      if (!result.ok || !result.image) {
        throw new UploadFailure(result.errorCode ?? 'IMAGE_SAVE_FAILED');
      }

      this.replacePending(pendingId, result.image.id);
      this.callbacks.onImageUploaded?.();
    } catch (error) {
      this.removePending(pendingId);
      this.callbacks.onError(
        error instanceof ImageCompressionError
          ? 'IMAGE_INVALID'
          : error instanceof UploadFailure
            ? error.errorCode
            : 'IMAGE_SAVE_FAILED',
      );
    } finally {
      this.pending.delete(pendingId);
      this.notify();
    }
  }

  private replacePending(pendingId: string, imageId: string): void {
    if (this.editor.isDestroyed) {
      return;
    }

    const found = findPendingNode(this.editor, pendingId);

    if (!found) {
      return;
    }

    const transaction = this.editor.state.tr.setNodeMarkup(
      found.pos,
      undefined,
      {
        ...found.node.attrs,
        imageId,
        pendingId: null,
      },
    );

    this.editor.view.dispatch(transaction);
  }

  private removePending(pendingId: string): void {
    if (this.editor.isDestroyed) {
      return;
    }

    const found = findPendingNode(this.editor, pendingId);

    if (!found) {
      return;
    }

    const transaction = this.editor.state.tr.delete(
      found.pos,
      found.pos + found.node.nodeSize,
    );

    this.editor.view.dispatch(transaction);
  }

  private notify(): void {
    this.callbacks.onUploadingChange(this.pending.size);
  }
}
