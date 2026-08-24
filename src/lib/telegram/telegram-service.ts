import { ObjectId } from "mongodb";
import { collections, getDb } from "@/lib/db/client";
import { decrypt } from "@/lib/security/crypto";
import { RequestTypeService } from "@/lib/requests/request-type-service";
import type { OrderStatus, RequestField } from "@/types";

async function botToken(botId: string) {
  const db = await getDb();
  const bot = await db.collection(collections.bots).findOne({ _id: new ObjectId(botId) });
  if (!bot?.tokenEncrypted) throw new Error("BOT_NOT_FOUND");
  return decrypt(bot.tokenEncrypted);
}

async function telegramCall(token: string, method: string, body: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
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
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": multipart.contentType },
    body: new Uint8Array(multipart.body),
  });
  return res.json();
}

const STATUS_AR: Record<OrderStatus, string> = {
  PENDING: "قيد الانتظار",
  REVIEWING: "قيد المراجعة",
  COMPLETED: "منجزة",
  REJECTED: "مرفوضة",
  ARCHIVED: "مؤرشفة",
};

export class TelegramService {
  static webhookConfigured() {
    const base = (process.env.TELEGRAM_WEBHOOK_BASE_URL ?? "").trim();
    if (!base) return false;
    if (/example\.invalid/i.test(base)) return false;
    if (/localhost|127\.0\.0\.1/i.test(base)) return false;
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
          const photoRes = await fetch(`https://api.telegram.org/bot${token}/setMyProfilePhoto`, {
            method: "POST",
            body: form,
          }).then((r) => r.json());
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
      { command: "orders", description: "طلباتي" },
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
    return telegramCall(token, "sendMessage", { chat_id: chatId, text, ...extra });
  }

  static async sendExistingPhoto(botId: string, chatId: number, fileId: string, caption?: string) {
    const token = await botToken(botId);
    return telegramCall(token, "sendPhoto", {
      chat_id: chatId,
      photo: fileId,
      ...(caption ? { caption: caption.slice(0, 1024) } : {}),
    });
  }

  static async sendExistingDocument(botId: string, chatId: number, fileId: string, caption?: string) {
    const token = await botToken(botId);
    return telegramCall(token, "sendDocument", {
      chat_id: chatId,
      document: fileId,
      ...(caption ? { caption: caption.slice(0, 1024) } : {}),
    });
  }

  static async answerCallback(botId: string, callbackQueryId: string) {
    const token = await botToken(botId);
    return telegramCall(token, "answerCallbackQuery", { callback_query_id: callbackQueryId });
  }

  static async downloadFile(botId: string, fileId: string) {
    const token = await botToken(botId);
    const meta = await telegramCall(token, "getFile", { file_id: fileId });
    if (!meta.ok || !meta.result?.file_path) throw new Error("TELEGRAM_FILE");
    const filePath = String(meta.result.file_path);
    const res = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
    if (!res.ok) throw new Error("TELEGRAM_FILE");
    const buffer = Buffer.from(await res.arrayBuffer());
    const filename = filePath.split("/").pop() ?? "telegram-file.bin";
    return { buffer, filename, mimeType: mimeFromName(filename) };
  }

  static async sendDocument(botId: string, chatId: number, buffer: Buffer, filename: string, caption?: string) {
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
    const json = await telegramUpload(token, "sendDocument", fields, {
      fieldName: "document",
      filename: asciiFilename(filename, "file.bin"),
      contentType,
      buffer,
    });
    if (!json?.ok) throw new Error(String(json?.description ?? "SEND_DOCUMENT_FAILED"));
    return json;
  }

  static async sendPhoto(botId: string, chatId: number, buffer: Buffer, filename: string, caption?: string) {
    const token = await botToken(botId);
    const lower = filename.toLowerCase();
    const contentType = lower.endsWith(".png")
      ? "image/png"
      : lower.endsWith(".webp")
        ? "image/webp"
        : "image/jpeg";
    const fields: Record<string, string> = { chat_id: String(chatId) };
    if (caption) fields.caption = caption.slice(0, 1024);
    const json = await telegramUpload(token, "sendPhoto", fields, {
      fieldName: "photo",
      filename: asciiFilename(filename, contentType === "image/png" ? "photo.png" : "photo.jpg"),
      contentType,
      buffer,
    });
    if (!json?.ok) throw new Error(String(json?.description ?? "SEND_PHOTO_FAILED"));
    return json;
  }

  static async sendFieldPrompt(
    botId: string,
    chatId: number,
    prompt: string,
    field: { imageFileId?: string | null; attachmentFileId?: string | null },
    extra?: Record<string, unknown>,
  ) {
    const mediaId = field.imageFileId || field.attachmentFileId;
    if (!mediaId) {
      return this.sendMessage(botId, chatId, prompt, extra);
    }
    const { logJson } = await import("@/lib/log");
    try {
      const { GridFSStorageService } = await import("@/lib/storage/gridfs");
      const file = await GridFSStorageService.readBuffer(String(mediaId));
      if (!file?.buffer?.length) {
        logJson("warn", "telegram", "field_media_missing", { botId, mediaId: String(mediaId) });
        return this.sendMessage(botId, chatId, prompt, extra);
      }
      const isImage = String(file.mimeType || "").startsWith("image/");
      logJson("info", "telegram", "field_media_sending", {
        botId,
        mediaId: String(mediaId),
        bytes: file.buffer.length,
        mimeType: file.mimeType,
        as: isImage ? "photo" : "document",
      });
      if (isImage) {
        try {
          const sent = await this.sendPhoto(botId, chatId, file.buffer, file.filename, prompt);
          if (extra?.reply_markup) {
            await this.sendMessage(botId, chatId, "اختر من الأزرار:", extra);
          }
          return sent;
        } catch (photoErr) {
          logJson("warn", "telegram", "send_photo_failed_fallback_document", {
            botId,
            mediaId: String(mediaId),
            error: photoErr instanceof Error ? photoErr.message : String(photoErr),
          });
          const sent = await this.sendDocument(botId, chatId, file.buffer, file.filename, prompt);
          if (extra?.reply_markup) {
            await this.sendMessage(botId, chatId, "اختر من الأزرار:", extra);
          }
          return sent;
        }
      }
      const sent = await this.sendDocument(botId, chatId, file.buffer, file.filename, prompt);
      if (extra?.reply_markup) {
        await this.sendMessage(botId, chatId, "اختر من الأزرار:", extra);
      }
      return sent;
    } catch (err) {
      logJson("error", "telegram", "field_media_send_failed", {
        botId,
        mediaId: String(mediaId),
        error: err instanceof Error ? err.message : String(err),
      });
      console.error("field_media_send_failed", err);
      return this.sendMessage(botId, chatId, prompt, extra);
    }
  }

  static async notifyUserStatus(
    order: Record<string, unknown>,
    status: OrderStatus,
    message?: string,
    attachmentFileId?: string,
  ) {
    const text = [
      "تحديث على طلبك",
      `#${order.orderNumber}`,
      `الحالة: ${STATUS_AR[status]}`,
      message ? `\n${message}` : "",
    ]
      .filter(Boolean)
      .join("\n");
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
      "🆕 طلب جديد",
      `#${params.orderNumber}`,
      `الخدمة:\n${request.name}`,
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
      "🔄 تحديث طلب",
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
