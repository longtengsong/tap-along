export const ACCEPTED_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
]);

export const MAX_IMAGE_EDGE = 2400;
export const IMAGE_QUALITY = 0.9;

type CompressionErrorCode = 'unsupported' | 'decode' | 'encode';

export class ImageCompressionError extends Error {
  readonly code: CompressionErrorCode;

  constructor(code: CompressionErrorCode) {
    super(code);
    this.name = 'ImageCompressionError';
    this.code = code;
  }
}

const hasSupportedExtension = (fileName: string) =>
  /\.(png|jpe?g|webp)$/i.test(fileName);

const isGif = (file: File) =>
  file.type === 'image/gif' || /\.gif$/i.test(file.name);

export const isSupportedImageFile = (file: File): boolean => {
  if (isGif(file)) {
    return false;
  }

  if (ACCEPTED_IMAGE_TYPES.has(file.type)) {
    return true;
  }

  return !file.type && hasSupportedExtension(file.name);
};

export const compressImageFile = async (file: File): Promise<Uint8Array> => {
  if (!isSupportedImageFile(file)) {
    throw new ImageCompressionError('unsupported');
  }

  let bitmap: ImageBitmap;

  try {
    bitmap = await createImageBitmap(file, {
      imageOrientation: 'from-image',
    });
  } catch {
    throw new ImageCompressionError('decode');
  }

  try {
    const scale = Math.min(
      1,
      MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height),
    );
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');

    if (!context) {
      throw new ImageCompressionError('encode');
    }

    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', IMAGE_QUALITY),
    );

    if (!blob) {
      throw new ImageCompressionError('encode');
    }

    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    bitmap.close();
  }
};
