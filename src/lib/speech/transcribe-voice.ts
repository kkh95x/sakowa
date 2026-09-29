import path from "node:path";
import { collections, getDb } from "@/lib/db/client";
import { logJson } from "@/lib/log";
import { resampleMono } from "@/lib/speech/pcm";
import { GridFSStorageService } from "@/lib/storage/gridfs";
import type { VoiceTranscript } from "@/lib/telegram/normalize-input";
import { TelegramService } from "@/lib/telegram/telegram-service";

const WHISPER_MODEL = "Xenova/whisper-small";
const SAMPLE_RATE = 16_000;

export type VoiceTranscriptJob = {
  botId: string;
  telegramUserId: number;
  draftId: string;
  fieldId: string;
  fieldName: string;
  fileId: string;
};

type Transcriber = (
  audio: Float32Array,
  options?: { language?: string; task?: string; chunk_length_s?: number; stride_length_s?: number },
) => Promise<{ text?: string }>;

let transcriberPromise: Promise<Transcriber> | null = null;
const queue: VoiceTranscriptJob[] = [];
let pumping = false;

function isSafeKey(key: string) {
  return Boolean(key) && !key.includes(".") && !key.includes("$");
}

/** Loads Whisper once, off the Telegram reply path. */
async function getTranscriber(): Promise<Transcriber> {
  transcriberPromise ??= (async () => {
    const { pipeline, env } = await import("@huggingface/transformers");
    env.cacheDir = path.join(process.cwd(), ".cache", "transformers");
    env.allowLocalModels = false;
    const model = await pipeline("automatic-speech-recognition", WHISPER_MODEL);
    return model as Transcriber;
  })().catch((err) => {
    transcriberPromise = null;
    throw err;
  });
  return transcriberPromise;
}

async function decodeOgg(buffer: Buffer): Promise<Float32Array> {
  const { OggOpusDecoder } = await import("ogg-opus-decoder");
  const decoder = new OggOpusDecoder();
  await decoder.ready;
  try {
    const decoded = await decoder.decodeFile(new Uint8Array(buffer));
    if (!decoded.samplesDecoded || !decoded.channelData.length) {
      throw new Error("EMPTY_AUDIO");
    }
    return resampleMono(decoded.channelData, decoded.sampleRate, SAMPLE_RATE);
  } finally {
    decoder.free();
  }
}

async function readVoiceBuffer(job: VoiceTranscriptJob): Promise<Buffer> {
  const db = await getDb();
  const conv = await db.collection(collections.telegramConversations).findOne({
    botId: job.botId,
    telegramUserId: job.telegramUserId,
    draftId: job.draftId,
  });
  const draft = (conv?.draft ?? {}) as Record<string, { storageId?: string | null; gridFsId?: string | null }>;
  const stored = draft[job.fieldName] ?? draft[job.fieldId];
  const storageId = stored?.storageId || stored?.gridFsId;
  if (storageId) {
    const file = await GridFSStorageService.readBuffer(String(storageId));
    if (file?.buffer?.length) return file.buffer;
  }
  const downloaded = await TelegramService.downloadFile(job.botId, job.fileId);
  return downloaded.buffer;
}

async function transcribeBuffer(buffer: Buffer): Promise<string> {
  const pcm = await decodeOgg(buffer);
  if (pcm.length < SAMPLE_RATE / 10) throw new Error("AUDIO_TOO_SHORT");
  const transcriber = await getTranscriber();
  const result = await transcriber(pcm, {
    language: "arabic",
    task: "transcribe",
    chunk_length_s: 30,
    stride_length_s: 5,
  });
  return (result.text ?? "").replace(/\s+/g, " ").trim();
}

async function publishTranscript(job: VoiceTranscriptJob, transcript: VoiceTranscript) {
  const db = await getDb();
  const draftSet: Record<string, VoiceTranscript> = {};
  for (const key of [job.fieldId, job.fieldName]) {
    if (isSafeKey(key)) draftSet[`draft.${key}.transcript`] = transcript;
  }
  if (Object.keys(draftSet).length) {
    const fileMatch = [job.fieldName, job.fieldId]
      .filter(isSafeKey)
      .map((key) => ({ [`draft.${key}.fileId`]: job.fileId }));
    if (fileMatch.length) {
      await db.collection(collections.telegramConversations).updateOne(
        {
          botId: job.botId,
          telegramUserId: job.telegramUserId,
          draftId: job.draftId,
          $or: fileMatch,
        },
        { $set: { ...draftSet, updatedAt: new Date() } },
      );
    }
  }
  if (!isSafeKey(job.fieldName)) return { matchedCount: 0 };
  return db.collection(collections.orders).updateMany(
    {
      botId: job.botId,
      telegramUserId: job.telegramUserId,
      archivedAt: null,
      [`fields.${job.fieldName}.fileId`]: job.fileId,
    },
    {
      $set: {
        [`fields.${job.fieldName}.transcript`]: transcript,
        updatedAt: new Date(),
      },
    },
  );
}

/** The draft is updated immediately. Order retries stay off the transcription queue. */
function watchForSubmittedOrder(job: VoiceTranscriptJob, transcript: VoiceTranscript) {
  void (async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const result = await publishTranscript(job, transcript);
      if (result.matchedCount > 0) return;
    }
  })();
}

async function runJob(job: VoiceTranscriptJob) {
  try {
    const buffer = await readVoiceBuffer(job);
    const text = await transcribeBuffer(buffer);
    const transcript: VoiceTranscript = { status: text ? "ready" : "failed", text: text || null };
    await publishTranscript(job, transcript);
    watchForSubmittedOrder(job, transcript);
    logJson("info", "speech", "VOICE_TRANSCRIPT_READY", {
      botId: job.botId,
      field: job.fieldName,
      chars: text.length,
    });
  } catch (err) {
    const transcript: VoiceTranscript = { status: "failed", text: null };
    await publishTranscript(job, transcript).catch(() => undefined);
    watchForSubmittedOrder(job, transcript);
    logJson("error", "speech", "VOICE_TRANSCRIPT_FAILED", {
      botId: job.botId,
      field: job.fieldName,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function pump() {
  while (queue.length) {
    const job = queue.shift();
    if (job) await runJob(job);
  }
  pumping = false;
}

/**
 * Schedules Arabic transcription without waiting for it.
 * The Telegram reply continues immediately.
 */
export function enqueueVoiceTranscript(job: VoiceTranscriptJob) {
  queue.push(job);
  if (pumping) return;
  pumping = true;
  setImmediate(() => {
    void pump();
  });
}
