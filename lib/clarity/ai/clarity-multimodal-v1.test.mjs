import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  MAX_CLARITY_AUDIO_DURATION_MS,
  clarityAttachmentPreparationSchema,
} from "./clarity-attachments.ts";
import { appendDictationTranscript } from "./clarity-dictation.ts";
import { OpenAIClarityProvider } from "./clarity-provider.ts";

const read = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

const migration = read("../../../supabase/migrations/20260908000001_clarity_message_attachments_v1.sql");
const attachmentService = read("./clarity-attachment-service.ts");
const conversationService = read("./clarity-conversation-service.ts");
const orchestrator = read("./clarity-conversation-orchestrator.ts");
const prompt = read("./clarity-prompt.ts");
const action = read("../../../app/(app)/clarity/actions.ts");
const ui = read("../../../components/clarity/clarity-conversation.tsx");

const validOutput = {
  response: "I can help with what’s in the image.",
  nextMove: { type: "synthesize" },
  understanding: { learned: [] },
  uncertainties: [],
  requiresCurrentVerification: false,
  verificationNeed: null,
};

test("attachments use one general owner-scoped model and private storage", () => {
  assert.match(migration, /create table public\.clarity_message_attachments/);
  assert.match(migration, /kind in \('image', 'audio'\)/);
  assert.match(migration, /foreign key \(message_id, user_id\)/);
  assert.match(migration, /references public\.clarity_messages\(id, user_id\)/);
  assert.match(migration, /'clarity-media',[\s\S]*false/);
  assert.match(migration, /storage\.foldername\(name\).*auth\.uid/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /force row level security/);
  assert.match(migration, /transcription_status = 'complete'[\s\S]*transcript is not null/);
  assert.match(migration, /message_id is not null and position is not null/);
  assert.match(migration, /p_duration_ms is null or p_duration_ms not between 1 and 300000/);
  assert.doesNotMatch(
    migration,
    /grant (insert|update|delete) on table public\.clarity_message_attachments/i,
  );
});

test("Storage policies bind every object to canonical owned attachment metadata", () => {
  const uploadPolicy = migration.match(
    /create policy "Users can upload their own Clarity media"[\s\S]*?\n\);/,
  )?.[0] ?? "";
  const readPolicy = migration.match(
    /create policy "Users can read their own Clarity media"[\s\S]*?\n\);/,
  )?.[0] ?? "";
  const deletePolicy = migration.match(
    /create policy "Users can delete their own Clarity media"[\s\S]*?\n\);/,
  )?.[0] ?? "";

  for (const policy of [uploadPolicy, readPolicy, deletePolicy]) {
    assert.match(policy, /bucket_id = 'clarity-media'/);
    assert.match(policy, /storage\.foldername\(name\).*auth\.uid/);
    assert.match(policy, /cardinality\(storage\.foldername\(name\)\) = 1/);
    assert.match(policy, /public\.clarity_message_attachments/);
    assert.match(policy, /attachment\.user_id = \(select auth\.uid\(\)\)/);
    assert.match(policy, /attachment\.storage_path = name/);
    assert.match(policy, /attachment\.id::text/);
  }

  assert.match(uploadPolicy, /attachment\.message_id is null/);
  assert.match(uploadPolicy, /attachment\.transcription_status = 'pending'/);
  assert.doesNotMatch(readPolicy, /attachment\.message_id is null/);
  assert.match(deletePolicy, /attachment\.message_id is null/);
  assert.doesNotMatch(
    [uploadPolicy, readPolicy, deletePolicy].join("\n"),
    /for update/i,
  );
});

test("attachment limits reject unsupported or excessive media", () => {
  assert.equal(
    clarityAttachmentPreparationSchema.safeParse({
      kind: "image",
      mimeType: "image/jpeg",
      byteSize: 1024,
      width: null,
      height: null,
      durationMs: null,
    }).success,
    true,
  );
  assert.equal(
    clarityAttachmentPreparationSchema.safeParse({
      kind: "audio",
      mimeType: "audio/mp4",
      byteSize: 1024,
      width: null,
      height: null,
      durationMs: MAX_CLARITY_AUDIO_DURATION_MS + 1,
    }).success,
    false,
  );
  assert.equal(
    clarityAttachmentPreparationSchema.safeParse({
      kind: "image",
      mimeType: "image/svg+xml",
      byteSize: 1024,
      width: null,
      height: null,
      durationMs: null,
    }).success,
    false,
  );
});

