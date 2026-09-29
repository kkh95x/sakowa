import { ObjectId } from "mongodb";
import { collections, getDb } from "@/lib/db/client";
import { BlockedUserService } from "@/lib/blocks/blocked-user-service";
import { OrderService } from "@/lib/orders/order-service";
import { NotificationService } from "@/lib/notifications/notification-service";
import { TelegramService } from "@/lib/telegram/telegram-service";
import { GridFSStorageService } from "@/lib/storage/gridfs";
import { persistTelegramUpload } from "@/lib/orders/persist-order-files";
import { ChatLogService } from "@/lib/chat/chat-log-service";
import { persistValue, validateFieldValue } from "@/lib/telegram/validate-field";
import {
  inboundSummary,
  normalizeTelegramMessage,
  openComplaintActivityNotice,
  toDynamicAnswer,
  type TelegramMessageLike,
} from "@/lib/telegram/normalize-input";
import {
  nextAskIndex,
  pruneHiddenAnswers,
  visibleFieldIds,
  type BranchingRule,
} from "@/lib/requests/branching";
import { notClosedStatusMongoQuery } from "@/lib/orders/complaint-status";
import { displayChoice, optionLabel } from "@/lib/orders/field-answer";
import { callbackButtonLabel, isSlashCommand } from "@/lib/chat/callback-label";
import {
  captureFormSnapshot,
  isFormSnapshot,
  positionFields,
  resolveConversationForm,
  type ConversationForm,
} from "@/lib/telegram/conversation-form";
import {
  clampMyOrdersPage,
  formatOrderCommandLine,
  MY_ORDERS_PAGE_SIZE,
  myOrdersNavButtons,
  orderDigitsFromCommand,
  orderNumberLookup,
  orderStatusLabel,
} from "@/lib/telegram/order-command";
import { logJson } from "@/lib/log";
import { fieldAnswerHint } from "@/lib/telegram/field-prompt";
import { enqueueVoiceTranscript } from "@/lib/speech/transcribe-voice";
import { correlationId } from "@/lib/security/crypto";
import type { ConversationState, RequestField, TelegramPrompt } from "@/types";

type ChatMedia = {
  label: string;
  telegramFileId?: string | null;
  kind: "photo" | "document";
  gridFsId?: string | null;
};

async function sendChatMedia(botId: string, chatId: number, media: ChatMedia) {
  try {
    if (media.gridFsId) {
      const file = await GridFSStorageService.readBuffer(media.gridFsId);
      if (file?.buffer?.length) {
        if (file.mimeType.startsWith("image/") || media.kind === "photo") {
          await TelegramService.sendPhoto(botId, chatId, file.buffer, file.filename, media.label);
        } else {
          await TelegramService.sendDocument(botId, chatId, file.buffer, file.filename, media.label);
        }
        return;
      }
    }
    if (!media.telegramFileId) throw new Error("NO_FILE_SOURCE");
    if (media.kind === "photo") {
      await TelegramService.sendExistingPhoto(botId, chatId, media.telegramFileId, media.label);
    } else {
      await TelegramService.sendExistingDocument(botId, chatId, media.telegramFileId, media.label);
    }
  } catch (err) {
    logJson("error", "telegram", "order_media_send_failed", {
      botId,
      label: media.label,
      error: err instanceof Error ? err.message : String(err),
    });
    try {
      if (media.telegramFileId) {
        if (media.kind === "photo") {
          await TelegramService.sendExistingDocument(botId, chatId, media.telegramFileId, media.label);
        } else {
          await TelegramService.sendExistingPhoto(botId, chatId, media.telegramFileId, media.label);
        }
      }
    } catch (fallbackErr) {
      logJson("error", "telegram", "order_media_send_fallback_failed", {
        botId,
        label: media.label,
        error: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
      });
    }
  }
}

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
  message?: TelegramMessageLike & {
    chat: { id: number; type: string; title?: string; is_forum?: boolean };
    from?: From;
    message_thread_id?: number;
  };
  callback_query?: {
    id: string;
    data?: string;
    from: From;
    message?: CallbackMessage;
  };
};

type CallbackMessage = {
  chat: { id: number };
  message_id?: number;
  text?: string;
  caption?: string;
  photo?: { file_id: string }[];
  document?: unknown;
  video?: unknown;
  audio?: unknown;
  voice?: unknown;
  animation?: unknown;
  reply_markup?: { inline_keyboard?: { text?: string; callback_data?: string }[][] };
};

function kb(rows: { text: string; callback_data: string }[][]) {
  return { reply_markup: { inline_keyboard: rows } };
}

function buttonLabel(data: string, source?: CallbackMessage, fallback?: string) {
  return callbackButtonLabel(data, source?.reply_markup?.inline_keyboard) || fallback || "";
}

const FORM_CHANGED_NOTICE =
  "تم تحديث نموذج هذه الشكوى أثناء تعبئتها، لذلك لم تُحفظ رسالتك الأخيرة. سنكمل من السؤال التالي.";
const INACTIVE_COMPLAINT_NOTICE = "هذه الشكوى لم تعد قيد التعبئة. استخدم /start لبدء شكوى جديدة.";
const ACTIVE_STATES = new Set(["WAITING_FOR_FIELD", "WAITING_FOR_FILE", "REVIEW"]);
const CLEARED_FORM = { formSnapshot: null, currentFieldId: null, draftId: null };

