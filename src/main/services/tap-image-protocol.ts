import type { Protocol } from 'electron';
import { Readable } from 'node:stream';
import type { PageImagesRepository } from '../db/page-images.ts';
import type { ImageStore } from './image-store.ts';

export const TAP_IMAGE_SCHEME = 'tap-image';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const notFound = () => new Response('Not found', { status: 404 });

export const createTapImageResponse = async (
  requestUrl: string,
  images: Pick<PageImagesRepository, 'find'>,
  store: Pick<ImageStore, 'stat' | 'createReadStream'>,
): Promise<Response> => {
  let url: URL;

  try {
    url = new URL(requestUrl);
  } catch {
    return notFound();
  }

  if (url.host !== 'img') {
    return notFound();
  }

  let imageId: string;

  try {
    imageId = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  } catch {
    return notFound();
  }

  if (!UUID_PATTERN.test(imageId)) {
    return notFound();
  }

  const row = images.find(imageId);

  if (!row) {
    return notFound();
  }

  const stats = await store.stat(row.file_name);

  if (!stats) {
    return notFound();
  }

  const stream = Readable.toWeb(
    store.createReadStream(row.file_name),
  ) as unknown as ReadableStream;

  return new Response(stream, {
    headers: {
      'Content-Type': row.mime,
      'Content-Length': String(stats.size),
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};

export const registerTapImageScheme = (protocol: Protocol): void => {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: TAP_IMAGE_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
      },
    },
  ]);
};

export const registerTapImageHandler = (
  protocol: Protocol,
  images: Pick<PageImagesRepository, 'find'>,
  store: Pick<ImageStore, 'stat' | 'createReadStream'>,
): void => {
  protocol.handle(TAP_IMAGE_SCHEME, (request) =>
    createTapImageResponse(request.url, images, store),
  );
};
