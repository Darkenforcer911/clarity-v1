import {
  clarityImageMimeTypes,
  normalizeClarityMimeType,
} from "./clarity-attachments.ts";

const HEIC_MIME_TYPES = new Set([
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);
const HEIC_FILE_EXTENSION = /\.(?:heic|heif)$/i;
const MAX_NORMALIZED_IMAGE_DIMENSION = 4096;
const NORMALIZED_JPEG_QUALITY = 0.9;

export type HeicImageConverter = (file: File) => Promise<File>;

export function isHeicImageFile(file: Pick<File, "name" | "type">) {
  return (
    HEIC_MIME_TYPES.has(normalizeClarityMimeType(file.type)) ||
    HEIC_FILE_EXTENSION.test(file.name)
  );
}

export function normalizedJpegFileName(name: string) {
  const base = name.replace(HEIC_FILE_EXTENSION, "").trim() || "photo";
  return `${base}.jpg`;
}

export function boundedImageDimensions(width: number, height: number) {
  const scale = Math.min(
    1,
    MAX_NORMALIZED_IMAGE_DIMENSION / Math.max(width, height),
  );
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export async function normalizeClarityImageFile(
  file: File,
  convertHeic: HeicImageConverter = convertHeicImageToJpeg,
) {
  const mimeType = normalizeClarityMimeType(file.type);
  if (clarityImageMimeTypes.includes(mimeType as never)) return file;
  if (!isHeicImageFile(file)) {
    throw new Error("Choose a JPEG, PNG, WebP, or GIF image.");
  }

  try {
    const normalized = await convertHeic(file);
    if (normalizeClarityMimeType(normalized.type) !== "image/jpeg") {
      throw new Error("Unexpected normalized image format.");
    }
    return normalized;
  } catch {
    throw new Error(
      "That iPhone photo couldn’t be converted. Try sharing it as a JPEG.",
    );
  }
}

async function convertHeicImageToJpeg(file: File) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const size = boundedImageDimensions(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable.");

    // Modern WebKit applies the photo's EXIF orientation while decoding the
    // HTMLImageElement, so drawing its natural geometry preserves orientation.
    context.drawImage(image, 0, 0, size.width, size.height);
    const blob = await canvasToBlob(
      canvas,
      "image/jpeg",
      NORMALIZED_JPEG_QUALITY,
    );
    return new File([blob], normalizedJpegFileName(file.name), {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image decoding failed."));
    image.src = source;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Image conversion failed.")),
      type,
      quality,
    );
  });
}
