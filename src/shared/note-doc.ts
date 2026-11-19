export interface NoteDoc {
  type: 'doc';
  content: NoteParagraph[];
}

export interface NoteParagraph {
  type: 'paragraph';
  content?: NoteInline[];
}

export type NoteInline =
  | { type: 'text'; text: string }
  | { type: 'hardBreak' }
  | { type: 'noteImage'; attrs: NoteImageAttrs };

export interface NoteImageAttrs {
  imageId: string;
  alt?: string;
}

export interface StoredNoteDoc {
  version: 1;
  doc: NoteDoc;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const createEmptyNoteDoc = (): NoteDoc => ({
  type: 'doc',
  content: [{ type: 'paragraph' }],
});

const cloneInline = (inline: NoteInline): NoteInline => {
  if (inline.type === 'text') {
    return { type: 'text', text: inline.text };
  }

  if (inline.type === 'hardBreak') {
    return { type: 'hardBreak' };
  }

  const imageId =
    typeof inline.attrs.imageId === 'string' ? inline.attrs.imageId : '';

  return {
    type: 'noteImage',
    attrs: {
      imageId,
      ...(inline.attrs.alt !== undefined ? { alt: inline.attrs.alt } : {}),
    },
  };
};

export const cloneNoteDoc = (doc: NoteDoc): NoteDoc => ({
  type: 'doc',
  content: doc.content.map((paragraph) => {
    const content = paragraph.content?.map(cloneInline);

    return {
      type: 'paragraph',
      ...(content && content.length > 0 ? { content } : {}),
    };
  }),
});

export const derivePlainText = (doc: NoteDoc): string => {
  const paragraphs = doc.content.map((paragraph) => {
    if (!paragraph.content) {
      return '';
    }

    return paragraph.content
      .map((inline) => {
        if (inline.type === 'text') {
          return inline.text;
        }

        if (inline.type === 'hardBreak') {
          return '\n';
        }

        // 图片不进入正文文本；用空格避免前后文字粘连
        return ' ';
      })
      .join('');
  });

  return paragraphs.join('\n').trim();
};

export const docFromPlainText = (body: string): NoteDoc => {
  const content = body.split(/\r?\n/).map((line) => {
    return line.length > 0
      ? {
          type: 'paragraph' as const,
          content: [{ type: 'text' as const, text: line }],
        }
      : { type: 'paragraph' as const };
  });

  return {
    type: 'doc',
    content: content.length > 0 ? content : [{ type: 'paragraph' }],
  };
};

export const appendTextToDoc = (doc: NoteDoc, text: string): NoteDoc => {
  const cloned = cloneNoteDoc(doc);

  if (text.length === 0) {
    return cloned;
  }

  const paragraphs = text.split(/\r?\n/).map((line) => {
    return line.length > 0
      ? {
          type: 'paragraph' as const,
          content: [{ type: 'text' as const, text: line }],
        }
      : { type: 'paragraph' as const };
  });

  return {
    type: 'doc',
    content: [...cloned.content, ...paragraphs],
  };
};

export const countNoteImages = (doc?: NoteDoc | null): number => {
  if (!doc) {
    return 0;
  }

  let count = 0;

  for (const paragraph of doc.content) {
    for (const inline of paragraph.content ?? []) {
      if (inline.type === 'noteImage') {
        count += 1;
      }
    }
  }

  return count;
};

export const collectNoteImageIds = (doc?: NoteDoc | null): string[] => {
  if (!doc) {
    return [];
  }

  const imageIds: string[] = [];
  const seen = new Set<string>();

  for (const paragraph of doc.content) {
    for (const inline of paragraph.content ?? []) {
      if (inline.type !== 'noteImage') {
        continue;
      }

      const imageId =
        typeof inline.attrs.imageId === 'string'
          ? inline.attrs.imageId.trim()
          : '';

      if (imageId && !seen.has(imageId)) {
        seen.add(imageId);
        imageIds.push(imageId);
      }
    }
  }

  return imageIds;
};

export const hasPendingNoteImages = (doc: NoteDoc): boolean =>
  doc.content.some((paragraph) =>
    paragraph.content?.some(
      (inline) => inline.type === 'noteImage' && !inline.attrs.imageId.trim(),
    ),
  );

export const stripPendingImages = (doc: NoteDoc): NoteDoc => {
  const content = doc.content.map((paragraph) => {
    const inline: NoteInline[] = [];

    for (const item of paragraph.content ?? []) {
      if (
        item.type === 'noteImage' &&
        (!item.attrs.imageId || !item.attrs.imageId.trim())
      ) {
        continue;
      }

      inline.push(cloneInline(item));
    }

    return {
      type: 'paragraph' as const,
      ...(inline.length > 0 ? { content: inline } : {}),
    };
  });

  return {
    type: 'doc',
    content: content.length > 0 ? content : [{ type: 'paragraph' }],
  };
};

const parseInline = (value: unknown): NoteInline | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (value.type === 'text') {
    return typeof value.text === 'string'
      ? { type: 'text', text: value.text }
      : null;
  }

  if (value.type === 'hardBreak') {
    return { type: 'hardBreak' };
  }

  if (value.type !== 'noteImage' || !isRecord(value.attrs)) {
    return null;
  }

  const { imageId } = value.attrs;

  if (typeof imageId !== 'string' || !imageId.trim()) {
    return null;
  }

  const alt = value.attrs.alt;

  if (alt !== undefined && typeof alt !== 'string') {
    return null;
  }

  return {
    type: 'noteImage',
    attrs: {
      imageId: imageId.trim(),
      ...(alt !== undefined ? { alt } : {}),
    },
  };
};

const parseParagraph = (value: unknown): NoteParagraph | null => {
  if (!isRecord(value) || value.type !== 'paragraph') {
    return null;
  }

  if (value.content === undefined) {
    return { type: 'paragraph' };
  }

  if (!Array.isArray(value.content)) {
    return null;
  }

  const content: NoteInline[] = [];

  for (const item of value.content) {
    const inline = parseInline(item);

    if (!inline) {
      return null;
    }

    content.push(inline);
  }

  return content.length > 0
    ? { type: 'paragraph', content }
    : { type: 'paragraph' };
};

export type NoteDocParseResult = { ok: true; doc: NoteDoc } | { ok: false };

export const parseNoteDoc = (value: unknown): NoteDocParseResult => {
  if (
    !isRecord(value) ||
    value.type !== 'doc' ||
    !Array.isArray(value.content)
  ) {
    return { ok: false };
  }

  const content: NoteParagraph[] = [];

  for (const block of value.content) {
    const paragraph = parseParagraph(block);

    if (!paragraph) {
      return { ok: false };
    }

    content.push(paragraph);
  }

  return {
    ok: true,
    doc: {
      type: 'doc',
      content: content.length > 0 ? content : [{ type: 'paragraph' }],
    },
  };
};

export const serializeStoredNoteDoc = (doc: NoteDoc): string => {
  return JSON.stringify({ version: 1, doc } satisfies StoredNoteDoc) ?? '';
};

export const storedDocFromJson = (value: string | null): NoteDoc | null => {
  if (!value) {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) {
    return null;
  }

  if (parsed.type === 'doc') {
    const result = parseNoteDoc(parsed);
    return result.ok ? result.doc : null;
  }

  if (parsed.version !== 1 || !('doc' in parsed)) {
    return null;
  }

  const result = parseNoteDoc(parsed.doc);
  return result.ok ? result.doc : null;
};
