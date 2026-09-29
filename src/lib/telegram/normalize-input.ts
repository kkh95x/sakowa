export type TelegramContentType =
  | "text"
  | "voice"
  | "audio"
  | "video"
  | "video_note"
  | "photo"
  | "document"
  | "animation"
  | "sticker"
  | "location"
  | "contact"
  | "unknown";

export type TelegramFileKind =
  | "photo"
  | "document"
  | "voice"
  | "audio"
  | "video"
  | "video_note"
  | "animation"
  | "sticker";

export type TelegramFileRef = {
  file_id: string;
  file_unique_id?: string;
  file_size?: number;
  file_name?: string;
  mime_type?: string;
  duration?: number;
  width?: number;
  height?: number;
  title?: string;
};

export type TelegramMessageLike = {
  text?: string;
  caption?: string;
  photo?: { file_id: string; file_unique_id?: string; width?: number; height?: number; file_size?: number }[];
  document?: TelegramFileRef;
  voice?: TelegramFileRef;
  audio?: TelegramFileRef;
  video?: TelegramFileRef;
  video_note?: TelegramFileRef;
  animation?: TelegramFileRef;
  sticker?: { file_id: string; emoji?: string; file_unique_id?: string };
  location?: { latitude: number; longitude: number };
  contact?: {
    phone_number: string;
    first_name: string;
    last_name?: string;
    user_id?: number;
  };
};

export type NormalizedUserInput = {
  contentType: TelegramContentType;
  text: string | null;
  telegramFileId: string | null;
  filename: string | null;
  mimeType: string | null;
  kind: TelegramFileKind | null;
  metadata: Record<string, unknown>;
};

export type VoiceTranscript = {
  status: "pending" | "ready" | "failed";
  text: string | null;
};

export type DynamicFieldAnswer = {
  inputType: "dynamic";
  contentType: TelegramContentType;
  text: string | null;
  fileId: string | null;
  storageId: string | null;
  filename: string | null;
  mimeType: string | null;
  metadata: Record<string, unknown>;
  /** Arabic transcript of a voice answer. Filled in the background after the reply is sent. */
  transcript?: VoiceTranscript;
};

const CONTENT_LABELS: Record<TelegramContentType, string> = {
  text: "نص",
  voice: "🎤 رسالة صوتية",
  audio: "🎵 مقطع صوتي",
  video: "🎬 فيديو",
  video_note: "⭕ رسالة فيديو",
  photo: "📷 صورة",
  document: "📎 ملف",
  animation: "🎞️ صورة متحركة",
  sticker: "ستيكر",
  location: "📍 موقع",
  contact: "👤 جهة اتصال",
  unknown: "محتوى",
};

export function telegramContentLabel(type: TelegramContentType | string | undefined) {
  return CONTENT_LABELS[(type as TelegramContentType) ?? "unknown"] ?? CONTENT_LABELS.unknown;
}

function fileMeta(file?: TelegramFileRef | null, extra?: Record<string, unknown>) {
  if (!file) return extra ?? {};
  return {
    fileUniqueId: file.file_unique_id ?? null,
    fileSize: file.file_size ?? null,
    duration: file.duration ?? null,
    width: file.width ?? null,
    height: file.height ?? null,
    title: file.title ?? null,
    ...extra,
  };
}