test("photo and text are sent together through the existing Responses turn", async () => {
  const requests = [];
  const provider = new OpenAIClarityProvider(
    "test-model",
    "test-key",
    1_000,
    async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)));
      return Response.json({ output_text: JSON.stringify(validOutput) });
    },
  );

  await provider.generate({
    systemPrompt: "policy",
    userPrompt: "What does this mean?",
    images: [{ mimeType: "image/jpeg", base64Data: "YWJj" }],
  });

  const content = requests[0].input[1].content;
  assert.equal(content[0].type, "input_text");
  assert.equal(content[0].text, "What does this mean?");
  assert.equal(content[1].type, "input_image");
  assert.equal(content[1].image_url, "data:image/jpeg;base64,YWJj");
  assert.equal(requests[0].store, false);
});

test("photo-only is a valid user turn without fabricating user text", () => {
  assert.match(migration, /char_length\(p_content\) = 0 and cardinality\(p_attachment_ids\) = 0/);
  assert.match(action, /Write a message or add something first/);
  assert.match(
    attachmentService,
    /The user sent the attached image without accompanying text/,
  );
  assert.doesNotMatch(migration, /base64|image_data|audio_data/i);
});

test("message append atomically claims only uploaded owned draft attachments", () => {
  assert.match(migration, /create or replace function public\.append_clarity_user_message_v2/);
  assert.match(migration, /attachment\.user_id = v_user_id/);
  assert.match(migration, /attachment\.message_id is null/);
  assert.match(migration, /from storage\.objects as object/);
  assert.match(migration, /Attachment upload is incomplete/);
  assert.match(migration, /cardinality\(p_attachment_ids\) <>/);
  assert.match(migration, /message_id = v_message_id/);
  assert.match(conversationService, /append_clarity_user_message_v2/);
});

test("legacy persisted audio can still be transcribed for existing messages", () => {
  assert.match(migration, /transcription_status in \('pending', 'complete', 'failed'\)/);
  assert.match(attachmentService, /\/v1\/audio\/transcriptions/);
  assert.match(attachmentService, /CLARITY_TRANSCRIPTION_MODEL.*gpt-transcribe/);
  assert.match(attachmentService, /complete_clarity_audio_transcription_v1/);
  assert.match(attachmentService, /parts\.join\("\\n\\n"\)/);
  assert.match(prompt, /attachment\.transcript/);
  assert.match(ui, /<audio/);
  assert.match(ui, />Transcript</);
});

test("stopping dictation transcribes a draft without sending a message", () => {
  assert.match(ui, /setDictationStatus\("transcribing"\)/);
  assert.match(ui, /transcribeClarityDictationAction\(\{ attachmentId \}\)/);
  assert.match(action, /transcribeClarityDraftAudio\(input\.attachmentId\)/);
  assert.match(attachmentService, /row\.message_id !== null/);
  assert.match(attachmentService, /discardClarityDraftAttachment\(row\.id\)/);
  assert.doesNotMatch(
    action.match(/transcribeClarityDictationAction[\s\S]*?\n\}/)?.[0] ?? "",
    /appendClarityUserMessage|runClarityConversationTurn/,
  );
});

