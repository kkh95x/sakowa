import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";

const db = vi.hoisted(() => {
  const store = new Map<string, Record<string, unknown>[]>();
  const structuredClone = <T>(value: T): T => {
    if (value && typeof value === "object") {
      if ((value as { _bsontype?: string })._bsontype === "ObjectId") return value;
      if (value instanceof Date) return new Date(value) as T;
      if (Array.isArray(value)) return value.map(structuredClone) as T;
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, structuredClone(v)])) as T;
    }
    return value;
  };
  const same = (a: unknown, b: unknown) => {
    if (a === null || a === undefined) return b === null || b === undefined;
    if (a instanceof Date) return b instanceof Date && a.getTime() === b.getTime();
    if (typeof a === "object") return String(a) === String(b);
    return a === b || String(a) === String(b);
  };
  const matches = (doc: Record<string, unknown>, filter: Record<string, unknown>) =>
    Object.entries(filter).every(([k, v]) => same(v, doc[k]));
  const docsOf = (name: string) => {
    if (!store.has(name)) store.set(name, []);
    return store.get(name)!;
  };
  const collection = (name: string) => {
    const docs = docsOf(name);
    const apply = (doc: Record<string, unknown>, update: Record<string, Record<string, unknown>>) => {
      Object.assign(doc, structuredClone(update.$set ?? {}));
      for (const [k, v] of Object.entries(update.$inc ?? {})) doc[k] = Number(doc[k] ?? 0) + Number(v);
    };
    return {
      insertOne: async (doc: Record<string, unknown>) => {
        const stored: Record<string, unknown> = { ...structuredClone(doc), _id: doc._id ?? new ObjectId() };
        docs.push(stored);
        return { insertedId: stored._id };
      },
      findOne: async (filter: Record<string, unknown>) => {
        const doc = docs.find((d) => matches(d, filter));
        return doc ? structuredClone(doc) : null;
      },
      updateOne: async (
        filter: Record<string, unknown>,
        update: Record<string, Record<string, unknown>>,
        options?: { upsert?: boolean },
      ) => {
        let doc = docs.find((d) => matches(d, filter));
        if (!doc && options?.upsert) {
          doc = { _id: new ObjectId(), ...structuredClone(filter), ...structuredClone(update.$setOnInsert ?? {}) };
          docs.push(doc);
        }
        if (!doc) return { matchedCount: 0 };
        apply(doc, update);
        return { matchedCount: 1 };
      },
      findOneAndUpdate: async (
        filter: Record<string, unknown>,
        update: Record<string, Record<string, unknown>>,
        options?: { upsert?: boolean },
      ) => {
        let doc = docs.find((d) => matches(d, filter));
        if (!doc && options?.upsert) {
          doc = { _id: new ObjectId(), ...structuredClone(filter) };
          docs.push(doc);
        }
        if (!doc) return null;
        apply(doc, update);
        return structuredClone(doc);
      },
      find: (filter: Record<string, unknown> = {}) => {
        const result = docs.filter((d) => matches(d, filter));
        const cursor = {
          sort: () => cursor,
          limit: () => cursor,
          skip: () => cursor,
          toArray: async () => structuredClone(result),
        };
        return cursor;
      },
      countDocuments: async (filter: Record<string, unknown> = {}) => docs.filter((d) => matches(d, filter)).length,
    };
  };
  return { store, collection, docsOf };
});

const tg = vi.hoisted(() => ({
  prompts: [] as { chatId: number; fieldId: string; extra?: { reply_markup?: { inline_keyboard: { callback_data: string }[][] } } }[],
  messages: [] as { chatId: number; text: string }[],
  uploads: [] as { fieldId: string; telegramFileId: string }[],
  deferUploads: false,
  pendingUploads: [] as { telegramFileId: string; finish: () => void }[],
}));

