import { ObjectId } from "mongodb";
import { collections, getDb } from "@/lib/db/client";
import { BlockedUserService } from "@/lib/blocks/blocked-user-service";
import { OrderService } from "@/lib/orders/order-service";
import { TelegramService } from "@/lib/telegram/telegram-service";
import { GridFSStorageService } from "@/lib/storage/gridfs";
import { persistTelegramUpload } from "@/lib/orders/persist-order-files";
import { persistValue, validateFieldValue } from "@/lib/telegram/validate-field";
import { logJson } from "@/lib/log";
import { correlationId } from "@/lib/security/crypto";
import type { ConversationState, RequestField } from "@/types";

type From = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  language_code?: string;
  is_premium?: boolean;
};

type Update = {
  update_id: number;
  message?: {
    chat: { id: number; type: string; title?: string; is_forum?: boolean };
    from?: From;
    text?: string;
    message_thread_id?: number;
    photo?: { file_id: string }[];
    document?: { file_id: string; file_name?: string; mime_type?: string };
  };
  callback_query?: {
    id: string;
    data?: string;
    from: From;
    message?: { chat: { id: number } };
  };
};

function kb(rows: { text: string; callback_data: string }[][]) {
  return { reply_markup: { inline_keyboard: rows } };
}

function activeFields(fields: RequestField[]) {
  return [...fields].filter((f) => f.active !== false).sort((a, b) => a.order - b.order);
}

async function upsertUser(from: From) {
  const db = await getDb();
  const now = new Date();
  await db.collection(collections.telegramUsers).updateOne(
    { telegramUserId: from.id },
    {
      $set: {
        username: from.username ?? null,
        firstName: from.first_name ?? null,
        lastName: from.last_name ?? null,
        languageCode: from.language_code ?? null,
        isPremium: Boolean(from.is_premium),
        lastSeenAt: now,
      },
      $setOnInsert: { telegramUserId: from.id, firstSeenAt: now, phoneNumber: null },
    },
    { upsert: true },
  );
}

async function conv(botId: string, telegramUserId: number) {
  const db = await getDb();
  const existing = await db.collection(collections.telegramConversations).findOne({ botId, telegramUserId });
  if (existing) return existing;
  const doc = {
    botId,
    telegramUserId,
    state: "IDLE" as ConversationState,
    requestTypeId: null as string | null,
    fieldIndex: 0,
    draft: {} as Record<string, unknown>,
    attachments: [] as string[],
    updatedAt: new Date(),
    expiresAt: null,
  };
  await db.collection(collections.telegramConversations).insertOne(doc);
  return doc;
}

async function patch(botId: string, telegramUserId: number, data: Record<string, unknown>) {
  const db = await getDb();
  await conv(botId, telegramUserId);
  await db.collection(collections.telegramConversations).updateOne(
    { botId, telegramUserId },
    { $set: { ...data, updatedAt: new Date() } },
  );
}

async function recordLastInbound(
  botId: string,
  from: From,
  msg: Update["message"],
  fromCallback: boolean,
) {
  const text =
    msg?.text?.trim() ||
    (msg?.photo?.length ? "📷 صورة" : "") ||
    (msg?.document ? `📎 ${msg.document.file_name ?? "ملف"}` : "") ||
    (fromCallback ? "ضغط زر" : "");
  if (!text) return;
  const db = await getDb();
  const fromName =
    [from.first_name, from.last_name].filter(Boolean).join(" ") || from.username || String(from.id);
  await db.collection(collections.bots).updateOne(
    { _id: new ObjectId(botId) },
    {
      $set: {
        lastMessage: {
          text: text.slice(0, 240),
          fromName,
          fromUsername: from.username ?? null,
          telegramUserId: from.id,
          at: new Date(),
        },
        updatedAt: new Date(),
      },
    },
  );
}

function optionRows(field: RequestField, index: number) {
  const options = field.options ?? [];
  return options.map((opt, i) => [{ text: opt.label, callback_data: `o:${index}:${i}` }]);
}

