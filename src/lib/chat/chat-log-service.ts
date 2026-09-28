import { AsyncLocalStorage } from "node:async_hooks";
import { ObjectId } from "mongodb";
import { collections, getDb } from "@/lib/db/client";
import { parseFieldAnswer, displayChoice } from "@/lib/orders/field-answer";
import { orderFieldDefinitions } from "@/lib/orders/order-field-rows";
import type { RequestField } from "@/types";

export type ChatActor = "user" | "bot" | "admin";
export type ChatKind = "text" | "photo" | "document" | "command";
export type ChatDirection = "in" | "out";

export type ChatMessage = {
  id: string;
  botId: string;
  telegramUserId: number;
  chatId: number;
  orderId?: string | null;
  direction: ChatDirection;
  actor: ChatActor;
  kind: ChatKind;
  text: string | null;
  sourceText?: string | null;
  filename: string | null;
  mimeType: string | null;
  gridFsId: string | null;
  telegramFileId: string | null;
  telegramMessageId?: number | null;
  createdAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  reconstructed?: boolean;
};

export function isStoredChatId(id: string) {
  return /^[a-f0-9]{24}$/i.test(String(id || "").trim());
}

function asObjectId(id: string) {
  return ObjectId.createFromHexString(String(id).trim());
}

export function chatTextFingerprint(message: {
  direction: ChatDirection;
  kind: ChatKind;
  text?: string | null;
  sourceText?: string | null;
}) {
  const text = (message.sourceText ?? message.text ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  const kind = message.kind === "command" ? "text" : message.kind;
  return `${message.direction}:${kind}:${text}`;
}

type ChatContext = {
  actor?: ChatActor;
  orderId?: string;
  gridFsId?: string;
};

const als = new AsyncLocalStorage<ChatContext>();

function serialize(doc: Record<string, unknown>, reconstructed = false): ChatMessage {
  return {
    id: String(doc._id ?? doc.id ?? ""),
    botId: String(doc.botId ?? ""),
    telegramUserId: Number(doc.telegramUserId),
    chatId: Number(doc.chatId),
    orderId: doc.orderId ? String(doc.orderId) : null,
    direction: (doc.direction as ChatDirection) ?? "out",
    actor: (doc.actor as ChatActor) ?? "bot",
    kind: (doc.kind as ChatKind) ?? "text",
    text: doc.text ? String(doc.text) : null,
    filename: doc.filename ? String(doc.filename) : null,
    mimeType: doc.mimeType ? String(doc.mimeType) : null,
    gridFsId: doc.gridFsId ? String(doc.gridFsId) : null,
    telegramFileId: doc.telegramFileId ? String(doc.telegramFileId) : null,
    telegramMessageId: Number.isFinite(Number(doc.telegramMessageId))
      ? Number(doc.telegramMessageId)
      : null,
    createdAt: new Date(String(doc.createdAt ?? Date.now())).toISOString(),
    editedAt: doc.editedAt ? new Date(String(doc.editedAt)).toISOString() : null,
    deletedAt: doc.deletedAt ? new Date(String(doc.deletedAt)).toISOString() : null,
    sourceText: doc.sourceText != null ? String(doc.sourceText) : null,
    reconstructed,
  };
}

function isPrivateChat(chatId: number) {
  return Number.isFinite(chatId) && chatId > 0;
}

function fileFingerprints(message: ChatMessage) {
  const keys: string[] = [];
  if (message.telegramFileId) keys.push(`tg:${message.direction}:${message.telegramFileId}`);
  if (message.gridFsId) keys.push(`fs:${message.direction}:${message.gridFsId}`);
  return keys;
}

function textFingerprint(message: ChatMessage) {
  return chatTextFingerprint(message);
}

function dedupeMessages(messages: ChatMessage[]) {
  const seenId = new Set<string>();
  const seenFile = new Set<string>();
  const out: ChatMessage[] = [];
  for (const message of messages) {
    if (message.id && seenId.has(message.id)) continue;
    const fileKeys = fileFingerprints(message);
    if (fileKeys.some((key) => seenFile.has(key))) continue;
    if (message.id) seenId.add(message.id);
    for (const key of fileKeys) seenFile.add(key);
    out.push(message);
  }
  return out;
}

export class ChatLogService {
  static run<T>(ctx: ChatContext, fn: () => Promise<T>): Promise<T> {
    return als.run(ctx, fn);
  }

  static async append(params: {
    botId: string;
    telegramUserId: number;
    chatId: number;
    direction: ChatDirection;
    actor?: ChatActor;
    kind?: ChatKind;
    text?: string | null;
    filename?: string | null;
    mimeType?: string | null;
    gridFsId?: string | null;
    telegramFileId?: string | null;
    telegramMessageId?: number | null;
    orderId?: string | null;
    createdAt?: Date;
  }) {
    if (!isPrivateChat(params.chatId)) return null;
    const ctx = als.getStore();
    const db = await getDb();
    const text = params.text?.trim() || null;
    const doc = {
      botId: params.botId,
      telegramUserId: params.telegramUserId,
      chatId: params.chatId,
      orderId: params.orderId ?? ctx?.orderId ?? null,
      direction: params.direction,
      actor: params.actor ?? ctx?.actor ?? (params.direction === "in" ? "user" : "bot"),
      kind: params.kind ?? "text",
      text,
      sourceText: text,
      filename: params.filename ?? null,
      mimeType: params.mimeType ?? null,
      gridFsId: params.gridFsId ?? ctx?.gridFsId ?? null,
      telegramFileId: params.telegramFileId ?? null,
      telegramMessageId: params.telegramMessageId ?? null,
      createdAt: params.createdAt ?? new Date(),
    };
    if (!doc.text && !doc.gridFsId && !doc.telegramFileId && !doc.filename) return null;
    const result = await db.collection(collections.telegramChatMessages).insertOne(doc);
    return { ...doc, _id: result.insertedId };
  }

  static async captureOutbound(params: {
    botId: string;
    chatId: number;
    kind?: ChatKind;
    text?: string | null;
    filename?: string | null;
    mimeType?: string | null;
    telegramFileId?: string | null;
    telegramMessageId?: number | null;
  }) {
    try {
      await this.append({
        ...params,
        telegramUserId: params.chatId,
        direction: "out",
      });
    } catch (err) {
      console.error("CHAT_LOG_OUTBOUND_FAILED", err);
    }
  }

  static async captureInbound(params: {
    botId: string;
    telegramUserId: number;
    chatId: number;
    text?: string | null;
    photoFileId?: string | null;
    documentFileId?: string | null;
    filename?: string | null;
    mimeType?: string | null;
    kind?: ChatKind;
  }) {
    try {
      const isPhoto = Boolean(params.photoFileId);
      const isDoc = Boolean(params.documentFileId);
      await this.append({
        botId: params.botId,
        telegramUserId: params.telegramUserId,
        chatId: params.chatId,
        direction: "in",
        actor: "user",
        kind: isPhoto ? "photo" : isDoc ? "document" : params.kind ?? "text",
        text: params.text,
        filename: params.filename ?? (isPhoto ? "photo.jpg" : null),
        mimeType: params.mimeType,
        telegramFileId: params.photoFileId ?? params.documentFileId ?? null,
      });
    } catch (err) {
      console.error("CHAT_LOG_INBOUND_FAILED", err);
    }
  }

  static async linkFile(params: {
    botId: string;
    telegramUserId: number;
    telegramFileId: string;
    gridFsId: string;
    filename?: string | null;
  }) {
    try {
      const db = await getDb();
      await db.collection(collections.telegramChatMessages).updateOne(
        {
          botId: params.botId,
          telegramUserId: params.telegramUserId,
          telegramFileId: params.telegramFileId,
          gridFsId: null,
        },
        {
          $set: {
            gridFsId: params.gridFsId,
            ...(params.filename ? { filename: params.filename } : {}),
          },
        },
      );
    } catch (err) {
      console.error("CHAT_LOG_LINK_FILE_FAILED", err);
    }
  }

  static reconstructFromOrder(params: {
    order: Record<string, unknown>;
    fields: RequestField[];
    history: Record<string, unknown>[];
    requestName?: string;
  }): ChatMessage[] {
    const orderId = String(params.order._id ?? params.order.id ?? "");
    const botId = String(params.order.botId ?? "");
    const telegramUserId = Number(params.order.telegramUserId);
    const chatId = Number(params.order.chatId ?? telegramUserId);
    const values = (params.order.fields as Record<string, unknown>) ?? {};
    const fieldValue = (field: RequestField) => {
      if (Object.prototype.hasOwnProperty.call(values, field.id)) return values[field.id];
      if (Object.prototype.hasOwnProperty.call(values, field.name)) return values[field.name];
      return undefined;
    };
    const createdRaw = params.order.createdAt;
    const created = createdRaw instanceof Date
      ? createdRaw.getTime()
      : new Date(String(createdRaw ?? Date.now())).getTime();
    const createdMs = Number.isFinite(created) ? created : Date.now();
    const defs = [...params.fields]
      .filter((f) => f.active !== false)
      .sort((a, b) => a.order - b.order);
    const messages: ChatMessage[] = [];
    let t = createdMs - (Math.max(defs.length, 1) + 1) * 45_000;

    const push = (
      partial: Pick<ChatMessage, "direction" | "actor" | "kind"> &
        Partial<Omit<ChatMessage, "createdAt">> & { createdAt: Date },
    ) => {
      messages.push({
        id: `rec-${orderId}-${messages.length}`,
        botId,
        telegramUserId,
        chatId,
        createdAt: partial.createdAt.toISOString(),
        reconstructed: true,
        orderId,
        filename: partial.filename ?? null,
        mimeType: partial.mimeType ?? null,
        gridFsId: partial.gridFsId ?? null,
        telegramFileId: partial.telegramFileId ?? null,
        text: partial.text ?? null,
        kind: partial.kind,
        direction: partial.direction,
        actor: partial.actor,
      });
    };

    if (params.requestName) {
      push({
        direction: "out",
        actor: "bot",
        kind: "text",
        text: "اختر نوع الشكوى:",
        createdAt: new Date(t),
      });
      t += 20_000;
      push({
        direction: "in",
        actor: "user",
        kind: "command",
        text: params.requestName,
        createdAt: new Date(t),
      });
      t += 20_000;
    }

    for (const field of defs) {
      const prompt = field.telegramMessage || field.label;
      if (field.type === "INSTRUCTION") {
        push({
          direction: "out",
          actor: "bot",
          kind: "text",
          text: prompt,
          createdAt: new Date(t),
        });
        t += 20_000;
        continue;
      }
      push({
        direction: "out",
        actor: "bot",
        kind: field.imageFileId ? "photo" : "text",
        text: prompt,
        gridFsId: field.imageFileId ?? null,
        createdAt: new Date(t),
      });
      t += 25_000;
      if (field.type === "FILE" || field.type === "IMAGE") {
        const answer = parseFieldAnswer(fieldValue(field), field.type);
        push({
          direction: "in",
          actor: "user",
          kind: answer.kind === "image" ? "photo" : "document",
          text: answer.filename || answer.text,
          filename: answer.filename ?? null,
          gridFsId: answer.gridFsId ?? null,
          telegramFileId: answer.telegramFileId ?? null,
          createdAt: new Date(t),
        });
      } else if (
        field.type === "SELECT" ||
        field.type === "RADIO" ||
        field.type === "CHECKBOX" ||
        field.type === "CONFIRMATION"
      ) {
        const text = displayChoice(field, fieldValue(field));
        if (text) {
          push({
            direction: "in",
            actor: "user",
            kind: "command",
            text,
            createdAt: new Date(t),
          });
        }
      } else {
        const answer = parseFieldAnswer(fieldValue(field), field.type);
        if (answer.kind !== "empty") {
          push({
            direction: "in",
            actor: "user",
            kind: "text",
            text: answer.text,
            createdAt: new Date(t),
          });
        }
      }
      t += 20_000;
    }

    push({
      direction: "in",
      actor: "user",
      kind: "command",
      text: "تأكيد",
      createdAt: new Date(t),
    });

    for (const row of params.history) {
      const text = row.message ? String(row.message) : "";
      const attachment = row.attachmentFileId ? String(row.attachmentFileId) : null;
      if (!text && !attachment) continue;
      push({
        direction: "out",
        actor: "admin",
        kind: attachment ? "document" : "text",
        text: text || null,
        gridFsId: attachment,
        createdAt: new Date(String(row.createdAt ?? t)),
      });
    }

    return messages;
  }

  static async listForOrder(
    order: Record<string, unknown>,
    fields: RequestField[],
    opts?: { before?: string | null; limit?: number; requestName?: string | null },
  ) {
    const db = await getDb();
    const botId = String(order.botId ?? "");
    const telegramUserId = Number(order.telegramUserId);
    const currentId = String(order._id ?? order.id ?? "");
    const limit = Math.min(500, Math.max(1, opts?.limit ?? 40));

    const stored = await db
      .collection(collections.telegramChatMessages)
      .find({
        botId,
        telegramUserId: { $in: [telegramUserId, String(telegramUserId)] },
      })
      .sort({ createdAt: -1 })
      .limit(2000)
      .toArray();
    stored.reverse();

    const userOrders: Record<string, unknown>[] = await db
      .collection(collections.orders)
      .find({
        botId,
        telegramUserId: { $in: [telegramUserId, String(telegramUserId)] },
      })
      .sort({ createdAt: -1 })
      .limit(30)
      .toArray();
    if (!userOrders.some((row) => String(row._id) === currentId)) {
      userOrders.unshift(order);
    }

    const typeIds = [
      ...new Set(
        userOrders
          .map((row) => String(row.requestTypeId ?? ""))
          .filter((id) => ObjectId.isValid(id) && String(new ObjectId(id)) === id),
      ),
    ];
    const types = typeIds.length
      ? await db
          .collection(collections.requestTypes)
          .find({ _id: { $in: typeIds.map((id) => new ObjectId(id)) } })
          .toArray()
      : [];
    const typeMap = new Map(types.map((row) => [String(row._id), row]));

    const orderIds = userOrders.map((row) => String(row._id ?? row.id ?? ""));
    const histories = await db
      .collection(collections.orderStatusHistory)
      .find({ orderId: { $in: orderIds } })
      .sort({ createdAt: 1 })
      .toArray();
    const historyByOrder = new Map<string, Record<string, unknown>[]>();
    for (const row of histories) {
      const key = String(row.orderId ?? "");
      const list = historyByOrder.get(key) ?? [];
      list.push(row as Record<string, unknown>);
      historyByOrder.set(key, list);
    }

    const reconstructed: ChatMessage[] = [];
    for (const row of [...userOrders].reverse()) {
      const id = String(row._id ?? row.id ?? "");
      const rt = typeMap.get(String(row.requestTypeId ?? ""));
      const orderFields = id === currentId ? fields : ((rt?.fields as RequestField[]) ?? []);
      const requestName =
        (rt?.name ? String(rt.name) : "") ||
        (id === currentId ? String(opts?.requestName || order.requestTypeName || "") : "");
      reconstructed.push(
        ...this.reconstructFromOrder({
          order: row,
          fields: orderFieldDefinitions(row as Record<string, unknown>, orderFields),
          history: historyByOrder.get(id) ?? [],
          requestName: requestName || undefined,
        }),
      );
    }

    const storedAll = stored.map((doc) => serialize(doc as Record<string, unknown>));
    const storedLive = dedupeMessages(storedAll.filter((m) => !m.deletedAt));
    const storedForMatch = dedupeMessages(storedAll);
    const remainingText = new Map<string, number>();
    const storedFiles = new Set(storedForMatch.flatMap(fileFingerprints));
    for (const message of storedForMatch) {
      const fp = textFingerprint(message);
      if (fp) remainingText.set(fp, (remainingText.get(fp) ?? 0) + 1);
    }
    const extra = reconstructed.filter((m) => {
      const files = fileFingerprints(m);
      if (files.some((key) => storedFiles.has(key))) return false;
      const fp = textFingerprint(m);
      if (fp) {
        const n = remainingText.get(fp) ?? 0;
        if (n > 0) {
          remainingText.set(fp, n - 1);
          return false;
        }
      }
      return true;
    });
    const hasStored = storedForMatch.length > 0;
    const all = dedupeMessages(
      [...(hasStored ? extra : reconstructed), ...storedLive].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    );

    const beforeMs = opts?.before ? new Date(opts.before).getTime() : Number.NaN;
    const filtered = Number.isFinite(beforeMs)
      ? all.filter((m) => new Date(m.createdAt).getTime() < beforeMs)
      : all;
    const hasOlder = filtered.length > limit;
    return { messages: hasOlder ? filtered.slice(-limit) : filtered, hasOlder };
  }

  static async getMessage(id: string) {
    if (!isStoredChatId(id)) return null;
    const db = await getDb();
    return db.collection(collections.telegramChatMessages).findOne({ _id: asObjectId(id) });
  }

  static async updateText(id: string, text: string) {
    const existing = await this.getMessage(id);
    if (!existing || existing.deletedAt) return false;
    const db = await getDb();
    const next = text.trim() || null;
    await db.collection(collections.telegramChatMessages).updateOne(
      { _id: asObjectId(id) },
      {
        $set: {
          text: next,
          editedAt: new Date(),
          ...(existing.sourceText != null ? {} : { sourceText: existing.text ?? next }),
        },
      },
    );
    return true;
  }

  static async softDelete(id: string) {
    const existing = await this.getMessage(id);
    if (!existing || existing.deletedAt) return false;
    const db = await getDb();
    await db.collection(collections.telegramChatMessages).updateOne(
      { _id: asObjectId(id) },
      { $set: { deletedAt: new Date() } },
    );
    return true;
  }
}