vi.mock("@/lib/db/client", () => ({
  collections: new Proxy({}, { get: (_t, key) => String(key) }),
  getDb: async () => ({ collection: db.collection }),
}));
vi.mock("@/lib/audit/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/storage/gridfs", () => ({ GridFSStorageService: { readBuffer: vi.fn(async () => null) } }));
vi.mock("@/lib/chat/chat-log-service", () => ({
  ChatLogService: { captureInbound: vi.fn(async () => undefined), linkFile: vi.fn(async () => undefined) },
}));
vi.mock("@/lib/notifications/notification-service", () => ({
  NotificationService: { notifyAdmins: vi.fn(async () => undefined), notifyAdminsNewOrder: vi.fn(async () => undefined) },
}));
vi.mock("@/lib/blocks/blocked-user-service", () => ({
  BlockedUserService: { isBlocked: vi.fn(async () => false) },
}));
vi.mock("@/lib/orders/persist-order-files", () => ({
  persistTelegramUpload: vi.fn((p: { field: { id: string }; telegramFileId: string; filename?: string | null }) => {
    tg.uploads.push({ fieldId: p.field.id, telegramFileId: p.telegramFileId });
    const stored = { gridFsId: `gfs-${p.telegramFileId}`, telegramFileId: p.telegramFileId, filename: p.filename ?? "f" };
    if (!tg.deferUploads) return Promise.resolve(stored);
    return new Promise((resolve) => tg.pendingUploads.push({ telegramFileId: p.telegramFileId, finish: () => resolve(stored) }));
  }),
  persistOrderFieldFiles: vi.fn(async (p: { fields: Record<string, unknown> }) => ({ fields: p.fields, attachments: [] })),
}));
vi.mock("@/lib/telegram/telegram-service", () => ({
  TelegramService: {
    answerCallback: vi.fn(async () => undefined),
    revealInlineChoice: vi.fn(async () => true),
    editReplyMarkup: vi.fn(async () => ({ ok: true })),
    notifyGroupNewOrder: vi.fn(async () => undefined),
    sendExistingPhoto: vi.fn(async () => undefined),
    sendExistingDocument: vi.fn(async () => undefined),
    sendMessage: vi.fn(async (_botId: string, chatId: number, text: string) => {
      tg.messages.push({ chatId, text });
    }),
    sendFieldPrompt: vi.fn(async (_botId: string, chatId: number, field: { id: string }, opts?: { extra?: never }) => {
      tg.prompts.push({ chatId, fieldId: field.id, extra: opts?.extra });
    }),
  },
}));

import { TelegramConversationService } from "../src/lib/telegram/conversation";
import { buildOrderFieldRows } from "../src/lib/orders/order-field-rows";
import { OrderService } from "../src/lib/orders/order-service";
import type { RequestField } from "../src/types";
import type { BranchingRule } from "../src/lib/requests/branching";

const BOT = new ObjectId().toHexString();
const TYPE = new ObjectId();
let updateId = 1;

function field(id: string, type: RequestField["type"] = "TEXT", extra: Partial<RequestField> = {}): RequestField {
  return { id, name: id.toLowerCase(), label: `Label ${id}`, type, required: true, sensitive: false, order: 0, active: true, options: [], ...extra };
}

async function seedType(fields: RequestField[], rules: BranchingRule[] = [], updatedAt = new Date()) {
  db.docsOf("requestTypes").push({
    _id: TYPE,
    botId: BOT,
    name: "شكوى اختبار",
    active: true,
    archivedAt: null,
    fields: fields.map((f, i) => ({ ...f, order: i })),
    branchingRules: rules,
    updatedAt,
  });
}

/** Mirrors RequestTypeService.updateFields: order = array index, updatedAt bumped. */
function adminSave(fields: RequestField[], rules?: BranchingRule[]) {
  const doc = db.docsOf("requestTypes").find((d) => String(d._id) === String(TYPE))!;
  doc.fields = structuredClone(fields).map((f, i) => ({ ...f, order: i }));
  if (rules) doc.branchingRules = rules;
  doc.updatedAt = new Date(Date.now() + 1000);
}

function liveFields() {
  return db.docsOf("requestTypes").find((d) => String(d._id) === String(TYPE))!.fields as RequestField[];
}

function reorder(ids: string[]) {
  const byId = new Map(liveFields().map((f) => [f.id, f]));
  adminSave(ids.map((id) => byId.get(id)!));
}

const user = (id: number) => ({ id, first_name: `U${id}`, is_bot: false });

async function send(uid: number, message: Record<string, unknown>) {
  await TelegramConversationService.process(BOT, {
    update_id: updateId++,
    message: { message_id: updateId, chat: { id: uid, type: "private" }, from: user(uid), date: 0, ...message },
  } as never);
}

const text = (uid: number, value: string) => send(uid, { text: value });

async function press(uid: number, data: string) {
  await TelegramConversationService.process(BOT, {
    update_id: updateId++,
    callback_query: { id: `cb${updateId}`, from: user(uid), data, message: { message_id: 1, chat: { id: uid, type: "private" } } },
  } as never);
}