export function normalizeTelegramMessage(msg?: TelegramMessageLike | null): NormalizedUserInput | null {
  if (!msg) return null;
  const caption = msg.caption?.trim() || null;
  const text = msg.text?.trim() || caption;

  if (msg.voice?.file_id) {
    return {
      contentType: "voice",
      text: caption,
      telegramFileId: msg.voice.file_id,
      filename: "voice.ogg",
      mimeType: msg.voice.mime_type ?? "audio/ogg",
      kind: "voice",
      metadata: fileMeta(msg.voice),
    };
  }
  if (msg.video_note?.file_id) {
    return {
      contentType: "video_note",
      text: caption,
      telegramFileId: msg.video_note.file_id,
      filename: "video_note.mp4",
      mimeType: msg.video_note.mime_type ?? "video/mp4",
      kind: "video_note",
      metadata: fileMeta(msg.video_note),
    };
  }
  if (msg.video?.file_id) {
    return {
      contentType: "video",
      text: caption,
      telegramFileId: msg.video.file_id,
      filename: msg.video.file_name ?? "video.mp4",
      mimeType: msg.video.mime_type ?? "video/mp4",
      kind: "video",
      metadata: fileMeta(msg.video),
    };
  }
  if (msg.audio?.file_id) {
    return {
      contentType: "audio",
      text: caption,
      telegramFileId: msg.audio.file_id,
      filename: msg.audio.file_name ?? "audio.mp3",
      mimeType: msg.audio.mime_type ?? "audio/mpeg",
      kind: "audio",
      metadata: fileMeta(msg.audio),
    };
  }
  if (msg.animation?.file_id) {
    return {
      contentType: "animation",
      text: caption,
      telegramFileId: msg.animation.file_id,
      filename: msg.animation.file_name ?? "animation.mp4",
      mimeType: msg.animation.mime_type ?? "video/mp4",
      kind: "animation",
      metadata: fileMeta(msg.animation),
    };
  }
  if (msg.photo?.length) {
    const photo = msg.photo[msg.photo.length - 1];
    return {
      contentType: "photo",
      text: caption,
      telegramFileId: photo.file_id,
      filename: "photo.jpg",
      mimeType: "image/jpeg",
      kind: "photo",
      metadata: {
        width: photo.width ?? null,
        height: photo.height ?? null,
        fileSize: photo.file_size ?? null,
        fileUniqueId: photo.file_unique_id ?? null,
      },
    };
  }
  if (msg.document?.file_id) {
    return {
      contentType: "document",
      text: caption,
      telegramFileId: msg.document.file_id,
      filename: msg.document.file_name ?? "document.bin",
      mimeType: msg.document.mime_type ?? null,
      kind: "document",
      metadata: fileMeta(msg.document),
    };
  }
  if (msg.sticker?.file_id) {
    return {
      contentType: "sticker",
      text: msg.sticker.emoji ?? caption,
      telegramFileId: msg.sticker.file_id,
      filename: "sticker.webp",
      mimeType: "image/webp",
      kind: "sticker",
      metadata: { emoji: msg.sticker.emoji ?? null, fileUniqueId: msg.sticker.file_unique_id ?? null },
    };
  }
  if (msg.location) {
    return {
      contentType: "location",
      text: `${msg.location.latitude}, ${msg.location.longitude}`,
      telegramFileId: null,
      filename: null,
      mimeType: null,
      kind: null,
      metadata: { latitude: msg.location.latitude, longitude: msg.location.longitude },
    };
  }
  if (msg.contact) {
    const name = [msg.contact.first_name, msg.contact.last_name].filter(Boolean).join(" ");
    return {
      contentType: "contact",
      text: `${name} ${msg.contact.phone_number}`.trim(),
      telegramFileId: null,
      filename: null,
      mimeType: null,
      kind: null,
      metadata: {
        phoneNumber: msg.contact.phone_number,
        firstName: msg.contact.first_name,
        lastName: msg.contact.last_name ?? null,
        userId: msg.contact.user_id ?? null,
      },
    };
  }
  if (text) {
    return {
      contentType: "text",
      text,
      telegramFileId: null,
      filename: null,
      mimeType: null,
      kind: null,
      metadata: {},
    };
  }
  return {
    contentType: "unknown",
    text: null,
    telegramFileId: null,
    filename: null,
    mimeType: null,
    kind: null,
    metadata: {},
  };
}

export function toDynamicAnswer(
  input: NormalizedUserInput,
  extra?: { storageId?: string | null },
): DynamicFieldAnswer {
  return {
    inputType: "dynamic",
    contentType: input.contentType,
    text: input.text,
    fileId: input.telegramFileId,
    storageId: extra?.storageId ?? null,
    filename: input.filename,
    mimeType: input.mimeType,
    metadata: input.metadata,
  };
}

export function isDynamicAnswer(value: unknown): value is DynamicFieldAnswer {
  return Boolean(
    value &&
      typeof value === "object" &&
      ((value as DynamicFieldAnswer).inputType === "dynamic" ||
        (value as DynamicFieldAnswer).contentType),
  );
}

export function dynamicAnswerHasContent(value: unknown) {
  if (!isDynamicAnswer(value)) return false;
  if (value.text && value.text.trim()) return true;
  if (value.fileId || value.storageId) return true;
  if (value.contentType === "location" || value.contentType === "contact") return true;
  return false;
}

export function inboundSummary(input: NormalizedUserInput) {
  if (input.contentType === "text") return input.text || "";
  if (input.contentType === "location") return `📍 ${input.text ?? "موقع"}`;
  if (input.contentType === "contact") return `👤 ${input.text ?? "جهة اتصال"}`;
  if (input.text) return `${telegramContentLabel(input.contentType)} — ${input.text}`;
  return telegramContentLabel(input.contentType);
}

export function openComplaintActivityNotice(orderNumber: string, input: NormalizedUserInput | null) {
  const hasFile = Boolean(input?.telegramFileId);
  return {
    type: hasFile ? ("NEW_COMPLAINT_ATTACHMENT" as const) : ("NEW_COMPLAINT_MESSAGE" as const),
    title: hasFile ? "مرفق جديد في شكوى" : "رسالة جديدة في شكوى",
    message: `${orderNumber}: ${input ? inboundSummary(input) : "رسالة"}`,
  };
}
