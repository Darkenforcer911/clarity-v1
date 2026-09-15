import "server-only";

import { Buffer } from "node:buffer";
import { z } from "zod";

import { getAuthenticatedUserAndProfile } from "../daily-loop-queries";
import {
  CLARITY_MEDIA_BUCKET,
  clarityAttachmentPreparationSchema,
  type ClarityAttachmentPreparation,
  type ClarityMessageAttachment,
} from "./clarity-attachments";
import type { ClarityProviderImage } from "./clarity-provider";

const attachmentRowSchema = z.object({
  id: z.string().uuid(),
  message_id: z.string().uuid().nullable(),
  onboarding_message_id: z.string().uuid().nullable(),
  kind: z.enum(["image", "audio"]),
  storage_path: z.string().min(1),
  mime_type: z.string().min(1),
  byte_size: z.number().int().positive(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  duration_ms: z.number().int().positive().nullable(),
  transcript: z.string().nullable(),
  transcription_status: z.enum([
    "not_applicable",
    "pending",
    "complete",
    "failed",
  ]),
  position: z.number().int().min(0).max(3).nullable(),
});

type AttachmentRow = z.infer<typeof attachmentRowSchema>;

export class ClarityTranscriptionError extends Error {
  constructor(message = "The voice memo could not be transcribed.") {
    super(message);
    this.name = "ClarityTranscriptionError";
  }
}

export async function createClarityAttachmentUpload(
  input: ClarityAttachmentPreparation,
) {
  const parsed = clarityAttachmentPreparationSchema.parse(input);
  const { supabase } = await getAuthenticatedUserAndProfile();
  const { data, error } = await supabase.rpc("create_clarity_attachment_v1", {
    p_kind: parsed.kind,
    p_mime_type: parsed.mimeType,
    p_byte_size: parsed.byteSize,
    ...(parsed.width === null ? {} : { p_width: parsed.width }),
    ...(parsed.height === null ? {} : { p_height: parsed.height }),
    ...(parsed.durationMs === null ? {} : { p_duration_ms: parsed.durationMs }),
  });
  if (error) throw new Error(error.message);
  const attachment = data?.[0];
  if (!attachment) throw new Error("Clarity could not prepare that attachment.");

  const signed = await supabase.storage
    .from(CLARITY_MEDIA_BUCKET)
    .createSignedUploadUrl(attachment.storage_path);
  if (signed.error) {
    await supabase.rpc("discard_clarity_draft_attachment_v1", {
      p_attachment_id: attachment.attachment_id,
    });
    throw new Error(signed.error.message);
  }

  return {
    attachmentId: attachment.attachment_id,
    storagePath: attachment.storage_path,
    uploadToken: signed.data.token,
  };
}

export async function discardClarityDraftAttachment(attachmentIdInput: string) {
  const attachmentId = z.string().uuid().parse(attachmentIdInput);
  const { supabase, user } = await getAuthenticatedUserAndProfile();
  const { data: attachment, error: attachmentError } = await supabase
    .from("clarity_message_attachments")
    .select("storage_path")
    .eq("id", attachmentId)
    .eq("user_id", user.id)
    .is("message_id", null)
    .is("onboarding_message_id", null)
    .maybeSingle();
  if (attachmentError) throw new Error(attachmentError.message);
  if (!attachment) throw new Error("Draft attachment not found.");

  const removed = await supabase.storage
    .from(CLARITY_MEDIA_BUCKET)
    .remove([attachment.storage_path]);
  if (removed.error) throw new Error(removed.error.message);

  const { error } = await supabase.rpc("discard_clarity_draft_attachment_v1", {
    p_attachment_id: attachmentId,
  });
  if (error) throw new Error(error.message);
}

export async function loadClarityAttachmentsForMessages(messageIds: string[]) {
  return loadAttachmentsForMessages(messageIds, "message_id");
}

export async function loadOnboardingAttachmentsForMessages(
  messageIds: string[],
) {
  return loadAttachmentsForMessages(messageIds, "onboarding_message_id");
}

async function loadAttachmentsForMessages(
  messageIds: string[],
  target: "message_id" | "onboarding_message_id",
) {
  if (messageIds.length === 0) return new Map<string, ClarityMessageAttachment[]>();
  const ids = z.array(z.string().uuid()).max(80).parse(messageIds);
  const { supabase, user } = await getAuthenticatedUserAndProfile();
  const { data, error } = await supabase
    .from("clarity_message_attachments")
    .select(
      "id, message_id, onboarding_message_id, kind, storage_path, mime_type, byte_size, width, height, duration_ms, transcript, transcription_status, position",
    )
    .eq("user_id", user.id)
    .in(target, ids)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = attachmentRowSchema.array().parse(data ?? []);
  const signed = rows.length === 0
    ? { data: [], error: null }
    : await supabase.storage
        .from(CLARITY_MEDIA_BUCKET)
        .createSignedUrls(rows.map((row) => row.storage_path), 60 * 60);
  if (signed.error) throw new Error(signed.error.message);
  const signedByPath = new Map(
    (signed.data ?? []).map((item) => [item.path, item.signedUrl]),
  );
  const byMessage = new Map<string, ClarityMessageAttachment[]>();

  for (const row of rows) {
    const messageId = row[target];
    if (!messageId || row.position === null) continue;
    const attachment = publicAttachment(row, signedByPath.get(row.storage_path) ?? null);
    byMessage.set(messageId, [
      ...(byMessage.get(messageId) ?? []),
      attachment,
    ]);
  }
  return byMessage;
}

export async function prepareClarityMessageForReasoning(input: {
  content: string;
  attachments: ClarityMessageAttachment[];
}) {
  const audio = input.attachments.find((attachment) => attachment.kind === "audio");
  let transcript = audio?.transcript ?? null;

  if (audio && audio.transcriptionStatus !== "complete") {
    transcript = await transcribeClarityAudio(audio.id);
  }

  const images: ClarityProviderImage[] = [];
  for (const attachment of input.attachments) {
    if (attachment.kind !== "image") continue;
    const row = await loadOwnedAttachment(attachment.id);
    const bytes = await downloadAttachment(row.storage_path);
    images.push({
      mimeType: row.mime_type,
      base64Data: Buffer.from(bytes).toString("base64"),
    });
  }

  const parts = [input.content.trim(), transcript?.trim() ?? ""].filter(Boolean);
  const userMessage = parts.length > 0
    ? parts.join("\n\n")
    : "The user sent the attached image without accompanying text.";

  return { userMessage, images };
}

/**
 * Transcribes an owned draft audio attachment for composer dictation. The
 * recording is temporary input: it is never claimed by a Clarity message and
 * is removed from Storage and attachment metadata after a successful result.
 */
export async function transcribeClarityDraftAudio(attachmentIdInput: string) {
  const startedAt = Date.now();
  const row = await loadOwnedAttachment(attachmentIdInput);
  if (
    row.kind !== "audio" ||
    row.message_id !== null ||
    row.onboarding_message_id !== null
  ) {
    throw new ClarityTranscriptionError("That dictation is no longer available.");
  }

  try {
    const transcript = await requestClarityAudioTranscript(row);
    await discardClarityDraftAttachment(row.id);
    logTranscription({ success: true, latencyMs: Date.now() - startedAt });
    return transcript;
  } catch (error) {
    logTranscription({ success: false, latencyMs: Date.now() - startedAt });
    if (error instanceof ClarityTranscriptionError) throw error;
    throw new ClarityTranscriptionError();
  }
}

async function transcribeClarityAudio(attachmentId: string) {
  const startedAt = Date.now();
  const row = await loadOwnedAttachment(attachmentId);
  if (row.kind !== "audio" || !row.message_id) {
    throw new ClarityTranscriptionError();
  }
  if (row.transcription_status === "complete" && row.transcript) {
    return row.transcript;
  }

  const { supabase } = await getAuthenticatedUserAndProfile();
  try {
    const transcript = await requestClarityAudioTranscript(row);

    const completed = await supabase.rpc(
      "complete_clarity_audio_transcription_v1",
      { p_attachment_id: row.id, p_transcript: transcript },
    );
    if (completed.error) throw new Error(completed.error.message);
    logTranscription({ success: true, latencyMs: Date.now() - startedAt });
    return transcript;
  } catch {
    await supabase.rpc("fail_clarity_audio_transcription_v1", {
      p_attachment_id: row.id,
    });
    logTranscription({ success: false, latencyMs: Date.now() - startedAt });
    throw new ClarityTranscriptionError();
  }
}

async function requestClarityAudioTranscript(row: AttachmentRow) {
  const bytes = await downloadAttachment(row.storage_path);
  const body = new FormData();
  body.set(
    "file",
    new File([bytes], fileNameForAudio(row.mime_type), { type: row.mime_type }),
  );
  body.set("model", process.env.CLARITY_TRANSCRIPTION_MODEL ?? "gpt-transcribe");
  body.set("response_format", "json");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${requiredOpenAIKey()}` },
    body,
    signal: AbortSignal.timeout(60_000),
  });
  const payload = (await response.json()) as { text?: unknown };
  if (!response.ok || typeof payload.text !== "string") {
    throw new Error("Transcription provider failure.");
  }
  const transcript = payload.text.trim();
  if (transcript.length < 1 || transcript.length > 8000) {
    throw new Error("Invalid transcription output.");
  }
  return transcript;
}

async function loadOwnedAttachment(attachmentId: string) {
  const parsedId = z.string().uuid().parse(attachmentId);
  const { supabase, user } = await getAuthenticatedUserAndProfile();
  const { data, error } = await supabase
    .from("clarity_message_attachments")
    .select(
      "id, message_id, onboarding_message_id, kind, storage_path, mime_type, byte_size, width, height, duration_ms, transcript, transcription_status, position",
    )
    .eq("id", parsedId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Attachment not found.");
  return attachmentRowSchema.parse(data);
}

async function downloadAttachment(storagePath: string) {
  const { supabase } = await getAuthenticatedUserAndProfile();
  const { data, error } = await supabase.storage
    .from(CLARITY_MEDIA_BUCKET)
    .download(storagePath);
  if (error) throw new Error(error.message);
  return await data.arrayBuffer();
}

function publicAttachment(
  row: AttachmentRow,
  signedUrl: string | null,
): ClarityMessageAttachment {
  return {
    id: row.id,
    kind: row.kind,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    width: row.width,
    height: row.height,
    durationMs: row.duration_ms,
    transcript: row.transcript,
    transcriptionStatus: row.transcription_status,
    position: row.position ?? 0,
    signedUrl,
  };
}

function requiredOpenAIKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Transcription configuration is incomplete.");
  return key;
}

function fileNameForAudio(mimeType: string) {
  if (mimeType === "audio/wav") return "voice.wav";
  if (mimeType === "audio/webm") return "voice.webm";
  if (mimeType === "audio/ogg") return "voice.ogg";
  if (mimeType === "audio/mpeg" || mimeType === "audio/mp3") return "voice.mp3";
  return "voice.m4a";
}

function logTranscription(event: { success: boolean; latencyMs: number }) {
  console.info("clarity_transcription_request", {
    ...event,
    model: process.env.CLARITY_TRANSCRIPTION_MODEL ?? "gpt-transcribe",
  });
}