const start = (uid: number) => text(uid, `/s_${TYPE.toHexString()}`);
const conversation = (uid: number) =>
  db.docsOf("telegramConversations").find((d) => d.telegramUserId === uid) as Record<string, unknown>;
const lastPrompt = (uid: number) => tg.prompts.filter((p) => p.chatId === uid).at(-1);
const asked = (uid: number) => tg.prompts.filter((p) => p.chatId === uid).map((p) => p.fieldId);
const lastMessage = (uid: number) => tg.messages.filter((m) => m.chatId === uid).at(-1)?.text ?? "";
const flush = () => new Promise((r) => setTimeout(r, 0));

function buttonFor(uid: number, label: string) {
  const prompt = lastPrompt(uid)!;
  const fieldDef = (conversation(uid).formSnapshot as { fields: RequestField[] }).fields.find((f) => f.id === prompt.fieldId)!;
  const idx = fieldDef.options!.findIndex((o) => o.label === label);
  return prompt.extra!.reply_markup!.inline_keyboard[idx][0].callback_data;
}

const ABCD = () => [field("A"), field("B"), field("C"), field("D")];

beforeEach(() => {
  db.store.clear();
  tg.prompts.length = 0;
  tg.messages.length = 0;
  tg.uploads.length = 0;
  tg.deferUploads = false;
  tg.pendingUploads.length = 0;
  db.docsOf("bots").push({ _id: new ObjectId(BOT), name: "bot" });
});

