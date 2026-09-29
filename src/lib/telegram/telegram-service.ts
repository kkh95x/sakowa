import { ObjectId } from "mongodb";
import { collections, getDb } from "@/lib/db/client";
import { decrypt } from "@/lib/security/crypto";
import { RequestTypeService } from "@/lib/requests/request-type-service";
import { logJson } from "@/lib/log";
import { ChatLogService } from "@/lib/chat/chat-log-service";
import {
  isBlockedWebhookBase,
  normalizeTelegramFilePath,
  pinnedTelegramIp,
  telegramBotCall,
  telegramBotMethodUrl,
  telegramFetch,
  telegramFetchFile,
  telegramFileUrl,
} from "@/lib/telegram/api";
import type { OrderStatus, RequestField, TelegramPrompt, TelegramPromptBlock } from "@/types";
import { STATUS_AR } from "@/lib/orders/complaint-status";
import { statusUpdateTelegramText } from "@/lib/telegram/order-command";
import { resolveFieldPromptBlocks, withPromptHint } from "@/lib/telegram/field-prompt";
import {
  WELCOME_CHOOSE_TYPE,
  WELCOME_GREETING,
  WELCOME_NO_TYPES,
  hasWelcomePrompt,
  resolveWelcomeBlocks,
} from "@/lib/telegram/welcome-prompt";
import { TelegramMessageRenderer, type TelegramPromptSender } from "@/lib/telegram/message-renderer";
import { isWebm, webmOpusToOgg } from "@/lib/telegram/ogg-opus";

export type CaptionableMessage = {
  caption?: string;
  photo?: unknown[];
  document?: unknown;
  video?: unknown;
  audio?: unknown;
  voice?: unknown;
  animation?: unknown;
};

/** Media messages carry a caption, so they must be edited with editMessageCaption, not editMessageText. */
export function isCaptionMessage(message: CaptionableMessage) {
  return Boolean(
    message.photo?.length || message.document || message.video || message.audio || message.voice || message.animation,
  );
}

async function botToken(botId: string) {
  const db = await getDb();
  const bot = await db.collection(collections.bots).findOne({ _id: new ObjectId(botId) });
  if (!bot?.tokenEncrypted) throw new Error("BOT_NOT_FOUND");
  return decrypt(bot.tokenEncrypted);
}

type TelegramResponse = {
  ok?: boolean;
  description?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result?: any;
};

async function telegramCall(token: string, method: string, body: Record<string, unknown>) {
  return telegramBotCall<TelegramResponse>(token, method, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function telegramMessageId(result: TelegramResponse | null | undefined) {
  const id = result?.result?.message_id;
  return typeof id === "number" && Number.isFinite(id) ? id : null;
}

import { resolveUploadMime } from "@/lib/storage/mime";

function mimeFromName(name: string) {
  return resolveUploadMime(name, null);
}

function asciiFilename(name: string, fallback: string) {
  const base = (name || fallback).split(/[/\\]/).pop() || fallback;
  const extMatch = fallback.match(/\.[a-z0-9]+$/i);
  const fallbackExt = extMatch?.[0] ?? "";
  const safe = base
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^\.+/, "")
    .replace(/^\_+|\_+$/g, "");
  if (!safe || safe === ".") return fallback;
  if (fallbackExt && !/\.[a-z0-9]+$/i.test(safe)) return `${safe}${fallbackExt}`;
  return safe;
}

function buildTelegramMultipart(
  fields: Record<string, string>,
  file: { fieldName: string; filename: string; contentType: string; buffer: Buffer },
) {
  const boundary = `----BothubBoundary${Date.now().toString(16)}`;
  const chunks: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
        "utf8",
      ),
    );
  }
  chunks.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldName}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
      "utf8",
    ),
  );
  chunks.push(file.buffer);
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"));
  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

