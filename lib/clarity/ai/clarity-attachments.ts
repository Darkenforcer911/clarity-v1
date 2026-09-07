import { z } from "zod";

export const CLARITY_MEDIA_BUCKET = "clarity-media";
export const MAX_CLARITY_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_CLARITY_AUDIO_BYTES = 15 * 1024 * 1024;
export const MAX_CLARITY_AUDIO_DURATION_MS = 5 * 60 * 1000;
export const MAX_CLARITY_IMAGE_COUNT = 4;

export const clarityImageMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export const clarityAudioMimeTypes = [
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/wav",
  "audio/webm",
  "audio/ogg",
] as const;

export const clarityAttachmentPreparationSchema = z
  .object({
    kind: z.enum(["image", "audio"]),
    mimeType: z.string(),
    byteSize: z.number().int().positive(),
    width: z.number().int().min(1).max(12000).nullable(),
    height: z.number().int().min(1).max(12000).nullable(),
    durationMs: z.number().int().min(1).max(MAX_CLARITY_AUDIO_DURATION_MS).nullable(),
  })
  .superRefine((value, context) => {
    if (value.kind === "image") {
      if (!clarityImageMimeTypes.includes(value.mimeType as never)) {
        context.addIssue({ code: "custom", message: "Choose a JPEG, PNG, WebP, or GIF image." });
      }
      if (value.byteSize > MAX_CLARITY_IMAGE_BYTES) {
        context.addIssue({ code: "custom", message: "Images must be 8 MB or smaller." });
      }
      if ((value.width === null) !== (value.height === null) || value.durationMs !== null) {
        context.addIssue({ code: "custom", message: "Invalid image details." });
      }
      return;
    }

    if (!clarityAudioMimeTypes.includes(value.mimeType as never)) {
      context.addIssue({ code: "custom", message: "This audio format isn’t supported." });
    }
    if (value.byteSize > MAX_CLARITY_AUDIO_BYTES) {
      context.addIssue({ code: "custom", message: "Voice memos must be 15 MB or smaller." });
    }
    if (value.durationMs === null || value.width !== null || value.height !== null) {
      context.addIssue({ code: "custom", message: "Invalid voice memo details." });
    }
  });

export type ClarityAttachmentPreparation = z.infer<
  typeof clarityAttachmentPreparationSchema
>;

export type ClarityMessageAttachment = {
  id: string;
  kind: "image" | "audio";
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  transcript: string | null;
  transcriptionStatus: "not_applicable" | "pending" | "complete" | "failed";
  position: number;
  signedUrl: string | null;
};

export function normalizeClarityMimeType(value: string) {
  return value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}