describe("Telegram conversation form integrity", () => {
  it("1. reorder after reaching B keeps B as the current question", async () => {
    await seedType(ABCD());
    await start(1);
    await text(1, "a1");
    expect(lastPrompt(1)?.fieldId).toBe("B");

    reorder(["A", "C", "B", "D"]);
    expect(conversation(1).currentFieldId).toBe("B");

    await text(1, "b1");
    const draft = conversation(1).draft as Record<string, unknown>;
    expect(draft.B).toBe("b1");
    expect(draft.C).toBeUndefined();
    expect(lastPrompt(1)?.fieldId).toBe("C");
    await text(1, "c1");
    expect(lastPrompt(1)?.fieldId).toBe("D");
    expect(asked(1)).toEqual(["A", "B", "C", "D"]);
  });

  it("2. adding a field does not change an existing conversation", async () => {
    await seedType(ABCD());
    await start(1);
    await text(1, "a1");
    adminSave([field("A"), field("E"), field("B"), field("C"), field("D")]);
    await text(1, "b1");
    await text(1, "c1");
    await text(1, "d1");
    expect(asked(1)).toEqual(["A", "B", "C", "D"]);
    expect(conversation(1).state).toBe("REVIEW");
    expect(conversation(1).currentFieldId).toBeNull();
  });

  it("3. removing / reordering unrelated fields keeps the active question", async () => {
    await seedType(ABCD());
    await start(1);
    await text(1, "a1");
    adminSave([field("D"), field("A"), field("B")]);
    expect(conversation(1).currentFieldId).toBe("B");
    await text(1, "b1");
    expect((conversation(1).draft as Record<string, unknown>).B).toBe("b1");
    expect(lastPrompt(1)?.fieldId).toBe("C");
  });

  it("4. branching still follows the conversation's own rules after a reorder", async () => {
    const q = field("Q", "RADIO", {
      options: [
        { label: "نعم", value: "yes" },
        { label: "لا", value: "no" },
      ],
    });
    const rules: BranchingRule[] = [
      { id: "r1", sourceFieldId: "Q", operator: "equals", value: "no", action: "goto", targetFieldId: "Z" },
    ];
    await seedType([q, field("X"), field("Y"), field("Z")], rules);
    await start(1);
    expect(lastPrompt(1)?.fieldId).toBe("Q");
    reorder(["Z", "Y", "X", "Q"]);
    await press(1, buttonFor(1, "لا"));
    expect((conversation(1).draft as Record<string, unknown>).Q).toBe("no");
    expect(lastPrompt(1)?.fieldId).toBe("Z");
    await text(1, "z1");
    expect(conversation(1).state).toBe("REVIEW");
    expect(asked(1)).toEqual(["Q", "Z"]);

    await start(2);
    expect(lastPrompt(2)?.fieldId).toBe("Z");
  });

  it("5. DYNAMIC answers land on the right field after a reorder", async () => {
    await seedType([field("A"), field("V", "DYNAMIC"), field("I", "DYNAMIC"), field("F", "DYNAMIC"), field("T", "DYNAMIC")]);
    await start(1);
    await text(1, "a1");
    reorder(["T", "F", "I", "V", "A"]);
    await send(1, { voice: { file_id: "voice-1", file_unique_id: "u1", duration: 3 } });
    reorder(["A", "I", "T", "V", "F"]);
    await send(1, { photo: [{ file_id: "photo-1", file_unique_id: "u2", width: 1, height: 1 }] });
    await send(1, { document: { file_id: "doc-1", file_unique_id: "u3", file_name: "a.pdf" } });
    await send(1, { text: "plain text" });
    await flush();

    const draft = conversation(1).draft as Record<string, Record<string, unknown>>;
    expect(draft.V.contentType).toBe("voice");
    expect(draft.V.storageId).toBe("gfs-voice-1");
    expect(draft.I.contentType).toBe("photo");
    expect(draft.I.storageId).toBe("gfs-photo-1");
    expect(draft.F.contentType).toBe("document");
    expect(draft.F.storageId).toBe("gfs-doc-1");
    expect(draft.T.contentType).toBe("text");
    expect(draft.T.text).toBe("plain text");
    expect(tg.uploads).toEqual([
      { fieldId: "V", telegramFileId: "voice-1" },
      { fieldId: "I", telegramFileId: "photo-1" },
      { fieldId: "F", telegramFileId: "doc-1" },
    ]);
    expect(conversation(1).state).toBe("REVIEW");
  });

  it("6. legacy index-only conversations are adopted without crashing", async () => {
    const t0 = new Date("2026-01-01T10:00:00Z");
    await seedType(ABCD(), [], t0);
    const legacy = (uid: number, fieldIndex: number, updatedAt: Date, draft: Record<string, unknown>) =>
      db.docsOf("telegramConversations").push({
        _id: new ObjectId(),
        botId: BOT,
        telegramUserId: uid,
        state: "WAITING_FOR_FIELD",
        requestTypeId: TYPE.toHexString(),
        fieldIndex,
        draft,
        attachments: [],
        updatedAt,
        expiresAt: null,
      });

    // Config unchanged since the user was asked: the stored index is still meaningful.
    legacy(1, 1, new Date("2026-01-01T11:00:00Z"), { A: "a1", a: "a1" });
    await text(1, "b1");
    expect((conversation(1).draft as Record<string, unknown>).B).toBe("b1");
    expect(lastPrompt(1)?.fieldId).toBe("C");
    expect(conversation(1).formSnapshot).toBeTruthy();

    // Config saved after the user was asked: the index is not trusted.
    reorder(["A", "C", "B", "D"]);
    legacy(2, 1, new Date("2026-01-01T11:00:00Z"), { A: "a2", a: "a2" });
    await text(2, "meant-for-B");
    const draft2 = conversation(2).draft as Record<string, unknown>;
    expect(draft2.C).toBeUndefined();
    expect(draft2.B).toBeUndefined();
    expect(tg.messages.some((m) => m.chatId === 2 && m.text.includes("تم تحديث نموذج"))).toBe(true);
    expect(conversation(2).currentFieldId).toBe("C");
    expect(lastPrompt(2)?.fieldId).toBe("C");
    await text(2, "c2");
    expect((conversation(2).draft as Record<string, unknown>).C).toBe("c2");
  });

  it("7 & 8. new conversations use the latest form while older ones keep theirs", async () => {
    await seedType(ABCD());
    await start(1);
    await text(1, "a1");
    reorder(["A", "C", "B", "D"]);
    await start(2);
    await text(2, "a2");
    await text(1, "b1");
    await text(2, "c2");
    await text(1, "c1");
    await text(2, "b2");
    await text(1, "d1");
    await text(2, "d2");
    expect(asked(1)).toEqual(["A", "B", "C", "D"]);
    expect(asked(2)).toEqual(["A", "C", "B", "D"]);
    for (const [uid, n] of [[1, "1"], [2, "2"]] as const) {
      const draft = conversation(uid).draft as Record<string, unknown>;
      expect([draft.A, draft.B, draft.C, draft.D]).toEqual([`a${n}`, `b${n}`, `c${n}`, `d${n}`]);
    }
  });

  it("9. full submission stores correct fields and clears the form", async () => {
    await seedType(ABCD());
    await start(1);
    await text(1, "a1");
    reorder(["D", "C", "B", "A"]);
    await text(1, "b1");
    await text(1, "c1");
    await text(1, "d1");
    await press(1, "confirm:yes");

    const orders = db.docsOf("orders");
    expect(orders).toHaveLength(1);
    expect(orders[0].fields).toEqual({ a: "a1", b: "b1", c: "c1", d: "d1" });
    expect(orders[0].orderNumber).toBe("SHK-00001");
    const c = conversation(1);
    expect(c.state).toBe("SUBMITTED");
    expect(c.formSnapshot).toBeNull();
    expect(c.currentFieldId).toBeNull();

    await press(1, "confirm:yes");
    await press(1, "y:0");
    expect(db.docsOf("orders")).toHaveLength(1);
    expect(lastMessage(1)).toContain("لم تعد قيد التعبئة");
  });

  it("stores a compact snapshot on the conversation document", async () => {
    await seedType(ABCD());
    await start(1);
    const c = conversation(1);
    const snap = c.formSnapshot as { requestTypeId: string; fields: RequestField[]; branchingRules: unknown[] };
    expect(snap.requestTypeId).toBe(TYPE.toHexString());
    expect(snap.fields.map((f) => f.id)).toEqual(["A", "B", "C", "D"]);
    expect(c.currentFieldId).toBe("A");
    expect(c.fieldIndex).toBe(0);
    expect(typeof c.draftId).toBe("string");
    console.log("conversation document:", JSON.stringify(c));
  });
});