async function telegramUpload(
  token: string,
  method: string,
  fields: Record<string, string>,
  file: { fieldName: string; filename: string; contentType: string; buffer: Buffer },
) {
  const multipart = buildTelegramMultipart(fields, file);
  const res = await telegramFetch(telegramBotMethodUrl(token, method), {
    method: "POST",
    headers: { "Content-Type": multipart.contentType },
    body: new Uint8Array(multipart.body),
  });
  return res.json();
}

export class TelegramService {
  static webhookConfigured() {
    const base = (process.env.TELEGRAM_WEBHOOK_BASE_URL ?? "").trim();
    if (isBlockedWebhookBase(base)) return false;
    try {
      return new URL(base).protocol === "https:";
    } catch {
      return false;
    }
  }

  static async setWebhook(botId: string) {
    const token = await botToken(botId);
    const db = await getDb();
    const bot = await db.collection(collections.bots).findOne({ _id: new ObjectId(botId) });
    const base = process.env.TELEGRAM_WEBHOOK_BASE_URL;
    if (!base || !this.webhookConfigured()) throw new Error("TELEGRAM_WEBHOOK_BASE_URL missing");
    const url = `${base.replace(/\/$/, "")}/api/telegram/webhook/${botId}`;
    return telegramCall(token, "setWebhook", {
      url,
      secret_token: bot?.webhookSecret,
      allowed_updates: ["message", "callback_query"],
    });
  }

  static async deleteWebhook(botId: string) {
    const token = await botToken(botId);
    return telegramCall(token, "deleteWebhook", { drop_pending_updates: false });
  }

  static async getUpdates(botId: string, offset = 0, timeout = 25) {
    const token = await botToken(botId);
    return telegramCall(token, "getUpdates", {
      offset,
      timeout,
      allowed_updates: ["message", "callback_query"],
    });
  }

  static async connectBot(botId: string) {
    const { shouldUsePolling, startBotPolling, stopBotPolling } = await import("@/lib/telegram/polling");
    if (shouldUsePolling()) {
      stopBotPolling(botId);
      await this.deleteWebhook(botId);
      startBotPolling(botId);
      try {
        await this.syncBotCommands(botId);
      } catch {
        /* optional */
      }
      return { mode: "polling" as const };
    }
    await this.setWebhook(botId);
    try {
      await this.syncBotCommands(botId);
    } catch {
      /* optional */
    }
    return { mode: "webhook" as const };
  }