export class TelegramConversationService {
  static async process(botId: string, update: Update) {
    const db = await getDb();
    const requestId = correlationId();
    try {
      await db.collection(collections.telegramUpdates).insertOne({
        botId,
        updateId: update.update_id,
        createdAt: new Date(),
      });
    } catch {
      return;
    }

    const msg = update.message;
    const cb = update.callback_query;
    const from = msg?.from ?? cb?.from;
    const chatId = msg?.chat.id ?? cb?.message?.chat.id;
    if (!from || chatId === undefined) return;
    await upsertUser(from);
    await recordLastInbound(botId, from, msg, Boolean(cb));

    if (msg && (msg.chat.type === "group" || msg.chat.type === "supergroup")) {
      const messageThreadId =
        typeof msg.message_thread_id === "number" && msg.message_thread_id > 0
          ? msg.message_thread_id
          : null;
      await db.collection(collections.telegramGroups).updateOne(
        { chatId: msg.chat.id, messageThreadId },
        {
          $set: {
            title: msg.chat.title ?? "",
            type: msg.chat.is_forum ? "supergroup" : msg.chat.type,
            updatedAt: new Date(),
          },
          $unset: { botId: "" },
          $setOnInsert: {
            chatId: msg.chat.id,
            messageThreadId,
            createdAt: new Date(),
          },
        },
        { upsert: true },
      );
      return;
    }

    if (cb?.id) {
      try {
        await TelegramService.answerCallback(botId, cb.id);
      } catch {
        /* ignore */
      }
    }

    const text = msg?.text?.trim() ?? "";
    const command = text.split(/\s+/)[0]?.split("@")[0] ?? "";

    if (command === "/start" || command === "/cancel") {
      await patch(botId, from.id, { state: "IDLE", requestTypeId: null, fieldIndex: 0, draft: {}, attachments: [] });
      const types = await db
        .collection(collections.requestTypes)
        .find({ botId, active: true, archivedAt: null })
        .sort({ name: 1 })
        .toArray();
      const rows = [
        ...types.map((t) => [{ text: String(t.name), callback_data: `req:${String(t._id)}` }]),
        [{ text: "📋 طلباتي", callback_data: "menu:my" }],
        [{ text: "ℹ️ المساعدة", callback_data: "menu:help" }],
      ];
      await TelegramService.sendMessage(
        botId,
        chatId,
        types.length ? "أهلاً بك 👋\n\nاختر الخدمة:" : "أهلاً بك 👋\n\nلا توجد خدمات مفعّلة حالياً.",
        kb(rows),
      );
      return;
    }
    if (command === "/طلبات" || command === "/orders") {
      await this.sendMyOrders(botId, from.id, chatId);
      return;
    }
    if (command.startsWith("/s_")) {
      const requestTypeId = command.slice(3);
      if (ObjectId.isValid(requestTypeId)) {
        await this.startService(botId, from, chatId, requestTypeId);
        return;
      }
    }
    if (cb?.data) {
      await this.onCallback(botId, from, chatId, cb.data);
      return;
    }
    const state = await conv(botId, from.id);
    if (state.state === "WAITING_FOR_FIELD" || state.state === "WAITING_FOR_FILE") {
      await this.onField(botId, from, chatId, state, msg, requestId);
    }
  }

  static async startService(botId: string, from: From, chatId: number, requestTypeId: string) {
    const db = await getDb();
    const request = await db.collection(collections.requestTypes).findOne({
      _id: new ObjectId(requestTypeId),
      botId,
      active: true,
      archivedAt: null,
    });
    if (!request) {
      await TelegramService.sendMessage(botId, chatId, "هذه الخدمة غير متاحة حالياً.");
      return;
    }
    if (await BlockedUserService.isBlocked(from.id, requestTypeId)) {
      await TelegramService.sendMessage(botId, chatId, "لا يمكنك استخدام هذه الخدمة حالياً.");
      return;
    }
    await patch(botId, from.id, {
      state: "WAITING_FOR_FIELD",
      requestTypeId,
      fieldIndex: 0,
      draft: {},
      attachments: [],
    });
    await this.askField(botId, from.id, chatId, requestTypeId, 0);
  }