const doc = (uid: number, fileId: string) =>
  send(uid, { document: { file_id: fileId, file_unique_id: `u-${fileId}`, file_name: `${fileId}.pdf` } });

async function finishUpload(fileId: string) {
  const pending = tg.pendingUploads.find((p) => p.telegramFileId === fileId)!;
  expect(pending).toBeTruthy();
  pending.finish();
  await flush();
  await flush();
}

function draftFiles(uid: number) {
  const c = conversation(uid);
  return { draft: (c.draft ?? {}) as Record<string, Record<string, unknown> | undefined>, attachments: (c.attachments ?? []) as string[] };
}

const fileForm = () => [field("A"), field("F", "FILE"), field("T")];

describe("late / stale Telegram uploads", () => {
  beforeEach(() => {
    tg.deferUploads = true;
  });

  it("1. upload → submit → upload finishes: nothing attaches afterwards", async () => {
    await seedType(fileForm());
    await start(1);
    await text(1, "a1");
    await doc(1, "doc-A");
    await text(1, "t1");
    await press(1, "confirm:yes");
    expect(db.docsOf("orders")).toHaveLength(1);
    await start(1);
    const newDraftId = conversation(1).draftId;

    await finishUpload("doc-A");
    const { draft, attachments } = draftFiles(1);
    expect(conversation(1).draftId).toBe(newDraftId);
    expect(draft.F).toBeUndefined();
    expect(attachments).toEqual([]);
    expect((db.docsOf("orders")[0].fields as Record<string, unknown>).f).toMatchObject({ telegramFileId: "doc-A" });
  });

  it("2. upload → cancel → new complaint → upload finishes: new draft untouched", async () => {
    await seedType(fileForm());
    await start(1);
    await text(1, "a1");
    await doc(1, "doc-A");
    await text(1, "/cancel");
    expect(conversation(1).draftId).toBeNull();
    await start(1);
    await text(1, "a2");

    await finishUpload("doc-A");
    const { draft, attachments } = draftFiles(1);
    expect(draft.F).toBeUndefined();
    expect(attachments).toEqual([]);
    expect(conversation(1).currentFieldId).toBe("F");
  });

  it("3. upload → restart (DYNAMIC field) → upload finishes: new draft untouched", async () => {
    await seedType([field("A"), field("V", "DYNAMIC"), field("T")]);
    await start(1);
    await text(1, "a1");
    await send(1, { voice: { file_id: "voice-A", file_unique_id: "uv", duration: 2 } });
    const firstDraftId = conversation(1).draftId;
    await start(1);
    expect(conversation(1).draftId).not.toBe(firstDraftId);

    await finishUpload("voice-A");
    const { draft, attachments } = draftFiles(1);
    expect(draft.V).toBeUndefined();
    expect(attachments).toEqual([]);
  });

  it("4. upload finishing before submit behaves as before", async () => {
    await seedType(fileForm());
    await start(1);
    await text(1, "a1");
    await doc(1, "doc-A");
    await finishUpload("doc-A");
    let files = draftFiles(1);
    expect(files.draft.F).toMatchObject({ gridFsId: "gfs-doc-A", telegramFileId: "doc-A" });
    expect(files.attachments).toEqual(["gfs-doc-A"]);

    await text(1, "t1");
    files = draftFiles(1);
    expect(files.draft.F).toMatchObject({ gridFsId: "gfs-doc-A" });
    expect((files.draft as Record<string, unknown>).T).toBe("t1");
    await press(1, "confirm:yes");
    const order = db.docsOf("orders")[0];
    expect((order.fields as Record<string, unknown>).f).toMatchObject({ gridFsId: "gfs-doc-A" });
    expect(order.attachments).toEqual(["gfs-doc-A"]);
  });

  it("5. simultaneous users never receive each other's uploads", async () => {
    await seedType(fileForm());
    await start(1);
    await start(2);
    await text(1, "a1");
    await text(2, "a2");
    await doc(1, "doc-U1");
    await doc(2, "doc-U2");
    await finishUpload("doc-U2");
    await finishUpload("doc-U1");
    expect(draftFiles(1).draft.F).toMatchObject({ gridFsId: "gfs-doc-U1" });
    expect(draftFiles(1).attachments).toEqual(["gfs-doc-U1"]);
    expect(draftFiles(2).draft.F).toMatchObject({ gridFsId: "gfs-doc-U2" });
    expect(draftFiles(2).attachments).toEqual(["gfs-doc-U2"]);
  });

  it("6. same user/bot/type: complaint A's upload cannot land in complaint B", async () => {
    await seedType(fileForm());
    await start(1);
    await text(1, "a1");
    await doc(1, "doc-A");
    await text(1, "t1");
    await press(1, "confirm:yes");

    await start(1);
    await text(1, "a2");
    await doc(1, "doc-B");
    await finishUpload("doc-A");
    expect(draftFiles(1).draft.F).toMatchObject({ telegramFileId: "doc-B", gridFsId: null });
    expect(draftFiles(1).attachments).toEqual([]);
    await finishUpload("doc-B");
    expect(draftFiles(1).draft.F).toMatchObject({ telegramFileId: "doc-B", gridFsId: "gfs-doc-B" });
    expect(draftFiles(1).attachments).toEqual(["gfs-doc-B"]);
  });

  it("a snapshot conversation without draftId gets one before its upload starts", async () => {
    await seedType(fileForm());
    await start(1);
    await text(1, "a1");
    const c = conversation(1);
    delete c.draftId;
    await doc(1, "doc-L");
    expect(typeof conversation(1).draftId).toBe("string");
    await finishUpload("doc-L");
    expect(draftFiles(1).draft.F).toMatchObject({ gridFsId: "gfs-doc-L" });
  });
});