  static async reconnectRunningBots() {
    const db = await getDb();
    const bots = await db.collection(collections.bots).find({ status: "RUNNING" }).toArray();
    const results: { botId: string; ok: boolean; mode?: string; error?: string }[] = [];
    for (const bot of bots) {
      const botId = String(bot._id);
      try {
        const connected = await this.connectBot(botId);
        results.push({ botId, ok: true, mode: connected.mode });
      } catch (err) {
        results.push({
          botId,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return results;
  }

  static async syncBotProfile(botId: string) {
    const db = await getDb();
    const bot = await db.collection(collections.bots).findOne({ _id: new ObjectId(botId) });
    if (!bot?.tokenEncrypted) throw new Error("BOT_NOT_FOUND");
    const token = decrypt(bot.tokenEncrypted);
    const name = String(bot.name ?? "").trim().slice(0, 64);
    const details = String(bot.details ?? "").trim();
    const description = details.slice(0, 512);
    const shortDescription = details.slice(0, 120);

    const nameRes = await telegramCall(token, "setMyName", { name });
    if (!nameRes?.ok) {
      throw new Error(String(nameRes?.description ?? "SET_NAME_FAILED"));
    }

    const descRes = await telegramCall(token, "setMyDescription", { description });
    if (!descRes?.ok) {
      throw new Error(String(descRes?.description ?? "SET_DESCRIPTION_FAILED"));
    }

    const shortRes = await telegramCall(token, "setMyShortDescription", {
      short_description: shortDescription,
    });
    if (!shortRes?.ok) {
      throw new Error(String(shortRes?.description ?? "SET_SHORT_DESCRIPTION_FAILED"));
    }

    let photoSynced = false;
    let photoSkipped = false;
    let photoError: string | null = null;
    if (bot.logoFileId) {
      try {
        const { GridFSStorageService } = await import("@/lib/storage/gridfs");
        const file = await GridFSStorageService.readBuffer(String(bot.logoFileId));
        if (!file) {
          photoSkipped = true;
          photoError = "LOGO_NOT_FOUND";
        } else {
          const form = new FormData();
          form.set("photo", JSON.stringify({ type: "static", photo: "attach://logo" }));
          const mime = file.mimeType.includes("jpeg") || file.mimeType.includes("jpg")
            ? "image/jpeg"
            : file.mimeType === "image/png"
              ? "image/png"
              : "image/jpeg";
          const filename = mime === "image/png" ? "logo.png" : "logo.jpg";
          form.set("logo", new Blob([new Uint8Array(file.buffer)], { type: mime }), filename);
          const photoRes = await telegramBotCall<{
            ok?: boolean;
            description?: string;
          }>(token, "setMyProfilePhoto", {
            method: "POST",
            body: form,
          });
          if (!photoRes?.ok) {
            photoError = String(photoRes?.description ?? "SET_PHOTO_FAILED");
          } else {
            photoSynced = true;
          }
        }
      } catch (err) {
        photoError = err instanceof Error ? err.message : String(err);
      }
    } else {
      photoSkipped = true;
    }

    try {
      await this.syncBotCommands(botId);
    } catch {
      /* optional */
    }

    return {
      name: true,
      description: true,
      shortDescription: true,
      photoSynced,
      photoSkipped,
      photoError,
    };
  }

  static serviceCommand(requestTypeId: string) {
    return `s_${requestTypeId}`;
  }

  static async syncBotCommands(botId: string) {
    const token = await botToken(botId);
    const db = await getDb();
    const types = await db
      .collection(collections.requestTypes)
      .find({ botId, active: true, archivedAt: null })
      .sort({ name: 1 })
      .toArray();
    const commands = [
      { command: "start", description: "القائمة الرئيسية" },
      { command: "orders", description: "شكاواي" },
      { command: "cancel", description: "إلغاء العملية الحالية" },
      ...types.slice(0, 90).map((t) => ({
        command: this.serviceCommand(String(t._id)),
        description: String(t.name).slice(0, 256) || "خدمة",
      })),
    ];
    return telegramCall(token, "setMyCommands", { commands });
  }

  static async sendMessage(botId: string, chatId: number, text: string, extra?: Record<string, unknown>) {
    const token = await botToken(botId);
    const body = { ...(extra ?? {}) };
    const log = body.log !== false;
    delete body.log;
    const result = await telegramCall(token, "sendMessage", { chat_id: chatId, text, ...body });
    if (log) {
      void ChatLogService.captureOutbound({
        botId,
        chatId,
        kind: "text",
        text,
        telegramMessageId: telegramMessageId(result),
      });
    }
    return result;
  }

  static async revealInlineChoice(
    botId: string,
    chatId: number,
    message: CaptionableMessage & { message_id?: number; text?: string },
    choice: string,
  ): Promise<boolean> {
    const messageId = message.message_id;
    if (!messageId || !choice.trim()) return false;
    const hasMedia = isCaptionMessage(message);
    const previous = String((hasMedia ? message.caption : message.text) ?? "").trimEnd();
    const next = previous.includes(choice) ? previous : `${previous}\n\n${choice}`.trim();
    if (!next) return false;
    const token = await botToken(botId);
    let error: string;
    try {
      const result = hasMedia
        ? await telegramCall(token, "editMessageCaption", {
            chat_id: chatId,
            message_id: messageId,
            caption: next.slice(0, 1024),
            reply_markup: { inline_keyboard: [] },
          })
        : await telegramCall(token, "editMessageText", {
            chat_id: chatId,
            message_id: messageId,
            text: next,
            reply_markup: { inline_keyboard: [] },
          });
      if (result?.ok) return true;
      error = String(result?.description ?? "EDIT_FAILED");
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    logJson("warn", "telegram", "reveal_choice_edit_failed", { botId, messageId, hasMedia, error });
    await telegramCall(token, "editMessageReplyMarkup", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: [] },
    }).catch(() => null);
    return false;
  }

  static async editReplyMarkup(
    botId: string,
    chatId: number,
    messageId: number,
    extra?: Record<string, unknown>,
  ) {
    const token = await botToken(botId);
    return telegramCall(token, "editMessageReplyMarkup", {
      chat_id: chatId,
      message_id: messageId,
      ...extra,
    });
  }

  static async editOutgoingMessage(
    botId: string,
    chatId: number,
    messageId: number,
    kind: "text" | "photo" | "document" | "command",
    text: string,
  ) {
    const token = await botToken(botId);
    const isMedia = kind === "photo" || kind === "document";
    try {
      const result = isMedia
        ? await telegramCall(token, "editMessageCaption", {
            chat_id: chatId,
            message_id: messageId,
            caption: text.slice(0, 1024),
          })
        : await telegramCall(token, "editMessageText", {
            chat_id: chatId,
            message_id: messageId,
            text: text.slice(0, 4096) || "\u200b",
          });
      return Boolean(result?.ok);
    } catch {
      return false;
    }
  }

  static async deleteOutgoingMessage(botId: string, chatId: number, messageId: number) {
    const token = await botToken(botId);
    try {
      const result = await telegramCall(token, "deleteMessage", {
        chat_id: chatId,
        message_id: messageId,
      });
      return Boolean(result?.ok);
    } catch {
      return false;
    }
  }

  static async sendExistingPhoto(botId: string, chatId: number, fileId: string, caption?: string) {
    const token = await botToken(botId);
    const result = await telegramCall(token, "sendPhoto", {
      chat_id: chatId,
      photo: fileId,
      ...(caption ? { caption: caption.slice(0, 1024) } : {}),
    });
    void ChatLogService.captureOutbound({
      botId,
      chatId,
      kind: "photo",
      text: caption ?? null,
      telegramFileId: fileId,
      telegramMessageId: telegramMessageId(result),
    });
    return result;
  }

  static async sendExistingDocument(botId: string, chatId: number, fileId: string, caption?: string) {
    const token = await botToken(botId);
    const result = await telegramCall(token, "sendDocument", {
      chat_id: chatId,
      document: fileId,
      ...(caption ? { caption: caption.slice(0, 1024) } : {}),
    });
    void ChatLogService.captureOutbound({
      botId,
      chatId,
      kind: "document",
      text: caption ?? null,
      telegramFileId: fileId,
      telegramMessageId: telegramMessageId(result),
    });
    return result;
  }

  static async answerCallback(botId: string, callbackQueryId: string) {
    const token = await botToken(botId);
    return telegramCall(token, "answerCallbackQuery", { callback_query_id: callbackQueryId });
  }

  static async downloadFile(botId: string, fileId: string) {
    let host = "unknown";
    try {
      const token = await botToken(botId);
      const meta = await telegramCall(token, "getFile", { file_id: fileId });
      if (!meta.ok || !meta.result?.file_path) {
        throw new Error(`TELEGRAM_FILE: getFile ${String(meta?.description ?? "no file_path")}`);
      }
      const filePath = String(meta.result.file_path);
      const filename = filePath.split(/[/\\]/).pop() ?? "telegram-file.bin";
      const relativePath = normalizeTelegramFilePath(filePath);

      logJson("info", "telegram", "file_get_ok", {
        botId,
        filePath: relativePath,
        fileSize: meta.result.file_size ?? null,
      });

      if (filePath.startsWith("/") || /^[A-Za-z]:[\\/]/.test(filePath)) {
        try {
          const { readFile } = await import("node:fs/promises");
          const buffer = await readFile(filePath);
          if (buffer.length) {
            logJson("info", "telegram", "file_download_ok", {
              botId,
              via: "disk",
              bytes: buffer.length,
            });
            return { buffer, filename, mimeType: mimeFromName(filename) };
          }
        } catch (err) {
          logJson("warn", "telegram", "file_disk_read_failed", {
            botId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      const url = /^https?:\/\//i.test(filePath) ? filePath : telegramFileUrl(token, filePath);
      try {
        host = new URL(url).hostname;
      } catch {
        /* ignore */
      }
      logJson("info", "telegram", "file_download_start", {
        botId,
        host,
        pinnedIp: pinnedTelegramIp(host) ?? null,
      });
      const res = await telegramFetchFile(url);
      if (!res.ok) throw new Error(`TELEGRAM_FILE: download HTTP ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      if (!buffer.length) throw new Error("TELEGRAM_FILE: empty download");
      logJson("info", "telegram", "file_download_ok", {
        botId,
        via: "http",
        host,
        bytes: buffer.length,
      });
      return { buffer, filename, mimeType: mimeFromName(filename) };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logJson("error", "telegram", "file_download_failed", {
        botId,
        host,
        error: message,
      });
      console.error("TELEGRAM_FILE_DOWNLOAD_FAILED", { botId, host, error: message });
      console.error(err);
      throw err instanceof Error ? err : new Error(message);
    }
  }

  static async sendDocument(
    botId: string,
    chatId: number,
    buffer: Buffer,
    filename: string,
    caption?: string,
    extra?: Record<string, unknown>,
  ) {
    const token = await botToken(botId);
    const lower = filename.toLowerCase();
    const contentType = lower.endsWith(".pdf")
      ? "application/pdf"
      : lower.endsWith(".png")
        ? "image/png"
        : lower.endsWith(".webp")
          ? "image/webp"
          : lower.endsWith(".jpg") || lower.endsWith(".jpeg")
            ? "image/jpeg"
            : lower.endsWith(".xlsx")
              ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              : lower.endsWith(".xls")
                ? "application/vnd.ms-excel"
                : lower.endsWith(".docx")
                  ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  : lower.endsWith(".doc")
                    ? "application/msword"
                    : lower.endsWith(".zip")
                      ? "application/zip"
                      : "application/octet-stream";
    const fields: Record<string, string> = { chat_id: String(chatId) };
    if (caption) fields.caption = caption.slice(0, 1024);
    if (extra?.reply_markup) fields.reply_markup = JSON.stringify(extra.reply_markup);
    const json = await telegramUpload(token, "sendDocument", fields, {
      fieldName: "document",
      filename: asciiFilename(filename, "file.bin"),
      contentType,
      buffer,
    });
    if (!json?.ok) throw new Error(String(json?.description ?? "SEND_DOCUMENT_FAILED"));
    void ChatLogService.captureOutbound({
      botId,
      chatId,
      kind: "document",
      text: caption ?? null,
      filename,
      mimeType: contentType,
      telegramFileId: json.result?.document?.file_id ? String(json.result.document.file_id) : null,
      telegramMessageId: telegramMessageId(json),
    });
    return json;
  }

  static async sendPhoto(
    botId: string,
    chatId: number,
    buffer: Buffer,
    filename: string,
    caption?: string,
    extra?: Record<string, unknown>,
  ) {
    const token = await botToken(botId);
    const lower = filename.toLowerCase();
    const contentType = lower.endsWith(".png")
      ? "image/png"
      : lower.endsWith(".webp")
        ? "image/webp"
        : "image/jpeg";
    const fields: Record<string, string> = { chat_id: String(chatId) };
    if (caption) fields.caption = caption.slice(0, 1024);
    if (extra?.reply_markup) fields.reply_markup = JSON.stringify(extra.reply_markup);
    const json = await telegramUpload(token, "sendPhoto", fields, {
      fieldName: "photo",
      filename: asciiFilename(filename, contentType === "image/png" ? "photo.png" : "photo.jpg"),
      contentType,
      buffer,
    });
    if (!json?.ok) throw new Error(String(json?.description ?? "SEND_PHOTO_FAILED"));
    const photoId = Array.isArray(json.result?.photo)
      ? json.result.photo.at(-1)?.file_id
      : json.result?.photo?.file_id;
    void ChatLogService.captureOutbound({
      botId,
      chatId,
      kind: "photo",
      text: caption ?? null,
      filename,
      mimeType: contentType,
      telegramFileId: photoId ? String(photoId) : null,
      telegramMessageId: telegramMessageId(json),
    });
    return json;
  }

  static async sendAudio(
    botId: string,
    chatId: number,
    buffer: Buffer,
    filename: string,
    extra?: Record<string, unknown>,
  ) {
    const token = await botToken(botId);
    let payload = buffer;
    let name = filename;
    if (filename.toLowerCase().endsWith(".webm") || isWebm(buffer)) {
      const ogg = webmOpusToOgg(buffer);
      if (!ogg) throw new Error("WEBM_OPUS_CONVERT_FAILED");
      payload = ogg;
      name = "voice.ogg";
    }
    const lower = name.toLowerCase();
    const voice = lower.endsWith(".ogg") || lower.endsWith(".oga");
    const contentType = voice
      ? "audio/ogg"
      : lower.endsWith(".mp3")
        ? "audio/mpeg"
        : lower.endsWith(".wav")
          ? "audio/wav"
          : "audio/mp4";
    const fields: Record<string, string> = { chat_id: String(chatId) };
    const caption = typeof extra?.caption === "string" ? extra.caption.trim() : "";
    if (caption) fields.caption = caption.slice(0, 1024);
    if (extra?.reply_markup) fields.reply_markup = JSON.stringify(extra.reply_markup);
    const json = await telegramUpload(token, voice ? "sendVoice" : "sendAudio", fields, {
      fieldName: voice ? "voice" : "audio",
      filename: asciiFilename(name, voice ? "voice.ogg" : "audio.mp3"),
      contentType,
      buffer: payload,
    });
    if (!json?.ok) throw new Error(String(json?.description ?? "SEND_AUDIO_FAILED"));
    const media = voice ? json.result?.voice : json.result?.audio;
    void ChatLogService.captureOutbound({
      botId,
      chatId,
      kind: "document",
      text: caption || null,
      filename: name,
      mimeType: contentType,
      telegramFileId: media?.file_id ? String(media.file_id) : null,
      telegramMessageId: telegramMessageId(json),
    });
    return json;
  }

  static async syncUserProfilePhoto(botId: string, telegramUserId: number): Promise<string | null> {
    const db = await getDb();
    const existing = await db.collection(collections.telegramUsers).findOne({ telegramUserId });
    const syncedAt = existing?.photoSyncedAt ? new Date(String(existing.photoSyncedAt)).getTime() : 0;
    if (existing?.photoFileId && Date.now() - syncedAt < 12 * 60 * 60 * 1000) {
      return String(existing.photoFileId);
    }
    try {
      const token = await botToken(botId);
      const meta = await telegramCall(token, "getUserProfilePhotos", {
        user_id: telegramUserId,
        limit: 1,
      });
      const sizes = meta.result?.photos?.[0] as { file_id?: string }[] | undefined;
      const fileId = sizes?.at(-1)?.file_id;
      if (!fileId) {
        await db.collection(collections.telegramUsers).updateOne(
          { telegramUserId },
          { $set: { photoSyncedAt: new Date() }, $setOnInsert: { telegramUserId, firstSeenAt: new Date() } },
          { upsert: true },
        );
        return existing?.photoFileId ? String(existing.photoFileId) : null;
      }
      const downloaded = await this.downloadFile(botId, fileId);
      const { GridFSStorageService } = await import("@/lib/storage/gridfs");
      const gridFsId = await GridFSStorageService.save({
        buffer: downloaded.buffer,
        filename: downloaded.filename || "avatar.jpg",
        mimeType: downloaded.mimeType || "image/jpeg",
        ownerType: "telegram_user",
        ownerId: String(telegramUserId),
        uploadedBy: "telegram",
        purpose: "USER_AVATAR",
      });
      await db.collection(collections.telegramUsers).updateOne(
        { telegramUserId },
        {
          $set: { photoFileId: gridFsId, photoSyncedAt: new Date() },
          $setOnInsert: { telegramUserId, firstSeenAt: new Date() },
        },
        { upsert: true },
      );
      return gridFsId;
    } catch (err) {
      logJson("warn", "telegram", "user_photo_sync_failed", {
        botId,
        telegramUserId,
        error: err instanceof Error ? err.message : String(err),
      });
      return existing?.photoFileId ? String(existing.photoFileId) : null;
    }
  }

  /**
   * Sends one composed Telegram message (text/image/document blocks, in order).
   * Shared by field questions and the bot welcome message; `extra` (inline keyboard)
   * is attached to the last block by the renderer.
   */
  static async sendPromptBlocks(
    botId: string,
    chatId: number,
    blocks: TelegramPromptBlock[],
    options: { fallbackText: string; extra?: Record<string, unknown>; event: string; logData?: Record<string, unknown> },
  ) {
    const steps = TelegramMessageRenderer.plan(blocks);
    const { GridFSStorageService } = await import("@/lib/storage/gridfs");
    const readFile = async (storageId: string) => {
      const file = await GridFSStorageService.readBuffer(storageId);
      if (!file?.buffer?.length) throw new Error("PROMPT_MEDIA_MISSING");
      return file;
    };
    const sender: TelegramPromptSender = {
      sendText: async (text, extra) => {
        const result = await this.sendMessage(botId, chatId, text, extra);
        if (!result?.ok) throw new Error(String(result?.description ?? "SEND_MESSAGE_FAILED"));
        return result;
      },
      sendPhoto: async (storageId, fileName, extra) => {
        const file = await readFile(storageId);
        return this.sendPhoto(botId, chatId, file.buffer, fileName || file.filename, undefined, extra);
      },
      sendDocument: async (storageId, fileName, extra) => {
        const file = await readFile(storageId);
        return this.sendDocument(botId, chatId, file.buffer, fileName || file.filename, undefined, extra);
      },
      sendAudio: async (storageId, fileName, extra) => {
        const file = await readFile(storageId);
        return this.sendAudio(botId, chatId, file.buffer, fileName || file.filename, extra);
      },
      log: (level, event, data) => logJson(level, "telegram", event, { botId, chatId, ...data }),
    };
    const result = await TelegramMessageRenderer.send(steps, sender, {
      fallbackText: options.fallbackText,
      extra: options.extra,
    });
    logJson(result.status === "complete" ? "info" : "error", "telegram", options.event, {
      botId,
      chatId,
      ...options.logData,
      status: result.status,
      blocks: steps.map((s) => s.kind),
      failed: result.failed,
      degraded: result.degraded,
      buttonsResent: result.buttonsResent,
    });
    return result;
  }

  /** Sends a field's question message (text/image/document blocks, in order). */
  static async sendFieldPrompt(
    botId: string,
    chatId: number,
    field: Pick<RequestField, "label" | "telegramMessage" | "telegramPrompt" | "imageFileId" | "attachmentFileId">,
    options: { hint?: string; extra?: Record<string, unknown> } = {},
  ) {
    return this.sendPromptBlocks(
      botId,
      chatId,
      withPromptHint(resolveFieldPromptBlocks(field), options.hint),
      {
        fallbackText: [field.label, options.hint].filter(Boolean).join("\n\n") || "—",
        extra: options.extra,
        event: "FIELD_PROMPT_SENT",
        logData: { field: field.label },
      },
    );
  }

  /**
   * Sends the bot's /start screen: the welcome composition first, then a separate
   * message with the complaint-type keyboard.
   */
  static async sendWelcome(
    botId: string,
    chatId: number,
    params: { bot?: { welcomePrompt?: TelegramPrompt | null } | null; hasActiveTypes: boolean; extra?: Record<string, unknown> },
  ) {
    const result = await this.sendPromptBlocks(botId, chatId, resolveWelcomeBlocks(params.bot), {
      fallbackText: WELCOME_GREETING,
      event: "WELCOME_PROMPT_SENT",
      logData: { custom: hasWelcomePrompt(params.bot), hasActiveTypes: params.hasActiveTypes },
    });
    if (params.extra) {
      const menu = params.hasActiveTypes ? WELCOME_CHOOSE_TYPE : WELCOME_NO_TYPES;
      await this.sendMessage(botId, chatId, menu, params.extra);
    }
    return result;
  }

  static async notifyUserStatus(
    order: Record<string, unknown>,
    status: OrderStatus,
    message?: string,
    attachmentFileId?: string,
    reason?: string,
  ) {
    const text = statusUpdateTelegramText({ orderNumber: order.orderNumber, status, message, reason });
    const botId = String(order.botId);
    const chatId = Number(order.chatId);
    if (attachmentFileId) {
      const { GridFSStorageService } = await import("@/lib/storage/gridfs");
      const file = await GridFSStorageService.readBuffer(String(attachmentFileId));
      if (file) {
        if (file.mimeType.startsWith("image/")) {
          await this.sendPhoto(botId, chatId, file.buffer, file.filename, text);
        } else {
          await this.sendDocument(botId, chatId, file.buffer, file.filename, text);
        }
        return;
      }
    }
    await this.sendMessage(botId, chatId, text);
  }

  static async notifyGroupNewOrder(
    requestTypeId: string,
    params: {
      orderNumber: string;
      telegramUsername?: string;
      telegramUserId: number;
      fields: Record<string, unknown>;
    },
  ) {
    const request = await RequestTypeService.get(requestTypeId);
    if (!request?.telegramGroupId) return;
    const db = await getDb();
    const safeFields = Object.entries(params.fields)
      .map(([k, v]) => {
        if (v && typeof v === "object") {
          const meta = v as { kind?: string; telegramFileId?: string };
          if (meta.telegramFileId || meta.kind) {
            return `${k}: ${meta.kind === "photo" ? "📷 صورة" : "📎 ملف"}`;
          }
        }
        return `${k}: ${String(v)}`;
      })
      .join("\n");
    const group = await db.collection(collections.telegramGroups).findOne({
      _id: new ObjectId(String(request.telegramGroupId)),
    });
    if (!group) return;
    const text = [
      "🆕 شكوى جديدة",
      `#${params.orderNumber}`,
      `نوع الشكوى:\n${request.name}`,
      `المستخدم:\n${params.telegramUsername ? `@${params.telegramUsername}` : "غير متوفر"}`,
      `Telegram ID:\n${params.telegramUserId}`,
      "الحالة:\nقيد الانتظار",
      safeFields,
    ].join("\n\n");
    const extra =
      typeof group.messageThreadId === "number"
        ? { message_thread_id: group.messageThreadId }
        : undefined;
    await this.sendMessage(String(request.botId), Number(group.chatId), text, extra);
  }

  static async notifyGroupStatus(
    order: Record<string, unknown>,
    from: OrderStatus,
    to: OrderStatus,
    actorId: string,
  ) {
    const request = await RequestTypeService.get(String(order.requestTypeId));
    if (!request?.telegramGroupId) return;
    const db = await getDb();
    const group = await db.collection(collections.telegramGroups).findOne({
      _id: new ObjectId(String(request.telegramGroupId)),
    });
    const actor = await db.collection(collections.users).findOne({ _id: new ObjectId(actorId) });
    if (!group) return;
    const text = [
      "🔄 تحديث شكوى",
      `#${order.orderNumber}`,
      `من:\n${STATUS_AR[from]}`,
      `إلى:\n${STATUS_AR[to]}`,
      `تم بواسطة:\n${actor?.displayName ?? ""}`,
    ].join("\n\n");
    const extra =
      typeof group.messageThreadId === "number"
        ? { message_thread_id: group.messageThreadId }
        : undefined;
    await this.sendMessage(String(order.botId), Number(group.chatId), text, extra);
  }
}