  static async onCallback(botId: string, from: From, chatId: number, data: string) {
    const db = await getDb();
    if (data === "menu:help") {
      await TelegramService.sendMessage(
        botId,
        chatId,
        "استخدم الأزرار لاختيار خدمة أو عرض طلباتك.\nيمكنك إلغاء العملية الحالية عبر /cancel",
      );
      return;
    }
    if (data === "menu:my") {
      await this.sendMyOrders(botId, from.id, chatId);
      return;
    }
    if (data === "menu:requests") {
      const types = await db
        .collection(collections.requestTypes)
        .find({ botId, active: true, archivedAt: null })
        .toArray();
      if (!types.length) {
        await TelegramService.sendMessage(botId, chatId, "لا توجد خدمات متاحة حالياً.");
        return;
      }
      await patch(botId, from.id, { state: "SELECTING_REQUEST" });
      await TelegramService.sendMessage(
        botId,
        chatId,
        "اختر الخدمة:",
        kb(types.map((t) => [{ text: String(t.name), callback_data: `req:${String(t._id)}` }])),
      );
      return;
    }
    if (data.startsWith("req:")) {
      const requestTypeId = data.slice(4);
      await this.startService(botId, from, chatId, requestTypeId);
      return;
    }
    if (data.startsWith("o:") || data.startsWith("c:") || data.startsWith("d:") || data.startsWith("y:") || data.startsWith("n:")) {
      const state = await conv(botId, from.id);
      await this.onChoice(botId, from, chatId, state, data);
      return;
    }
    if (data === "confirm:yes") {
      const state = await conv(botId, from.id);
      if (!state.requestTypeId) return;
      if (await BlockedUserService.isBlocked(from.id, String(state.requestTypeId))) {
        await TelegramService.sendMessage(botId, chatId, "لا يمكنك استخدام هذا الطلب حالياً.");
        return;
      }
      try {
        const submitted = await OrderService.submit({
          botId,
          requestTypeId: String(state.requestTypeId),
          telegramUserId: from.id,
          chatId,
          telegramUsername: from.username,
          telegramName: [from.first_name, from.last_name].filter(Boolean).join(" "),
          fields: (state.draft as Record<string, unknown>) ?? {},
          attachments: (state.attachments as string[]) ?? [],
        });
        await patch(botId, from.id, { state: "SUBMITTED", draft: {}, attachments: [] });
        await TelegramService.sendMessage(
          botId,
          chatId,
          `تم إنشاء طلبك بنجاح.\nرقم الطلب: #${submitted.orderNumber}`,
        );
      } catch {
        await TelegramService.sendMessage(
          botId,
          chatId,
          "تعذر إرسال الطلب. تأكد من المرفقات وحاول مرة أخرى.",
        );
      }
      return;
    }
    if (data === "confirm:no") {
      await patch(botId, from.id, { state: "CANCELLED", draft: {}, attachments: [] });
      await TelegramService.sendMessage(botId, chatId, "تم إلغاء الطلب.");
    }
  }

  static async sendMyOrders(botId: string, telegramUserId: number, chatId: number) {
    const db = await getDb();
    const orders = await db
      .collection(collections.orders)
      .find({ botId, telegramUserId })
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();
    if (!orders.length) {
      await TelegramService.sendMessage(botId, chatId, "لا توجد طلبات سابقة.");
      return;
    }
    const labels: Record<string, string> = {
      PENDING: "قيد الانتظار",
      REVIEWING: "قيد المراجعة",
      COMPLETED: "منجزة",
      REJECTED: "مرفوضة",
      ARCHIVED: "مؤرشفة",
    };
    await TelegramService.sendMessage(
      botId,
      chatId,
      `📋 طلباتي\n\n${orders.map((o) => `#${o.orderNumber} — ${labels[String(o.status)] ?? o.status}`).join("\n")}`,
    );
  }

  static async askField(
    botId: string,
    telegramUserId: number,
    chatId: number,
    requestTypeId: string,
    index: number,
  ) {
    const db = await getDb();
    const request = await db.collection(collections.requestTypes).findOne({ _id: new ObjectId(requestTypeId) });
    const fields = activeFields((request?.fields as RequestField[]) ?? []);
    let i = index;
    while (fields[i]?.type === "INSTRUCTION") {
      const instruction = fields[i];
      await TelegramService.sendFieldPrompt(
        botId,
        chatId,
        instruction.telegramMessage || instruction.label,
        instruction,
      );
      i += 1;
    }
    if (i >= fields.length) {
      await this.review(botId, telegramUserId, chatId, requestTypeId);
      return;
    }
    const field = fields[i];
    const waitingFile = field.type === "FILE" || field.type === "IMAGE";
    await patch(botId, telegramUserId, {
      fieldIndex: i,
      state: waitingFile ? "WAITING_FOR_FILE" : "WAITING_FOR_FIELD",
    });
    const prompt = field.telegramMessage || field.label;
    logJson("info", "telegram", "ask_field", {
      botId,
      requestTypeId,
      fieldIndex: i,
      fieldName: field.name,
      fieldType: field.type,
      imageFileId: field.imageFileId ?? null,
      attachmentFileId: field.attachmentFileId ?? null,
    });
    if (field.type === "SELECT" || field.type === "RADIO") {
      await TelegramService.sendFieldPrompt(botId, chatId, prompt, field, kb(optionRows(field, i)));
      return;
    }
    if (field.type === "CHECKBOX") {
      const state = await conv(botId, telegramUserId);
      const selected = new Set((state.draft as Record<string, unknown>)[field.name] as string[] ?? []);
      const rows = (field.options ?? []).map((opt, idx) => [
        {
          text: `${selected.has(opt.value) ? "✅ " : ""}${opt.label}`,
          callback_data: `c:${i}:${idx}`,
        },
      ]);
      rows.push([{ text: "تم", callback_data: `d:${i}` }]);
      await TelegramService.sendFieldPrompt(botId, chatId, prompt, field, kb(rows));
      return;
    }
    if (field.type === "CONFIRMATION") {
      await TelegramService.sendFieldPrompt(
        botId,
        chatId,
        prompt,
        field,
        kb([[{ text: "نعم", callback_data: `y:${i}` }, { text: "لا", callback_data: `n:${i}` }]]),
      );
      return;
    }
    const askPrompt =
      field.type === "FILE"
        ? `${prompt}\n\n📎 أرسل ملفاً.`
        : field.type === "IMAGE"
          ? `${prompt}\n\n📷 أرسل صورة.`
          : prompt;
    await TelegramService.sendFieldPrompt(botId, chatId, askPrompt, field);
  }