describe("removed fields stay visible on completed complaints", () => {
  it("answer to a field removed mid-conversation is shown as historical", async () => {
    await seedType([field("A"), field("B", "TEXT", { label: "عدد الأولاد" }), field("C")]);
    await start(1);
    await text(1, "a1");
    adminSave([field("A"), field("C")]);
    await text(1, "4");
    await text(1, "c1");
    await press(1, "confirm:yes");

    const order = db.docsOf("orders")[0];
    expect(order.fields).toEqual({ a: "a1", b: "4", c: "c1" });
    const rows = buildOrderFieldRows(order.fields as Record<string, unknown>, liveFields(), order.formFields);
    expect(rows.map((r) => [r.key, r.label, r.answer.text, r.historical])).toEqual([
      ["a", "Label A", "a1", false],
      ["c", "Label C", "c1", false],
      ["b", "عدد الأولاد", "4", true],
    ]);
  });

  const formFields = [
    { id: "A", name: "a", label: "Label A", type: "TEXT", order: 0 },
    { id: "R", name: "r", label: "نعم أو لا", type: "RADIO", order: 1, options: [{ value: "no", label: "لا" }, { value: "yes", label: "نعم" }] },
    { id: "F", name: "f", label: "المرفق", type: "FILE", order: 2 },
    { id: "V", name: "v", label: "رسالة", type: "DYNAMIC", order: 3 },
    { id: "X", name: "x", label: "نص", type: "TEXT", order: 4 },
  ];
  const values = {
    a: "a1",
    r: "no",
    f: { telegramFileId: "tg-f", kind: "document", gridFsId: "gfs-f", filename: "a.pdf" },
    v: { inputType: "dynamic", contentType: "voice", fileId: "tg-v", storageId: "gfs-v", text: null },
    x: "free text",
  };

  it("renders removed text, option, attachment and DYNAMIC answers", () => {
    const rows = buildOrderFieldRows(structuredClone(values), [field("A")], formFields);
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(byKey.a.historical).toBe(false);
    expect(byKey.x).toMatchObject({ label: "نص", historical: true, answer: { kind: "text", text: "free text" } });
    expect(byKey.r).toMatchObject({ label: "نعم أو لا", historical: true, answer: { kind: "text", text: "لا" } });
    expect(byKey.f).toMatchObject({ label: "المرفق", historical: true, answer: { kind: "file", gridFsId: "gfs-f" } });
    expect(byKey.v).toMatchObject({ label: "رسالة", historical: true, answer: { kind: "audio", gridFsId: "gfs-v" } });
    expect(rows.map((r) => r.key)).toEqual(["a", "r", "f", "v", "x"]);
    expect(values.r).toBe("no");
  });

  it("older orders without formFields still show every stored answer", () => {
    const rows = buildOrderFieldRows({ a: "a1", gone: "kept" }, [field("A")]);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ key: "gone", label: "gone", historical: true, answer: { text: "kept" } });
  });

  it("answers of deactivated live fields are shown as historical, not dropped", () => {
    const rows = buildOrderFieldRows({ a: "a1", b: "b1" }, [field("A"), field("B", "TEXT", { active: false })]);
    expect(rows.find((r) => r.key === "b")).toMatchObject({ label: "Label B", historical: true });
  });
});