test("dictation returns editable composer text and appends repeated passes", () => {
  assert.equal(appendDictationTranscript("", "First thought."), "First thought.");
  assert.equal(
    appendDictationTranscript(
      "I need to figure out what I'm doing tomorrow.",
      " I also have an interview at three. ",
    ),
    "I need to figure out what I'm doing tomorrow. I also have an interview at three.",
  );
  assert.match(ui, /setMessage\(\(current\) =>[\s\S]*appendDictationTranscript/);
  assert.match(ui, /setDictationStatus\("transcript_ready"\)/);
  assert.match(ui, /value=\{message\}/);
});

test("pause and resume retain one MediaRecorder dictation session", () => {
  assert.match(ui, /recorder\.pause\(\)/);
  assert.match(ui, /recorder\.resume\(\)/);
  assert.match(ui, /recordedDurationMsRef\.current \+=/);
  assert.match(ui, /Paused/);
  assert.match(ui, /Resume/);
});

test("cancel and transcription failure never send or fabricate text", () => {
  assert.match(ui, /cancelRecordingRef\.current = true/);
  assert.match(ui, /cancelPendingDictation/);
  assert.match(ui, /discardClarityAttachmentAction\(\{ attachmentId \}\)/);
  assert.match(ui, /I couldn’t transcribe that/);
  assert.match(ui, />\s*Retry\s*</);
  assert.match(ui, />\s*Cancel\s*</);
  assert.doesNotMatch(ui, /setMessage\([^)]*(couldn|failed|error)/i);
});

test("ordinary Send persists dictated text without an audio attachment", () => {
  const submitBlock = ui.match(
    /function handleSubmit[\s\S]*?const canSend/,
  )?.[0] ?? "";
  assert.match(submitBlock, /formData\.append\("attachmentId", item\.attachmentId\)/);
  assert.doesNotMatch(submitBlock, /pendingDictation|audio/);
  assert.match(action, /message = messageSchema\.parse\(formData\.get\("message"\)\)/);
  assert.match(action, /appendClarityUserMessage\([\s\S]*message,/);
});

test("photos remain attached while dictation supplies editable text", () => {
  assert.doesNotMatch(ui, /Remove the photo before recording/);
  assert.match(ui, /draftMedia\.forEach/);
  assert.match(ui, /appendDictationTranscript/);
  assert.match(ui, /aria-label="Start dictation"/);
  assert.match(ui, /\{canSend && \(/);
});

test("transcription failure retains audio and retries the same message", () => {
  assert.match(attachmentService, /fail_clarity_audio_transcription_v1/);
  assert.match(action, /ClarityTranscriptionError/);
  assert.match(action, /It’s saved, so you can retry/);
  assert.match(action, /loadRetryableUserMessage/);
  assert.match(ui, /Retry transcription/);
  assert.match(conversationService, /response_to_message_id/);
  assert.equal((action.match(/appendClarityUserMessage\(/g) ?? []).length, 1);
});

test("attachment ownership is enforced for metadata, storage, and retrieval", () => {
  assert.match(migration, /using \(user_id = \(select auth\.uid\(\)\)\)/);
  assert.match(migration, /with check \([\s\S]*auth\.uid/);
  assert.match(attachmentService, /\.eq\("user_id", user\.id\)/);
  assert.match(migration, /revoke all on function public\.create_clarity_attachment_v1/);
  assert.match(migration, /to authenticated/);
});

test("selected Action or Calendar invocation remains attached to a photo turn", () => {
  assert.match(action, /invocation = parseInvocationDescriptor\(formData\)/);
  assert.match(action, /userMessage: prepared\.userMessage/);
  assert.match(action, /images: prepared\.images/);
  assert.match(orchestrator, /images: input\.images/);
  assert.match(migration, /Action invocation is malformed/);
  assert.match(migration, /Calendar invocation is malformed/);
});

test("media does not become canonical Life truth or bloat future turns", () => {
  assert.doesNotMatch(
    attachmentService,
    /create_life|confirm_life|life_model_change_proposal/,
  );
  assert.match(prompt, /\[User sent an image\]/);
  assert.doesNotMatch(prompt, /signedUrl|base64Data|storage_path/);
  assert.match(orchestrator, /images\?:/);
});

test("mobile composer and research presentation contain long content", () => {
  assert.match(ui, /bottom-\[calc\(4\.75rem\+env\(safe-area-inset-bottom\)\)\]/);
  assert.match(ui, /overflow-hidden/);
  assert.match(ui, /\[overflow-wrap:anywhere\]/);
  assert.match(ui, /max-w-\[70vw\]/);
  assert.match(ui, /Sources · \{sources\.length\}/);
  assert.match(ui, /View all/);
  assert.match(ui, /Take Photo/);
  assert.match(ui, /Photo Library/);
});

test("research prose and source data stay separate", () => {
  assert.match(
    prompt,
    /Do not put raw URLs, Markdown links, source lists, or Markdown bold markers in the response prose/,
  );
  assert.match(orchestrator, /normalizeClarityVisibleResponse/);
  assert.match(ui, /normalizeClarityVisibleResponse\(item\.content\)/);
  assert.match(ui, /researchSourcesFromMetadata/);
});