  static async review(botId: string, telegramUserId: number, chatId: number, requestTypeId: string) {
    const db = await getDb();
    const request = await db.collection(collections.requestTypes).findOne({ _id: new ObjectId(requestTypeId) });
    const state = await conv(botId, telegramUserId);
    const fields = activeFields((request?.fields as RequestField[]) ?? []);
    const draft = (state.draft as Record<string, unknown>) ?? {};
    const lines: string[] = [];
    const mediaPreview: { label: string; telegramFileId: string; kind: "photo" | "document"; gridFsId?: string }[] =
      [];

    for (const f of fields) {
      if (f.type === "INSTRUCTION") continue;
      const value = draft[f.name];
      if (f.type === "FILE" || f.type === "IMAGE") {
        const meta =
          value && typeof value === "object"
            ? (value as { telegramFileId?: string; kind?: "photo" | "document"; gridFsId?: string })
            : null;
        const telegramFileId = meta?.telegramFileId || (typeof value === "string" ? value : "");
        const kind: "photo" | "document" =
          meta?.kind || (f.type === "IMAGE" ? "photo" : "document");
        if (telegramFileId) {
          lines.push(`${f.label}: ${kind === "photo" ? "📷 صورة مرفقة" : "📎 ملف مرفق"}`);
          mediaPreview.push({
            label: f.label,
            telegramFileId,
            kind,
            gridFsId: meta?.gridFsId,
          });
        } else {
          lines.push(`${f.label}: —`);
        }
        continue;
      }
      const display = Array.isArray(value) ? value.join(", ") : (value ?? "-");
      lines.push(`${f.label}: ${display}`);
    }

    await patch(botId, telegramUserId, { state: "REVIEW" });

    for (const media of mediaPreview) {
      try {
        if (media.gridFsId) {
          const file = await GridFSStorageService.readBuffer(media.gridFsId);
          if (file?.buffer?.length) {
            if (file.mimeType.startsWith("image/") || media.kind === "photo") {
              await TelegramService.sendPhoto(botId, chatId, file.buffer, file.filename, media.label);
            } else {
              await TelegramService.sendDocument(botId, chatId, file.buffer, file.filename, media.label);
            }
            continue;
          }
        }
        if (media.kind === "photo") {
          await TelegramService.sendExistingPhoto(botId, chatId, media.telegramFileId, media.label);
        } else {
          await TelegramService.sendExistingDocument(botId, chatId, media.telegramFileId, media.label);
        }
      } catch (err) {
        logJson("warn", "telegram", "review_media_preview_failed", {
          botId,
          label: media.label,
          error: err instanceof Error ? err.message : String(err),
        });
        try {
          if (media.kind === "photo") {
            await TelegramService.sendExistingDocument(botId, chatId, media.telegramFileId, media.label);
          } else {
            await TelegramService.sendExistingPhoto(botId, chatId, media.telegramFileId, media.label);
          }
        } catch {
          /* ignore secondary preview failure */
        }
      }
    }

    await TelegramService.sendMessage(
      botId,
      chatId,
      `يرجى تأكيد الطلب:\n\n${lines.join("\n") || "—"}`,
      kb([[{ text: "تأكيد", callback_data: "confirm:yes" }, { text: "إلغاء", callback_data: "confirm:no" }]]),
    );
  }