describe("inactive request types", () => {
  function setActive(active: boolean) {
    db.docsOf("requestTypes").find((d) => String(d._id) === String(TYPE))!.active = active;
  }

  it("an in-progress complaint can finish after the type is disabled; new ones cannot start", async () => {
    await seedType(ABCD());
    await start(1);
    await text(1, "a1");
    setActive(false);

    await start(2);
    expect(lastMessage(2)).toContain("غير متاح");
    expect(conversation(2)?.state).not.toBe("WAITING_FOR_FIELD");
    expect(conversation(2)?.formSnapshot ?? null).toBeNull();

    await text(1, "b1");
    await text(1, "c1");
    await text(1, "d1");
    await press(1, "confirm:yes");
    const orders = db.docsOf("orders");
    expect(orders).toHaveLength(1);
    expect(orders[0].fields).toEqual({ a: "a1", b: "b1", c: "c1", d: "d1" });
    expect(orders[0].status).toBe("PENDING");

    await start(1);
    expect(lastMessage(1)).toContain("غير متاح");
    expect(db.docsOf("orders")).toHaveLength(1);
  });
});

describe("Telegram complaint details use the order's stored formFields", () => {
  const yesNo = [
    { value: "yes", label: "نعم" },
    { value: "no", label: "لا" },
  ];
  const cities = [
    { value: "dam", label: "دمشق" },
    { value: "alp", label: "حلب" },
  ];
  const needs = [
    { value: "water", label: "ماء" },
    { value: "power", label: "كهرباء" },
    { value: "gas", label: "غاز" },
  ];
  const submittedForm = () => [
    field("A", "TEXT", { label: "الاسم" }),
    field("B", "NUMBER", { label: "عدد الأولاد" }),
    field("R", "RADIO", { label: "متزوج؟", options: yesNo }),
    field("S", "SELECT", { label: "المدينة", options: cities }),
    field("K", "CHECKBOX", { label: "الاحتياجات", options: needs }),
    field("F", "FILE", { label: "المرفق" }),
    field("V", "DYNAMIC", { label: "رسالة" }),
  ];

  const lastRowButton = (uid: number) => lastPrompt(uid)!.extra!.reply_markup!.inline_keyboard.at(-1)![0].callback_data;

  async function submitComplaint() {
    await seedType(submittedForm());
    await start(1);
    await text(1, "أحمد");
    await text(1, "4");
    await press(1, buttonFor(1, "نعم"));
    await press(1, buttonFor(1, "حلب"));
    await press(1, buttonFor(1, "ماء"));
    await press(1, buttonFor(1, "غاز"));
    await press(1, lastRowButton(1));
    await doc(1, "doc-F");
    await flush();
    await send(1, { voice: { file_id: "voice-V", file_unique_id: "uvv", duration: 2 } });
    await flush();
    await press(1, "confirm:yes");
    const orders = db.docsOf("orders");
    expect(orders).toHaveLength(1);
    return orders[0];
  }

  const telegramRows = (order: Record<string, unknown>) =>
    OrderService.summarizeSubmittedAnswers(OrderService.sanitizeOrder(order, []), liveFields());
  const shown = (order: Record<string, unknown>) => telegramRows(order).map((r) => `${r.label}: ${r.value}`);

  const expected = ["الاسم: أحمد", "عدد الأولاد: 4", "متزوج؟: نعم", "المدينة: حلب", "الاحتياجات: ماء، غاز", "المرفق: doc-F.pdf", "رسالة: voice.ogg"];

  it("8. current fields render exactly as before when nothing changed", async () => {
    const order = await submitComplaint();
    expect(shown(order)).toEqual(expected);
    expect(telegramRows(order)).toEqual(OrderService.summarizeFields(OrderService.sanitizeOrder(order, []), liveFields()));
  });

  it("1, 2, 10. a removed field keeps its answer and position", async () => {
    const order = await submitComplaint();
    adminSave(submittedForm().filter((f) => f.id !== "B"));
    expect(shown(order)).toEqual(expected);
    expect(shown(order)[1]).toBe("عدد الأولاد: 4");
  });

  it("2. stored order wins over a live reorder", async () => {
    const order = await submitComplaint();
    reorder(["V", "F", "K", "S", "R", "B", "A"]);
    expect(shown(order)).toEqual(expected);
  });

  it("3, 4, 5. RADIO / SELECT / CHECKBOX keep the labels stored at submission", async () => {
    const order = await submitComplaint();
    const renamed = submittedForm().map((f) =>
      f.options?.length ? { ...f, options: f.options.map((o) => ({ ...o, label: `${o.label} (معدّل)` })) } : f,
    );
    renamed[2].options![0].label = "نعم، متزوج";
    adminSave(renamed);
    expect(shown(order).slice(2, 5)).toEqual(["متزوج؟: نعم", "المدينة: حلب", "الاحتياجات: ماء، غاز"]);
    expect((order.fields as Record<string, unknown>).r).toBe("yes");
    expect((order.fields as Record<string, unknown>).k).toEqual(["water", "gas"]);
  });

  it("6, 7. attachment and DYNAMIC answers keep their file references", async () => {
    const order = await submitComplaint();
    adminSave([field("A", "TEXT", { label: "الاسم" })]);
    const rows = telegramRows(order);
    expect(rows.find((r) => r.fieldName === "f")).toMatchObject({ kind: "file", gridFsId: "gfs-doc-F", telegramFileId: "doc-F" });
    expect(rows.find((r) => r.fieldName === "v")).toMatchObject({ kind: "audio", gridFsId: "gfs-voice-V", telegramFileId: "voice-V" });
  });

  it("11. a field deactivated after submission stays visible", async () => {
    const order = await submitComplaint();
    adminSave(submittedForm().map((f) => (f.id === "B" || f.id === "F" ? { ...f, active: false } : f)));
    expect(shown(order)).toEqual(expected);
  });

  it("12. no live request-type edit changes an already submitted complaint", async () => {
    const order = await submitComplaint();
    const before = telegramRows(order);
    const snapshotOfOrder = structuredClone(order);
    adminSave(
      [field("Z", "TEXT", { label: "حقل جديد" }), ...submittedForm().reverse()].map((f) => ({
        ...f,
        label: `${f.label} *`,
        type: f.type === "FILE" ? "IMAGE" : f.type,
        options: f.options?.map((o) => ({ ...o, label: "?" })),
      })),
    );
    expect(telegramRows(order)).toEqual(before);
    adminSave([]);
    expect(telegramRows(order)).toEqual(before);
    expect(order).toEqual(snapshotOfOrder);
  });

  it("9. an old order without formFields keeps the live-field fallback", async () => {
    const order = await submitComplaint();
    delete order.formFields;
    expect(telegramRows(order)).toEqual(OrderService.summarizeFields(OrderService.sanitizeOrder(order, []), liveFields()));
    adminSave(submittedForm().filter((f) => f.id !== "B"));
    expect(shown(order)).not.toContain("عدد الأولاد: 4");
    expect(shown(order)).toHaveLength(expected.length - 1);
  });
});