/** Identity of one draft; async work captured under an old draftId must never touch a newer draft. */
function newDraftId() {
  return new ObjectId().toHexString();
}

function draftValue(draft: Record<string, unknown>, field: { id: string; name: string }) {
  if (Object.prototype.hasOwnProperty.call(draft, field.id)) return draft[field.id];
  return draft[field.name];
}

function writeDraft(draft: Record<string, unknown>, field: { id: string; name: string }, value: unknown) {
  draft[field.id] = value;
  draft[field.name] = value;
}

function applyBranchingDraft(
  fields: RequestField[],
  rules: BranchingRule[],
  draft: Record<string, unknown>,
) {
  return pruneHiddenAnswers(fields, rules, draft);
}

function isTelegramFileId(value: string) {
  return /^[A-Za-z0-9_-]{20,}$/.test(value);
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
    currentFieldId: null as string | null,
    formSnapshot: null,
    draftId: null as string | null,
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

type LoadedForm = ConversationForm & { state: Record<string, unknown> };

/** The form this conversation follows; converts old index-only conversations on first read. */
async function loadForm(
  botId: string,
  telegramUserId: number,
  known?: Record<string, unknown>,
): Promise<LoadedForm | null> {
  const state = (known ?? (await conv(botId, telegramUserId))) as Record<string, unknown>;
  if (!state.requestTypeId || !ObjectId.isValid(String(state.requestTypeId))) return null;
  let live: Record<string, unknown> | null = null;
  if (!isFormSnapshot(state.formSnapshot, state.requestTypeId)) {
    const db = await getDb();
    live = await db.collection(collections.requestTypes).findOne({ _id: new ObjectId(String(state.requestTypeId)) });
  }
  const form = resolveConversationForm(state, live as never);
  if (!form) return null;
  if (form.adopted) {
    const adoptedFields = { formSnapshot: form.snapshot, ...positionFields(form.fields, form.currentIndex) };
    await patch(botId, telegramUserId, adoptedFields);
    Object.assign(state, adoptedFields);
    logJson("info", "telegram", "conversation_form_adopted", {
      botId,
      telegramUserId,
      requestTypeId: String(state.requestTypeId),
      mode: form.adopted,
      currentFieldId: adoptedFields.currentFieldId,
    });
  }
  return { ...form, state };
}

/**
 * Applies a finished background upload to the draft it was started for. The write is
 * filtered on draftId, so an upload that outlives its draft (submit, cancel, /start,
 * a new complaint) is dropped instead of leaking into the next draft.
 */
async function attachUploadToDraft(params: {
  botId: string;
  telegramUserId: number;
  draftId: string;
  field: RequestField;
  telegramFileId: string;
  gridFsId: string;
  existingFileId: (value: unknown) => string;
  value: unknown;
}) {
  const db = await getDb();
  const owner = { botId: params.botId, telegramUserId: params.telegramUserId, draftId: params.draftId };
  const stale = (reason: string) => {
    logJson("warn", "telegram", "stale_upload_not_attached", {
      botId: params.botId,
      telegramUserId: params.telegramUserId,
      draftId: params.draftId,
      fieldId: params.field.id,
      gridFsId: params.gridFsId,
      reason,
    });
    return false;
  };
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await db.collection(collections.telegramConversations).findOne(owner);
    if (!current) return stale("draft_replaced");
    const snapshot = current.formSnapshot as { fields?: RequestField[] } | null | undefined;
    if (snapshot?.fields && !snapshot.fields.some((f) => f.id === params.field.id)) return stale("field_not_in_draft");
    const nextDraft = { ...((current.draft as Record<string, unknown>) ?? {}) };
    const existing = draftValue(nextDraft, params.field);
    const existingId = params.existingFileId(existing);
    if (existingId && existingId !== params.telegramFileId) return stale("answer_replaced");
    const previousTranscript =
      existing && typeof existing === "object" ? (existing as { transcript?: unknown }).transcript : undefined;
    const value =
      previousTranscript && params.value && typeof params.value === "object"
        ? { ...(params.value as Record<string, unknown>), transcript: previousTranscript }
        : params.value;
    writeDraft(nextDraft, params.field, value);
    const attachments = [...new Set([...((current.attachments as string[]) ?? []), params.gridFsId])];
    // updatedAt acts as a version so a concurrent answer in the same draft is not overwritten.
    const result = await db
      .collection(collections.telegramConversations)
      .updateOne({ ...owner, updatedAt: current.updatedAt }, { $set: { draft: nextDraft, attachments, updatedAt: new Date() } });
    if (result.matchedCount) return true;
  }
  return stale("write_conflict");
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

function checkboxRows(field: RequestField, index: number, selected: Set<string>) {
  const rows = (field.options ?? []).map((opt, idx) => [
    {
      text: `${selected.has(opt.value) ? "✅ " : ""}${opt.label}`,
      callback_data: `c:${index}:${idx}`,
    },
  ]);
  rows.push([{ text: "تم", callback_data: `d:${index}` }]);
  return rows;
}

async function revealChoice(
  botId: string,
  from: From,
  chatId: number,
  source: CallbackMessage | undefined,
  choice: string,
) {
  const text = choice.trim();
  if (!text) return;
  const edited = source?.message_id
    ? await TelegramService.revealInlineChoice(botId, chatId, source, text)
    : false;
  if (!edited) {
    await TelegramService.sendMessage(botId, chatId, text, { log: false });
  }
  void ChatLogService.captureInbound({
    botId,
    telegramUserId: from.id,
    chatId,
    text,
    kind: "command",
  });
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
    if (msg && msg.chat.type === "private") {
      const normalized = normalizeTelegramMessage(msg);
      const inboundText = normalized ? inboundSummary(normalized) : msg.text?.trim() || null;
      if (normalized && (normalized.text || normalized.telegramFileId || normalized.contentType !== "unknown")) {
        void ChatLogService.captureInbound({
          botId,
          telegramUserId: from.id,
          chatId,
          text: inboundText,
          photoFileId: normalized.contentType === "photo" ? normalized.telegramFileId : null,
          documentFileId:
            normalized.contentType !== "photo" && normalized.telegramFileId ? normalized.telegramFileId : null,
          filename: normalized.filename,
          mimeType: normalized.mimeType,
          kind: isSlashCommand(inboundText) ? "command" : undefined,
        });
      }
    }

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
      await patch(botId, from.id, {
        state: "IDLE",
        requestTypeId: null,
        fieldIndex: 0,
        draft: {},
        attachments: [],
        ...CLEARED_FORM,
      });
      const types = await db
        .collection(collections.requestTypes)
        .find({ botId, active: true, archivedAt: null })
        .sort({ name: 1 })
        .toArray();
      const rows = [
        ...types.map((t) => [{ text: String(t.name), callback_data: `req:${String(t._id)}` }]),
        [{ text: "📋 شكاواي", callback_data: "menu:my" }],
        [{ text: "ℹ️ المساعدة", callback_data: "menu:help" }],
      ];
      const bot = await db.collection(collections.bots).findOne({ _id: new ObjectId(botId) });
      await TelegramService.sendWelcome(botId, chatId, {
        bot: bot as { welcomePrompt?: TelegramPrompt | null } | null,
        hasActiveTypes: types.length > 0,
        extra: kb(rows),
      });
      return;
    }
    if (command === "/طلبات" || command === "/orders" || command === "/شكاوى" || command === "/complaints") {
      await this.sendMyOrders(botId, from.id, chatId);
      return;
    }
    const orderDigits = orderDigitsFromCommand(command);
    if (orderDigits != null) {
      await this.sendOrderDetails(botId, from.id, chatId, orderDigits);
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
      await this.onCallback(botId, from, chatId, cb.data, cb.message);
      return;
    }
    const state = await conv(botId, from.id);
    if (state.state === "WAITING_FOR_FIELD" || state.state === "WAITING_FOR_FILE") {
      await this.onField(botId, from, chatId, state, msg, requestId);
      return;
    }
    if (msg && msg.chat.type === "private" && !isSlashCommand(text)) {
      await this.notifyOpenComplaintActivity(botId, from.id, msg);
    }
  }

  static async notifyOpenComplaintActivity(botId: string, telegramUserId: number, msg?: Update["message"]) {
    const db = await getDb();
    const order = await db.collection(collections.orders).findOne(
      {
        ...OrderService.userMatch(telegramUserId, { botId }),
        status: notClosedStatusMongoQuery(),
      },
      { sort: { createdAt: -1 } },
    );
    if (!order) return;
    const input = normalizeTelegramMessage(msg);
    const notice = openComplaintActivityNotice(String(order.orderNumber), input);
    await NotificationService.notifyAdmins({
      ...notice,
      orderId: String(order._id),
      requestTypeId: String(order.requestTypeId ?? ""),
      botId,
      entityType: "complaint",
      entityId: String(order._id),
    });
  }

  static async startService(
    botId: string,
    from: From,
    chatId: number,
    requestTypeId: string,
    source?: CallbackMessage,
  ) {
    const db = await getDb();
    const request = await db.collection(collections.requestTypes).findOne({
      _id: new ObjectId(requestTypeId),
      botId,
      active: true,
      archivedAt: null,
    });
    if (!request) {
      await TelegramService.sendMessage(botId, chatId, "هذا النوع من الشكاوى غير متاح حالياً.");
      return;
    }
    if (await BlockedUserService.isBlocked(from.id, requestTypeId)) {
      await TelegramService.sendMessage(botId, chatId, "لا يمكنك استخدام هذا النوع من الشكاوى حالياً.");
      return;
    }
    await revealChoice(botId, from, chatId, source, String(request.name));
    const snapshot = captureFormSnapshot(request);
    await patch(botId, from.id, {
      state: "WAITING_FOR_FIELD",
      requestTypeId,
      formSnapshot: snapshot,
      draftId: newDraftId(),
      ...positionFields(snapshot.fields, 0),
      draft: {},
      attachments: [],
    });
    await this.askField(botId, from.id, chatId, requestTypeId, 0);
  }

  static async onCallback(
    botId: string,
    from: From,
    chatId: number,
    data: string,
    source?: CallbackMessage,
  ) {
    const db = await getDb();
    if (data === "menu:help") {
      await revealChoice(botId, from, chatId, source, buttonLabel(data, source, "ℹ️ المساعدة"));
      await TelegramService.sendMessage(
        botId,
        chatId,
        "استخدم الأزرار لاختيار نوع الشكوى أو عرض شكاواك.\nيمكنك إلغاء العملية الحالية عبر /cancel",
      );
      return;
    }
    if (data === "menu:my") {
      await revealChoice(botId, from, chatId, source, buttonLabel(data, source, "📋 شكاواي"));
      await this.sendMyOrders(botId, from.id, chatId);
      return;
    }
    if (data.startsWith("ords:")) {
      const page = Number(data.slice(5));
      await this.sendMyOrders(botId, from.id, chatId, page, source);
      return;
    }
    if (data.startsWith("ord:")) {
      const orderId = data.slice(4);
      await this.sendOrderDetails(botId, from.id, chatId, orderId);
      return;
    }
    if (data === "menu:requests") {
      const types = await db
        .collection(collections.requestTypes)
        .find({ botId, active: true, archivedAt: null })
        .toArray();
      if (!types.length) {
        await TelegramService.sendMessage(botId, chatId, "لا توجد أنواع شكاوى متاحة حالياً.");
        return;
      }
      await patch(botId, from.id, { state: "SELECTING_REQUEST" });
      await TelegramService.sendMessage(
        botId,
        chatId,
        "اختر نوع الشكوى:",
        kb(types.map((t) => [{ text: String(t.name), callback_data: `req:${String(t._id)}` }])),
      );
      return;
    }
    if (data.startsWith("req:")) {
      const requestTypeId = data.slice(4);
      await this.startService(botId, from, chatId, requestTypeId, source);
      return;
    }
    if (data.startsWith("o:") || data.startsWith("c:") || data.startsWith("d:") || data.startsWith("y:") || data.startsWith("n:")) {
      const state = await conv(botId, from.id);
      if (!state.requestTypeId || !ACTIVE_STATES.has(String(state.state))) {
        await TelegramService.sendMessage(botId, chatId, INACTIVE_COMPLAINT_NOTICE);
        return;
      }
      await this.onChoice(botId, from, chatId, state, data, source);
      return;
    }
    if (data === "confirm:yes") {
      await revealChoice(botId, from, chatId, source, buttonLabel(data, source, "تأكيد"));
      const state = await conv(botId, from.id);
      if (!state.requestTypeId || state.state !== "REVIEW") {
        await TelegramService.sendMessage(botId, chatId, INACTIVE_COMPLAINT_NOTICE);
        return;
      }
      if (await BlockedUserService.isBlocked(from.id, String(state.requestTypeId))) {
        await TelegramService.sendMessage(botId, chatId, "لا يمكنك إرسال هذه الشكوى حالياً.");
        return;
      }
      const form = await loadForm(botId, from.id, state);
      if (!form) {
        await TelegramService.sendMessage(botId, chatId, "هذا النوع من الشكاوى غير متاح حالياً.");
        return;
      }
      if (form.adopted === "legacy-resynced") {
        await TelegramService.sendMessage(botId, chatId, FORM_CHANGED_NOTICE);
        await this.askField(botId, from.id, chatId, String(state.requestTypeId), form.currentIndex);
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
          fields: this.draftFieldsForSubmit(form),
          attachments: (form.state.attachments as string[]) ?? [],
          fieldDefs: form.fields,
          branchingRules: form.rules,
        });
        await patch(botId, from.id, { state: "SUBMITTED", draft: {}, attachments: [], ...CLEARED_FORM });
        await TelegramService.sendMessage(
          botId,
          chatId,
          `تم إنشاء شكواك بنجاح.\nرقم الشكوى: #${submitted.orderNumber}`,
        );
      } catch (err) {
        logJson("error", "telegram", "ORDER_SUBMIT_FAILED", {
          botId,
          requestTypeId: String(state.requestTypeId),
          telegramUserId: from.id,
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        });
        await TelegramService.sendMessage(
          botId,
          chatId,
          "تعذر إرسال الشكوى. تأكد من المرفقات وحاول مرة أخرى.",
        );
      }
      return;
    }
    if (data === "confirm:no") {
      await revealChoice(botId, from, chatId, source, buttonLabel(data, source, "إلغاء"));
      await patch(botId, from.id, { state: "CANCELLED", draft: {}, attachments: [], ...CLEARED_FORM });
      await TelegramService.sendMessage(botId, chatId, "تم إلغاء الشكوى.");
    }
  }

  static async sendMyOrders(
    botId: string,
    telegramUserId: number,
    chatId: number,
    page = 0,
    source?: CallbackMessage,
  ) {
    const db = await getDb();
    const query = {
      ...OrderService.userMatch(telegramUserId, { botId }),
      status: notClosedStatusMongoQuery(),
    };
    const total = await db.collection(collections.orders).countDocuments(query);
    if (!total) {
      await TelegramService.sendMessage(botId, chatId, "لا توجد شكاوى سابقة.");
      return;
    }
    const safePage = clampMyOrdersPage(page, total);
    const orders = await db
      .collection(collections.orders)
      .find(query)
      .sort({ createdAt: -1 })
      .skip(safePage * MY_ORDERS_PAGE_SIZE)
      .limit(MY_ORDERS_PAGE_SIZE)
      .toArray();
    const typeIds = [
      ...new Set(
        orders
          .map((o) => String(o.requestTypeId ?? ""))
          .filter((id) => ObjectId.isValid(id) && String(new ObjectId(id)) === id),
      ),
    ];
    const types = typeIds.length
      ? await db
          .collection(collections.requestTypes)
          .find({ _id: { $in: typeIds.map((id) => new ObjectId(id)) } })
          .project({ name: 1 })
          .toArray()
      : [];
    const typeNames = new Map(types.map((t) => [String(t._id), String(t.name ?? "").trim()]));
    const rows = orders.map((o) => [
      {
        text: formatOrderCommandLine(
          o.orderNumber,
          o.status,
          typeNames.get(String(o.requestTypeId)),
        ),
        callback_data: `ord:${String(o._id)}`,
      },
    ]);
    const nav = myOrdersNavButtons(safePage, total);
    if (nav.length) rows.push(nav);
    const extra = kb(rows);
    if (source?.message_id) {
      try {
        const edited = await TelegramService.editReplyMarkup(botId, chatId, source.message_id, extra);
        if (edited?.ok || /not modified/i.test(String(edited?.description ?? ""))) return;
      } catch {
        /* send a fresh list */
      }
    }
    await TelegramService.sendMessage(botId, chatId, "📋 شكاواي", extra);
  }

  static async sendOrderDetails(
    botId: string,
    telegramUserId: number,
    chatId: number,
    ref: number | string,
  ) {
    const db = await getDb();
    const owner = OrderService.userMatch(telegramUserId, { botId });
    const query: Record<string, unknown> = { ...owner, status: notClosedStatusMongoQuery() };
    if (typeof ref === "number") {
      query.orderNumber = orderNumberLookup(ref);
    } else if (ObjectId.isValid(ref) && String(new ObjectId(ref)) === ref) {
      query._id = new ObjectId(ref);
    } else {
      const digits = Number(String(ref).replace(/\D/g, ""));
      if (!Number.isFinite(digits) || digits <= 0) {
        await TelegramService.sendMessage(botId, chatId, "لم يتم العثور على هذه الشكوى.");
        return;
      }
      query.orderNumber = orderNumberLookup(digits);
    }
    const order = await db.collection(collections.orders).findOne(query);
    if (!order) {
      await TelegramService.sendMessage(botId, chatId, "لم يتم العثور على هذه الشكوى.");
      return;
    }

    const request = order.requestTypeId
      ? await db.collection(collections.requestTypes).findOne({
          _id: new ObjectId(String(order.requestTypeId)),
        })
      : null;
    const fields = (request?.fields as RequestField[]) ?? [];
    const sanitized = OrderService.sanitizeOrder(order as Record<string, unknown>, fields);
    const rows = OrderService.summarizeSubmittedAnswers(sanitized, fields);

    const createdAt = order.createdAt ? new Date(String(order.createdAt)) : null;
    const createdLabel =
      createdAt && !Number.isNaN(createdAt.getTime())
        ? createdAt.toLocaleString("ar-SY", { dateStyle: "short", timeStyle: "short" })
        : "";

    const lines = [
      "📋 تفاصيل الشكوى",
      `رقم الشكوى: #${order.orderNumber}`,
      `الحالة: ${orderStatusLabel(order.status)}`,
    ];
    if (request?.name) lines.push(`نوع الشكوى: ${request.name}`);
    if (createdLabel) lines.push(`التاريخ: ${createdLabel}`);
    lines.push("");

    const media: ChatMedia[] = [];
    const sentGridFs = new Set<string>();
    for (const row of rows) {
      if (row.kind === "file" || row.kind === "image") {
        lines.push(`${row.label}: ${row.kind === "image" ? "📷 صورة مرفقة" : "📎 ملف مرفق"}`);
        media.push({
          label: row.label,
          telegramFileId: row.telegramFileId,
          kind: row.kind === "image" ? "photo" : "document",
          gridFsId: row.gridFsId,
        });
        if (row.gridFsId) sentGridFs.add(row.gridFsId);
      } else {
        lines.push(`${row.label}: ${row.value || "—"}`);
      }
    }

    for (const id of (order.attachments as string[]) ?? []) {
      const gridFsId = String(id);
      if (!gridFsId || sentGridFs.has(gridFsId)) continue;
      sentGridFs.add(gridFsId);
      media.push({
        label: "مرفق",
        telegramFileId: null,
        kind: "document",
        gridFsId,
      });
    }

    await TelegramService.sendMessage(botId, chatId, lines.join("\n").trim());
    for (const item of media) {
      await sendChatMedia(botId, chatId, item);
    }
  }

  static draftFieldsForSubmit(form: LoadedForm) {
    const { fields, rules, state } = form;
    const draft = applyBranchingDraft(fields, rules, (state.draft as Record<string, unknown>) ?? {});
    const visible = visibleFieldIds(fields, rules, draft);
    const mapped: Record<string, unknown> = {};
    for (const field of fields) {
      if (field.type === "INSTRUCTION") continue;
      if (!visible.has(field.id)) continue;
      const value = draftValue(draft, field);
      if (value !== undefined) mapped[field.name] = value;
    }
    return mapped;
  }

  static async askField(
    botId: string,
    telegramUserId: number,
    chatId: number,
    requestTypeId: string,
    index: number,
  ) {
    const form = await loadForm(botId, telegramUserId);
    if (!form) {
      await TelegramService.sendMessage(botId, chatId, "هذا النوع من الشكاوى غير متاح حالياً.");
      return;
    }
    const { fields, rules, state } = form;
    const draft = (state.draft as Record<string, unknown>) ?? {};
    const visible = visibleFieldIds(fields, rules, draft);
    let i = index;
    while (i < fields.length) {
      const current = fields[i];
      if (!current || !visible.has(current.id)) {
        i += 1;
        continue;
      }
      if (current.type === "INSTRUCTION") {
        await TelegramService.sendFieldPrompt(botId, chatId, current);
        i += 1;
        continue;
      }
      break;
    }
    if (i >= fields.length) {
      await this.review(botId, telegramUserId, chatId, requestTypeId);
      return;
    }
    const field = fields[i];
    const waitingFile = field.type === "FILE" || field.type === "IMAGE";
    await patch(botId, telegramUserId, {
      ...positionFields(fields, i),
      state: waitingFile ? "WAITING_FOR_FILE" : "WAITING_FOR_FIELD",
    });
    logJson("info", "telegram", "ask_field", {
      botId,
      requestTypeId,
      fieldIndex: i,
      fieldId: field.id,
      fieldName: field.name,
      fieldType: field.type,
      promptBlocks: field.telegramPrompt?.blocks?.map((b) => b.type) ?? null,
      imageFileId: field.imageFileId ?? null,
      attachmentFileId: field.attachmentFileId ?? null,
    });
    if (field.type === "SELECT" || field.type === "RADIO") {
      await TelegramService.sendFieldPrompt(botId, chatId, field, { extra: kb(optionRows(field, i)) });
      return;
    }
    if (field.type === "CHECKBOX") {
      const selected = new Set(
        (draftValue(draft, field) as string[] | undefined) ?? [],
      );
      await TelegramService.sendFieldPrompt(botId, chatId, field, { extra: kb(checkboxRows(field, i, selected)) });
      return;
    }
    if (field.type === "CONFIRMATION") {
      await TelegramService.sendFieldPrompt(botId, chatId, field, {
        extra: kb([[{ text: "نعم", callback_data: `y:${i}` }, { text: "لا", callback_data: `n:${i}` }]]),
      });
      return;
    }
    await TelegramService.sendFieldPrompt(botId, chatId, field, { hint: fieldAnswerHint(field.type) });
  }

  static async review(botId: string, telegramUserId: number, chatId: number, _requestTypeId: string) {
    const form = await loadForm(botId, telegramUserId);
    if (!form) {
      await TelegramService.sendMessage(botId, chatId, "هذا النوع من الشكاوى غير متاح حالياً.");
      return;
    }
    const { fields, rules, state, snapshot } = form;
    const draft = applyBranchingDraft(fields, rules, (state.draft as Record<string, unknown>) ?? {});
    const visible = visibleFieldIds(fields, rules, draft);
    const lines: string[] = [];
    const mediaPreview: ChatMedia[] = [];
    if (snapshot.requestTypeName) lines.push(`نوع الشكوى: ${snapshot.requestTypeName}`);

    for (const f of fields) {
      if (f.type === "INSTRUCTION" || !visible.has(f.id)) continue;
      const value = draftValue(draft, f);
      if (f.type === "FILE" || f.type === "IMAGE" || f.type === "DYNAMIC") {
        const meta =
          value && typeof value === "object"
            ? (value as {
                telegramFileId?: string;
                fileId?: string;
                kind?: "photo" | "document";
                contentType?: string;
                gridFsId?: string;
                storageId?: string;
                text?: string | null;
              })
            : null;
        const telegramFileId =
          meta?.telegramFileId ||
          meta?.fileId ||
          (typeof value === "string" && isTelegramFileId(value) ? value : "");
        const kind: "photo" | "document" =
          meta?.kind === "photo" || meta?.contentType === "photo" || f.type === "IMAGE" ? "photo" : "document";
        const gridFsId = meta?.gridFsId || meta?.storageId ? String(meta.gridFsId || meta.storageId) : undefined;
        if (telegramFileId || gridFsId) {
          lines.push(`${f.label}: ${kind === "photo" ? "📷 صورة مرفقة" : "📎 مرفق"}`);
          mediaPreview.push({
            label: f.label,
            telegramFileId,
            kind,
            gridFsId,
          });
        } else if (meta?.text) {
          lines.push(`${f.label}: ${meta.text}`);
        } else {
          const display = displayChoice(f, value) || "—";
          lines.push(`${f.label}: ${display}`);
        }
        continue;
      }
      const display = displayChoice(f, value) || "—";
      lines.push(`${f.label}: ${display}`);
    }

    await patch(botId, telegramUserId, { state: "REVIEW", draft, ...positionFields(fields, fields.length) });

    for (const media of mediaPreview) {
      await sendChatMedia(botId, chatId, media);
    }

    await TelegramService.sendMessage(
      botId,
      chatId,
      `مراجعة الشكوى\n\n${lines.join("\n") || "—"}\n\nهل تريد إرسال الشكوى؟`,
      kb([[{ text: "تأكيد", callback_data: "confirm:yes" }, { text: "إلغاء", callback_data: "confirm:no" }]]),
    );
  }

  static async onChoice(
    botId: string,
    from: From,
    chatId: number,
    state: Record<string, unknown>,
    data: string,
    source?: CallbackMessage,
  ) {
    const [kind, indexStr, optStr] = data.split(":");
    const index = Number(indexStr);
    const form = await loadForm(botId, from.id, state);
    if (!form) return;
    if (form.adopted === "legacy-resynced") {
      await TelegramService.sendMessage(botId, chatId, FORM_CHANGED_NOTICE);
      await this.askField(botId, from.id, chatId, String(state.requestTypeId), form.currentIndex);
      return;
    }
    const { fields, rules } = form;
    const field = fields[index];
    if (!field) return;
    let draft = { ...((form.state.draft as Record<string, unknown>) ?? {}) };
    const advance = async () => {
      draft = applyBranchingDraft(fields, rules, draft);
      const next = nextAskIndex(fields, rules, draft, index);
      await patch(botId, from.id, { draft, ...positionFields(fields, next) });
      await this.askField(botId, from.id, chatId, String(state.requestTypeId), next);
    };
    if (kind === "o") {
      const opt = field.options?.[Number(optStr)];
      if (!opt) return;
      writeDraft(draft, field, persistValue(field, opt.value));
      await revealChoice(botId, from, chatId, source, buttonLabel(data, source, opt.label));
      await advance();
      return;
    }
    if (kind === "c") {
      const opt = field.options?.[Number(optStr)];
      if (!opt) return;
      const current = draftValue(draft, field);
      const selected = new Set((Array.isArray(current) ? current : []) as string[]);
      if (selected.has(opt.value)) selected.delete(opt.value);
      else selected.add(opt.value);
      writeDraft(draft, field, [...selected]);
      await patch(botId, from.id, { draft });
      if (source?.message_id) {
        try {
          const edited = await TelegramService.editReplyMarkup(
            botId,
            chatId,
            source.message_id,
            kb(checkboxRows(field, index, selected)),
          );
          if (edited?.ok) return;
        } catch {
          /* send a fresh prompt */
        }
      }
      await this.askField(botId, from.id, chatId, String(state.requestTypeId), index);
      return;
    }
    if (kind === "d") {
      const current = draftValue(draft, field);
      const selected = (Array.isArray(current) ? current : []) as string[];
      if (field.required && selected.length === 0) {
        await TelegramService.sendMessage(botId, chatId, "يرجى اختيار خيار واحد على الأقل.");
        return;
      }
      writeDraft(draft, field, selected);
      await revealChoice(
        botId,
        from,
        chatId,
        source,
        selected.map((value) => optionLabel(field, value)).join("، ") || "—",
      );
      await advance();
      return;
    }
    if (kind === "y" || kind === "n") {
      writeDraft(draft, field, kind === "y");
      await revealChoice(botId, from, chatId, source, buttonLabel(data, source, kind === "y" ? "نعم" : "لا"));
      await advance();
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
    const form = await loadForm(botId, from.id, state);
    if (!form) {
      await TelegramService.sendMessage(botId, chatId, "هذا النوع من الشكاوى غير متاح حالياً.");
      return;
    }
    if (form.adopted === "legacy-resynced") {
      await TelegramService.sendMessage(botId, chatId, FORM_CHANGED_NOTICE);
      await this.askField(botId, from.id, chatId, String(state.requestTypeId), form.currentIndex);
      return;
    }
    const { fields, rules } = form;
    const index = form.currentIndex;
    const field = fields[index];
    if (!field) {
      await this.review(botId, from.id, chatId, String(state.requestTypeId));
      return;
    }
    let draft = { ...((form.state.draft as Record<string, unknown>) ?? {}) };
    const attachments = [...((form.state.attachments as string[]) ?? [])];
    const draftId = typeof form.state.draftId === "string" && form.state.draftId ? form.state.draftId : newDraftId();
    const goNext = async () => {
      draft = applyBranchingDraft(fields, rules, draft);
      const next = nextAskIndex(fields, rules, draft, index);
      await patch(botId, from.id, { draft, attachments, ...positionFields(fields, next) });
      await this.askField(botId, from.id, chatId, String(state.requestTypeId), next);
    };

    if (field.type === "SELECT" || field.type === "RADIO" || field.type === "CHECKBOX" || field.type === "CONFIRMATION") {
      const typed = msg?.text?.trim();
      if (typed && (field.type === "SELECT" || field.type === "RADIO")) {
        const opt = field.options?.find((o) => o.label === typed || o.value === typed);
        if (opt) {
          writeDraft(draft, field, persistValue(field, opt.value));
          await goNext();
          return;
        }
      }
      if (typed && field.type === "CONFIRMATION") {
        const yes = typed === "نعم" || /^yes$/i.test(typed);
        const no = typed === "لا" || /^no$/i.test(typed);
        if (yes || no) {
          writeDraft(draft, field, yes);
          await goNext();
          return;
        }
      }
      await this.askField(botId, from.id, chatId, String(state.requestTypeId), index);
      return;
    }

    if (field.type === "DYNAMIC") {
      const input = normalizeTelegramMessage(msg);
      if (!input || input.contentType === "unknown") {
        await TelegramService.sendMessage(botId, chatId, fieldAnswerHint("DYNAMIC") ?? "يمكنك الاجابة بمقطع صوتي او نص");
        return;
      }
      const answer = toDynamicAnswer(input);
      if (input.contentType === "voice" || input.contentType === "audio") {
        answer.transcript = { status: "pending", text: null };
      }
      writeDraft(draft, field, answer);
      const next = nextAskIndex(fields, rules, applyBranchingDraft(fields, rules, draft), index);
      await patch(botId, from.id, { draft, attachments, draftId, ...positionFields(fields, next) });
      if ((input.contentType === "voice" || input.contentType === "audio") && input.telegramFileId) {
        enqueueVoiceTranscript({
          botId,
          telegramUserId: from.id,
          draftId,
          fieldId: field.id,
          fieldName: field.name,
          fileId: input.telegramFileId,
        });
      }
      if (input.telegramFileId && input.kind) {
        void persistTelegramUpload({
          botId,
          telegramUserId: from.id,
          field,
          telegramFileId: input.telegramFileId,
          kind: input.kind === "photo" ? "photo" : input.kind,
          filename: input.filename,
          mimeType: input.mimeType,
          ownerId: `draft-${requestId}`,
        })
          .then(async (stored) => {
            await attachUploadToDraft({
              botId,
              telegramUserId: from.id,
              draftId,
              field,
              telegramFileId: input.telegramFileId!,
              gridFsId: stored.gridFsId,
              existingFileId: (existing) =>
                existing && typeof existing === "object"
                  ? String((existing as { fileId?: string; telegramFileId?: string }).fileId ?? (existing as { telegramFileId?: string }).telegramFileId ?? "")
                  : "",
              value: { ...answer, storageId: stored.gridFsId, fileId: stored.telegramFileId },
            });
            void ChatLogService.linkFile({
              botId,
              telegramUserId: from.id,
              telegramFileId: input.telegramFileId!,
              gridFsId: stored.gridFsId,
              filename: stored.filename,
            });
          })
          .catch((err) => {
            logJson("error", "telegram", "FILE_STORE_FAILED", {
              requestId,
              botId,
              field: field.name,
              error: err instanceof Error ? err.message : String(err),
            });
          });
      }
      await this.askField(botId, from.id, chatId, String(state.requestTypeId), next);
      return;
    }

    if (field.type === "FILE" || field.type === "IMAGE") {
      const fileId = msg?.document?.file_id ?? msg?.photo?.at(-1)?.file_id;
      if (!fileId) {
        await TelegramService.sendMessage(botId, chatId, "يرجى إرسال ملف أو صورة.");
        return;
      }
      const kind: "photo" | "document" = msg?.photo?.length ? "photo" : "document";
      const filename = msg?.document?.file_name ?? (kind === "photo" ? "photo.jpg" : null);
      writeDraft(draft, field, {
        telegramFileId: fileId,
        kind,
        gridFsId: null,
        filename,
      });

      draft = applyBranchingDraft(fields, rules, draft);
      const next = nextAskIndex(fields, rules, draft, index);
      await patch(botId, from.id, { draft, attachments, draftId, ...positionFields(fields, next) });

      void persistTelegramUpload({
        botId,
        telegramUserId: from.id,
        field,
        telegramFileId: fileId,
        kind,
        filename,
        mimeType: msg?.document?.mime_type ?? null,
        ownerId: `draft-${requestId}`,
      })
        .then(async (stored) => {
          await attachUploadToDraft({
            botId,
            telegramUserId: from.id,
            draftId,
            field,
            telegramFileId: fileId,
            gridFsId: stored.gridFsId,
            existingFileId: (existing) =>
              existing && typeof existing === "object"
                ? String((existing as { telegramFileId?: string }).telegramFileId ?? "")
                : String(existing ?? ""),
            value: stored,
          });
          void ChatLogService.linkFile({
            botId,
            telegramUserId: from.id,
            telegramFileId: fileId,
            gridFsId: stored.gridFsId,
            filename: stored.filename,
          });
        })
        .catch((err) => {
          logJson("error", "telegram", "FILE_STORE_FAILED", {
            requestId,
            botId,
            field: field.name,
            error: err instanceof Error ? err.message : String(err),
          });
        });

      await this.askField(botId, from.id, chatId, String(state.requestTypeId), next);
      return;
    }

    const value = msg?.text?.trim();
    const error = validateFieldValue(field, value);
    if (error) {
      await TelegramService.sendMessage(botId, chatId, error);
      return;
    }
    writeDraft(draft, field, persistValue(field, value));
    await goNext();
  }
}