  static async onChoice(
    botId: string,
    from: From,
    chatId: number,
    state: Record<string, unknown>,
    data: string,
  ) {
    const [kind, indexStr, optStr] = data.split(":");
    const index = Number(indexStr);
    const db = await getDb();
    const request = await db
      .collection(collections.requestTypes)
      .findOne({ _id: new ObjectId(String(state.requestTypeId)) });
    const fields = activeFields((request?.fields as RequestField[]) ?? []);
    const field = fields[index];
    if (!field) return;
    const draft = { ...((state.draft as Record<string, unknown>) ?? {}) };
    if (kind === "o") {
      const opt = field.options?.[Number(optStr)];
      if (!opt) return;
      draft[field.name] = persistValue(field, opt.value);
      await patch(botId, from.id, { draft, fieldIndex: index + 1 });
      await this.askField(botId, from.id, chatId, String(state.requestTypeId), index + 1);
      return;
    }
    if (kind === "c") {
      const opt = field.options?.[Number(optStr)];
      if (!opt) return;
      const selected = new Set((Array.isArray(draft[field.name]) ? draft[field.name] : []) as string[]);
      if (selected.has(opt.value)) selected.delete(opt.value);
      else selected.add(opt.value);
      draft[field.name] = [...selected];
      await patch(botId, from.id, { draft });
      await this.askField(botId, from.id, chatId, String(state.requestTypeId), index);
      return;
    }
    if (kind === "d") {
      const selected = (draft[field.name] as string[] | undefined) ?? [];
      if (field.required && selected.length === 0) {
        await TelegramService.sendMessage(botId, chatId, "يرجى اختيار خيار واحد على الأقل.");
        return;
      }
      draft[field.name] = selected;
      await patch(botId, from.id, { draft, fieldIndex: index + 1 });
      await this.askField(botId, from.id, chatId, String(state.requestTypeId), index + 1);
      return;
    }
    if (kind === "y" || kind === "n") {
      draft[field.name] = kind === "y";
      await patch(botId, from.id, { draft, fieldIndex: index + 1 });
      await this.askField(botId, from.id, chatId, String(state.requestTypeId), index + 1);
    }
  }

  static async onField(
    botId: string,
    from: From,
    chatId: number,
    state: Record<string, unknown>,
    msg?: Update["message"],
    requestId?: string,
  ) {
    const db = await getDb();
    const request = await db
      .collection(collections.requestTypes)
      .findOne({ _id: new ObjectId(String(state.requestTypeId)) });
    const fields = activeFields((request?.fields as RequestField[]) ?? []);
    const index = Number(state.fieldIndex ?? 0);
    const field = fields[index];
    if (!field) {
      await this.review(botId, from.id, chatId, String(state.requestTypeId));
      return;
    }
    const draft = { ...((state.draft as Record<string, unknown>) ?? {}) };
    const attachments = [...((state.attachments as string[]) ?? [])];

    if (field.type === "SELECT" || field.type === "RADIO" || field.type === "CHECKBOX" || field.type === "CONFIRMATION") {
      await this.askField(botId, from.id, chatId, String(state.requestTypeId), index);
      return;
    }

    if (field.type === "FILE" || field.type === "IMAGE") {
      const fileId = msg?.document?.file_id ?? msg?.photo?.at(-1)?.file_id;
      if (!fileId) {
        await TelegramService.sendMessage(botId, chatId, "يرجى إرسال ملف أو صورة.");
        return;
      }
      const kind: "photo" | "document" = msg?.photo?.length ? "photo" : "document";
      try {
        const stored = await persistTelegramUpload({
          botId,
          telegramUserId: from.id,
          field,
          telegramFileId: fileId,
          kind,
          filename: msg?.document?.file_name ?? null,
          mimeType: msg?.document?.mime_type ?? null,
          ownerId: `draft-${requestId}`,
        });
        attachments.push(stored.gridFsId);
        draft[field.name] = stored;
      } catch (err) {
        logJson("warn", "telegram", "FILE_STORE_FAILED", { requestId, botId, error: String(err) });
        await TelegramService.sendMessage(
          botId,
          chatId,
          "تعذر حفظ الملف. يرجى إعادة إرساله أو تجربة صيغة أخرى.",
        );
        return;
      }
    } else {
      const value = msg?.text?.trim();
      const error = validateFieldValue(field, value);
      if (error) {
        await TelegramService.sendMessage(botId, chatId, error);
        return;
      }
      draft[field.name] = persistValue(field, value);
    }

    const next = index + 1;
    await patch(botId, from.id, { draft, attachments, fieldIndex: next });
    await this.askField(botId, from.id, chatId, String(state.requestTypeId), next);
  }
}
