import fs from "fs";
import path from "path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";

const db = vi.hoisted(() => {
  const store = new Map<string, Record<string, unknown>[]>();
  const clone = <T,>(value: T): T => {
    if (value && typeof value === "object") {
      if ((value as { _bsontype?: string })._bsontype === "ObjectId") return value;
      if (value instanceof Date) return new Date(value) as T;
      if (Array.isArray(value)) return value.map(clone) as T;
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clone(v)])) as T;
    }
    return value;
  };
  const same = (a: unknown, b: unknown) => {
    if (a && typeof a === "object" && "$in" in (a as object)) {
      return ((a as { $in: unknown[] }).$in ?? []).some((v) => String(v) === String(b));
    }
    if (a === null || a === undefined) return b === null || b === undefined;
    return String(a) === String(b);
  };
  const matches = (doc: Record<string, unknown>, filter: Record<string, unknown>) =>
    Object.entries(filter).every(([k, v]) => same(v, doc[k]));
  const docsOf = (name: string) => {
    if (!store.has(name)) store.set(name, []);
    return store.get(name)!;
  };
  const collection = (name: string) => {
    const docs = docsOf(name);
    return {
      insertOne: async (doc: Record<string, unknown>) => {
        const stored = { ...clone(doc), _id: doc._id ?? new ObjectId() };
        docs.push(stored);
        return { insertedId: stored._id };
      },
      findOne: async (filter: Record<string, unknown>) => {
        const doc = docs.find((d) => matches(d, filter));
        return doc ? clone(doc) : null;
      },
      updateOne: async (filter: Record<string, unknown>, update: { $set?: Record<string, unknown> }) => {
        const doc = docs.find((d) => matches(d, filter));
        if (!doc) return { matchedCount: 0 };
        Object.assign(doc, clone(update.$set ?? {}));
        return { matchedCount: 1 };
      },
      find: (filter: Record<string, unknown> = {}) => {
        const result = docs.filter((d) => matches(d, filter));
        const cursor = {
          sort: () => cursor,
          limit: () => cursor,
          skip: () => cursor,
          project: () => cursor,
          toArray: async () => clone(result),
        };
        return cursor;
      },
    };
  };
  return { store, collection, docsOf };
});

const ADMIN_ID = vi.hoisted(() => "65f000000000000000000001");

const spies = vi.hoisted(() => ({
  audit: [] as Record<string, unknown>[],
  adminNotifications: [] as Record<string, unknown>[],
  userStatus: [] as unknown[][],
  groupStatus: [] as unknown[][],
  authError: null as string | null,
}));

vi.mock("@/lib/db/client", () => ({
  collections: new Proxy({}, { get: (_t, key) => String(key) }),
  getDb: async () => ({ collection: db.collection }),
}));
vi.mock("@/lib/audit/audit", () => ({
  audit: vi.fn(async (params: Record<string, unknown>) => {
    spies.audit.push(params);
  }),
}));
vi.mock("@/lib/storage/gridfs", () => ({ GridFSStorageService: { readBuffer: vi.fn(async () => null) } }));
vi.mock("@/lib/chat/chat-log-service", () => ({
  ChatLogService: { run: (_ctx: unknown, fn: () => Promise<unknown>) => fn() },
}));
vi.mock("@/lib/notifications/notification-service", () => ({
  NotificationService: {
    notifyAdmins: vi.fn(async (params: Record<string, unknown>) => {
      spies.adminNotifications.push(params);
      return [];
    }),
    notifyAdminsNewOrder: vi.fn(async () => undefined),
  },
}));
vi.mock("@/lib/telegram/telegram-service", () => ({
  TelegramService: {
    notifyUserStatus: vi.fn(async (...args: unknown[]) => {
      spies.userStatus.push(args);
    }),
    notifyGroupStatus: vi.fn(async (...args: unknown[]) => {
      spies.groupStatus.push(args);
    }),
  },
}));
vi.mock("@/lib/api/http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/api/http")>()),
  withAuth: vi.fn(async () => {
    if (spies.authError) throw new Error(spies.authError);
    return { id: ADMIN_ID, role: "ADMIN" };
  }),
}));

import { OrderService } from "../src/lib/orders/order-service";
import { POST as postStatus } from "../src/app/api/orders/[id]/status/route";
import {
  STATUS_ERROR_AR,
  TRANSITIONS,
  canTransition,
  statusChangeNotificationMessage,
  validateStatusChange,
} from "../src/lib/orders/complaint-status";
import { statusUpdateTelegramText } from "../src/lib/telegram/order-command";
import {
  StatusContextNotes,
  StatusHistoryItem,
  latestStatusContext,
} from "../src/components/orders/status-history";
import {
  StatusChangeFields,
  rejectionReasonError,
  statusChangePayload,
} from "../src/components/orders/status-change-dialog";

async function seedOrder(status = "PENDING", extra: Record<string, unknown> = {}) {
  const _id = new ObjectId();
  await db.collection("orders").insertOne({
    _id,
    orderNumber: `SHK-${String(db.docsOf("orders").length + 1).padStart(5, "0")}`,
    botId: "bot-1",
    requestTypeId: "rt-1",
    telegramUserId: 42,
    chatId: 42,
    status,
    fields: { note: "النت ضعيف" },
    formFields: [{ id: "note", name: "note", label: "الوصف", type: "TEXT" }],
    attachments: [],
    adminFields: { adminNotes: "ملاحظة داخلية سرية", attachmentFileId: null, attachmentFilename: null },
    ...extra,
  });
  return String(_id);
}

function orderDoc(id: string) {
  return db.docsOf("orders").find((d) => String(d._id) === id)!;
}

function historyOf(id: string) {
  return db.docsOf("orderStatusHistory").filter((h) => h.orderId === id);
}

function statusRequest(id: string, body: unknown) {
  return postStatus(
    new Request(`http://localhost/api/orders/${id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(() => {
  db.store.clear();
  spies.audit.length = 0;
  spies.adminNotifications.length = 0;
  spies.userStatus.length = 0;
  spies.groupStatus.length = 0;
  spies.authError = null;
  db.docsOf("users").push({ _id: new ObjectId(ADMIN_ID), displayName: "Admin", username: "admin" });
});

describe("transition rules", () => {
  it("defines exactly the complaint lifecycle", () => {
    expect(TRANSITIONS).toEqual({
      PENDING: ["REVIEWING", "REJECTED"],
      REVIEWING: ["IN_PROGRESS", "REJECTED"],
      IN_PROGRESS: ["RESOLVED"],
      RESOLVED: ["CLOSED"],
      REJECTED: [],
      CLOSED: [],
    });
  });

  it("rejects nonsensical transitions", () => {
    expect(canTransition("PENDING", "RESOLVED")).toBe(false);
    expect(canTransition("PENDING", "CLOSED")).toBe(false);
    expect(canTransition("IN_PROGRESS", "REJECTED")).toBe(false);
    expect(canTransition("IN_PROGRESS", "CLOSED")).toBe(false);
    expect(canTransition("REJECTED", "CLOSED")).toBe(false);
    expect(canTransition("CLOSED", "REVIEWING")).toBe(false);
    expect(canTransition("RESOLVED", "IN_PROGRESS")).toBe(false);
  });

  it("treats legacy COMPLETED/ARCHIVED as RESOLVED/CLOSED", () => {
    expect(canTransition("COMPLETED", "CLOSED")).toBe(true);
    expect(canTransition("ARCHIVED", "PENDING")).toBe(false);
  });

  it("validates input and keeps only the note that belongs to the target", () => {
    expect(validateStatusChange({ from: "PENDING", to: "BOGUS" })).toEqual({ ok: false, code: "INVALID_STATUS" });
    expect(validateStatusChange({ from: "PENDING", to: "PENDING" })).toEqual({ ok: false, code: "STATUS_UNCHANGED" });
    expect(validateStatusChange({ from: "PENDING", to: "REJECTED" })).toEqual({ ok: false, code: "REJECTION_REASON_REQUIRED" });
    expect(validateStatusChange({ from: "PENDING", to: "REJECTED", reason: "   \n " })).toEqual({
      ok: false,
      code: "REJECTION_REASON_REQUIRED",
    });
    expect(validateStatusChange({ from: "PENDING", to: "REJECTED", reason: " ab " })).toEqual({
      ok: false,
      code: "REJECTION_REASON_TOO_SHORT",
    });
    const resolved = validateStatusChange({
      from: "IN_PROGRESS",
      to: "RESOLVED",
      reason: "should be dropped",
      resolutionNote: "  تم الإصلاح  ",
      closingNote: "dropped",
    });
    expect(resolved).toEqual({ ok: true, from: "IN_PROGRESS", to: "RESOLVED", context: { resolutionNote: "تم الإصلاح" } });
    expect(validateStatusChange({ from: "RESOLVED", to: "CLOSED", closingNote: "x".repeat(2001) })).toEqual({
      ok: false,
      code: "STATUS_NOTE_TOO_LONG",
    });
  });
});

describe("OrderService.changeStatus", () => {
  it("PENDING → REVIEWING records history with actor and notifies once", async () => {
    const id = await seedOrder("PENDING");
    await OrderService.changeStatus({ orderId: id, next: "REVIEWING", actorId: ADMIN_ID });
    expect(orderDoc(id).status).toBe("REVIEWING");
    expect(historyOf(id)).toHaveLength(1);
    expect(historyOf(id)[0]).toMatchObject({ previousStatus: "PENDING", newStatus: "REVIEWING", changedBy: ADMIN_ID });
    expect(historyOf(id)[0].reason).toBeUndefined();
    expect(spies.adminNotifications).toHaveLength(1);
    expect(spies.userStatus).toHaveLength(1);
  });

  it("PENDING → REJECTED stores the trimmed reason in history and audit", async () => {
    const id = await seedOrder("PENDING");
    await OrderService.changeStatus({
      orderId: id,
      next: "REJECTED",
      actorId: ADMIN_ID,
      reason: "  الشكوى لا تدخل ضمن اختصاص الجهة  ",
    });
    expect(orderDoc(id).status).toBe("REJECTED");
    expect(historyOf(id)[0]).toMatchObject({
      previousStatus: "PENDING",
      newStatus: "REJECTED",
      reason: "الشكوى لا تدخل ضمن اختصاص الجهة",
    });
    const entry = spies.audit.find((a) => a.action === "ORDER_STATUS_CHANGED")!;
    expect(entry.metadata).toMatchObject({ from: "PENDING", to: "REJECTED", fromLabel: "قيد الانتظار", toLabel: "مرفوضة" });
    expect(entry.after).toMatchObject({ reason: "الشكوى لا تدخل ضمن اختصاص الجهة", status: "REJECTED" });
  });

  it("REVIEWING → IN_PROGRESS and REVIEWING → REJECTED are allowed", async () => {
    const a = await seedOrder("REVIEWING");
    await OrderService.changeStatus({ orderId: a, next: "IN_PROGRESS", actorId: ADMIN_ID });
    expect(orderDoc(a).status).toBe("IN_PROGRESS");
    const b = await seedOrder("REVIEWING");
    await OrderService.changeStatus({ orderId: b, next: "REJECTED", actorId: ADMIN_ID, reason: "مكررة" });
    expect(orderDoc(b).status).toBe("REJECTED");
  });

  it("IN_PROGRESS → RESOLVED persists the resolution note", async () => {
    const id = await seedOrder("IN_PROGRESS");
    await OrderService.changeStatus({
      orderId: id,
      next: "RESOLVED",
      actorId: ADMIN_ID,
      resolutionNote: "تم إصلاح المشكلة وإعادة تفعيل الخدمة",
    });
    expect(historyOf(id)[0]).toMatchObject({ newStatus: "RESOLVED", resolutionNote: "تم إصلاح المشكلة وإعادة تفعيل الخدمة" });
    expect(String(spies.adminNotifications[0].message)).toContain("ملاحظات الحل");
  });

  it("RESOLVED → CLOSED persists the closing note and archives without notifying", async () => {
    const id = await seedOrder("RESOLVED");
    await OrderService.changeStatus({
      orderId: id,
      next: "CLOSED",
      actorId: ADMIN_ID,
      closingNote: "تم التأكد من معالجة الطلب وإغلاق الشكوى",
    });
    expect(orderDoc(id).status).toBe("CLOSED");
    expect(orderDoc(id).archivedAt).toBeInstanceOf(Date);
    expect(historyOf(id)[0]).toMatchObject({ closingNote: "تم التأكد من معالجة الطلب وإغلاق الشكوى" });
    expect(spies.adminNotifications).toHaveLength(0);
    expect(spies.userStatus).toHaveLength(0);
  });

  it("closes a legacy COMPLETED complaint", async () => {
    const id = await seedOrder("COMPLETED");
    await OrderService.changeStatus({ orderId: id, next: "CLOSED", actorId: ADMIN_ID });
    expect(orderDoc(id).status).toBe("CLOSED");
    expect(historyOf(id)[0]).toMatchObject({ previousStatus: "RESOLVED", newStatus: "CLOSED" });
  });

  it("rejects invalid transitions without side effects", async () => {
    const id = await seedOrder("PENDING");
    await expect(OrderService.changeStatus({ orderId: id, next: "RESOLVED", actorId: ADMIN_ID })).rejects.toThrow(
      "INVALID_TRANSITION",
    );
    const rejected = await seedOrder("REJECTED");
    await expect(OrderService.changeStatus({ orderId: rejected, next: "CLOSED", actorId: ADMIN_ID })).rejects.toThrow(
      "INVALID_TRANSITION",
    );
    expect(orderDoc(id).status).toBe("PENDING");
    expect(db.docsOf("orderStatusHistory")).toHaveLength(0);
    expect(spies.adminNotifications).toHaveLength(0);
    expect(spies.audit).toHaveLength(0);
  });

  it("requires a non-blank rejection reason", async () => {
    const id = await seedOrder("PENDING");
    await expect(OrderService.changeStatus({ orderId: id, next: "REJECTED", actorId: ADMIN_ID })).rejects.toThrow(
      "REJECTION_REASON_REQUIRED",
    );
    await expect(
      OrderService.changeStatus({ orderId: id, next: "REJECTED", actorId: ADMIN_ID, reason: "   " }),
    ).rejects.toThrow("REJECTION_REASON_REQUIRED");
    expect(orderDoc(id).status).toBe("PENDING");
  });

  it("a duplicate submission does not create duplicate history or notifications", async () => {
    const id = await seedOrder("PENDING");
    await OrderService.changeStatus({ orderId: id, next: "REVIEWING", actorId: ADMIN_ID });
    await expect(OrderService.changeStatus({ orderId: id, next: "REVIEWING", actorId: ADMIN_ID })).rejects.toThrow(
      "STATUS_UNCHANGED",
    );
    expect(historyOf(id)).toHaveLength(1);
    expect(spies.adminNotifications).toHaveLength(1);
    expect(spies.userStatus).toHaveLength(1);
  });

  it("a concurrent submission that lost the race is refused", async () => {
    const id = await seedOrder("PENDING");
    const [first, second] = await Promise.allSettled([
      OrderService.changeStatus({ orderId: id, next: "REVIEWING", actorId: ADMIN_ID }),
      OrderService.changeStatus({ orderId: id, next: "REVIEWING", actorId: ADMIN_ID }),
    ]);
    const failure = [first, second].find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(["STATUS_CONFLICT", "STATUS_UNCHANGED"]).toContain((failure.reason as Error).message);
    const outcomes = [first.status, second.status].sort();
    expect(outcomes).toEqual(["fulfilled", "rejected"]);
    expect(historyOf(id)).toHaveLength(1);
    expect(spies.adminNotifications).toHaveLength(1);
  });

  it("uses a per-transition notification key so distinct transitions are not deduped", async () => {
    const id = await seedOrder("PENDING");
    await OrderService.changeStatus({ orderId: id, next: "REVIEWING", actorId: ADMIN_ID });
    await OrderService.changeStatus({ orderId: id, next: "IN_PROGRESS", actorId: ADMIN_ID });
    expect(spies.adminNotifications.map((n) => n.eventKey)).toEqual([
      `COMPLAINT_STATUS_CHANGED:${id}:PENDING:REVIEWING`,
      `COMPLAINT_STATUS_CHANGED:${id}:REVIEWING:IN_PROGRESS`,
    ]);
    expect(spies.adminNotifications[0].message).toBe(`#${orderDoc(id).orderNumber}\nقيد الانتظار ← قيد المراجعة`);
  });

  it("sends the rejection reason to Telegram but never internal notes", async () => {
    const id = await seedOrder("PENDING");
    await OrderService.changeStatus({
      orderId: id,
      next: "REJECTED",
      actorId: ADMIN_ID,
      reason: "خارج الاختصاص",
      message: "  نعتذر منك  ",
    });
    const [order, status, message, attachment, reason] = spies.userStatus[0];
    expect(status).toBe("REJECTED");
    expect(message).toBe("نعتذر منك");
    expect(attachment).toBeUndefined();
    expect(reason).toBe("خارج الاختصاص");
    expect((order as Record<string, unknown>).orderNumber).toBe(orderDoc(id).orderNumber);
    expect(spies.groupStatus[0].slice(1)).toEqual(["PENDING", "REJECTED", ADMIN_ID]);
  });

  it("keeps resolution notes internal to the dashboard", async () => {
    const id = await seedOrder("IN_PROGRESS");
    await OrderService.changeStatus({ orderId: id, next: "RESOLVED", actorId: ADMIN_ID, resolutionNote: "سر داخلي" });
    const args = spies.userStatus[0];
    expect(args[1]).toBe("RESOLVED");
    expect(args.slice(2)).toEqual([undefined, undefined, undefined]);
  });

  it("leaves admin notes untouched by status changes", async () => {
    const id = await seedOrder("IN_PROGRESS");
    await OrderService.changeStatus({ orderId: id, next: "RESOLVED", actorId: ADMIN_ID, resolutionNote: "تم الحل" });
    expect(orderDoc(id).adminFields).toEqual({
      adminNotes: "ملاحظة داخلية سرية",
      attachmentFileId: null,
      attachmentFilename: null,
    });
    expect(historyOf(id)[0].adminNotes).toBeUndefined();
  });

  it("statusHistory resolves actor names and keeps old records intact", async () => {
    const id = await seedOrder("REVIEWING");
    db.docsOf("orderStatusHistory").push(
      { _id: new ObjectId(), orderId: id, previousStatus: null, newStatus: "PENDING", changedBy: "TELEGRAM_USER", message: null, createdAt: new Date(1) },
      { _id: new ObjectId(), orderId: id, previousStatus: "PENDING", newStatus: "REVIEWING", changedBy: ADMIN_ID, message: "قديم", createdAt: new Date(2) },
    );
    const rows = await OrderService.statusHistory(id);
    expect(rows.map((r) => r.changedByName)).toEqual([null, "Admin"]);
    expect(rows[1]).toMatchObject({ message: "قديم", newStatus: "REVIEWING" });
  });
});

describe("POST /api/orders/[id]/status", () => {
  it("returns Arabic errors for a missing rejection reason", async () => {
    const id = await seedOrder("PENDING");
    const res = await statusRequest(id, { status: "REJECTED", reason: "   " });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "REJECTION_REASON_REQUIRED", message: STATUS_ERROR_AR.REJECTION_REASON_REQUIRED });
  });

  it("rejects unknown statuses and invalid transitions", async () => {
    const id = await seedOrder("PENDING");
    const bad = await statusRequest(id, { status: "DONE" });
    expect(bad.status).toBe(400);
    expect((await bad.json()).message).toBe(STATUS_ERROR_AR.INVALID_STATUS);
    const invalid = await statusRequest(id, { status: "CLOSED" });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: "INVALID_TRANSITION", message: STATUS_ERROR_AR.INVALID_TRANSITION });
  });

  it("refuses unauthenticated and unauthorized users before touching data", async () => {
    const id = await seedOrder("PENDING");
    spies.authError = "UNAUTHORIZED";
    const anon = await statusRequest(id, { status: "REVIEWING" });
    expect(anon.status).toBe(401);
    spies.authError = "FORBIDDEN";
    const forbidden = await statusRequest(id, { status: "REVIEWING" });
    expect(forbidden.status).toBe(403);
    expect((await forbidden.json()).message).toBe("لا تملك صلاحية تغيير حالة الشكوى.");
    expect(orderDoc(id).status).toBe("PENDING");
    expect(db.docsOf("orderStatusHistory")).toHaveLength(0);
  });

  it("applies a valid change end-to-end", async () => {
    const id = await seedOrder("IN_PROGRESS");
    const res = await statusRequest(id, { status: "RESOLVED", resolutionNote: "تم", reason: "ignored" });
    expect(res.status).toBe(200);
    expect(historyOf(id)[0]).toMatchObject({ resolutionNote: "تم" });
    expect(historyOf(id)[0].reason).toBeUndefined();
  });

  it("returns 404 in Arabic for a missing complaint", async () => {
    const res = await statusRequest(new ObjectId().toHexString(), { status: "REVIEWING" });
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe("الشكوى غير موجودة.");
  });
});

describe("Telegram status text", () => {
  it("keeps the existing format and adds the rejection reason", () => {
    expect(statusUpdateTelegramText({ orderNumber: "SHK-00001", status: "REVIEWING" })).toBe(
      "تحديث على شكواك\n#SHK-00001\nالحالة: قيد المراجعة",
    );
    expect(statusUpdateTelegramText({ orderNumber: "SHK-00001", status: "IN_PROGRESS", message: "نعمل عليها" })).toBe(
      "تحديث على شكواك\n#SHK-00001\nالحالة: قيد المعالجة\n\nنعمل عليها",
    );
    const rejected = statusUpdateTelegramText({ orderNumber: "SHK-00002", status: "REJECTED", reason: "خارج الاختصاص" });
    expect(rejected).toContain("الحالة: مرفوضة");
    expect(rejected).toContain("سبب الرفض:\nخارج الاختصاص");
  });

  it("uses the Arabic labels for every status", () => {
    const labels = ["قيد الانتظار", "قيد المراجعة", "قيد المعالجة", "تم الحل", "مغلقة", "مرفوضة"];
    ["PENDING", "REVIEWING", "IN_PROGRESS", "RESOLVED", "CLOSED", "REJECTED"].forEach((status, i) => {
      expect(statusUpdateTelegramText({ orderNumber: "X", status })).toContain(`الحالة: ${labels[i]}`);
    });
  });

  it("admin notification message is concise", () => {
    const text = statusChangeNotificationMessage({
      orderNumber: "SHK-00003",
      from: "PENDING",
      to: "REJECTED",
      context: { reason: "س".repeat(400) },
    });
    expect(text.startsWith("#SHK-00003\nقيد الانتظار ← مرفوضة\nسبب الرفض: ")).toBe(true);
    expect(text.length).toBeLessThan(220);
  });
});

describe("status history rendering", () => {
  const old = { previousStatus: "PENDING", newStatus: "COMPLETED", changedBy: "abc", message: "رسالة قديمة", createdAt: "2026-09-28T09:30:00Z" };

  it("renders old records without context fields", () => {
    const html = renderToStaticMarkup(<ol><StatusHistoryItem entry={old} last /></ol>);
    expect(html).toContain("تغيّرت الحالة إلى تم الحل");
    expect(html).toContain("رسالة قديمة");
    expect(html).not.toContain("سبب الرفض");
    expect(html).not.toContain("بواسطة");
  });

  it("renders the creation entry", () => {
    const html = renderToStaticMarkup(
      <ol><StatusHistoryItem entry={{ previousStatus: null, newStatus: "PENDING", changedBy: "TELEGRAM_USER", createdAt: "2026-09-28T09:30:00Z" }} last /></ol>,
    );
    expect(html).toContain("تم استلام الشكوى");
    expect(html).toContain("مقدم الشكوى");
  });

  it("renders actor, reason, resolution and closing notes", () => {
    const html = renderToStaticMarkup(
      <ol>
        <StatusHistoryItem entry={{ previousStatus: "REVIEWING", newStatus: "REJECTED", changedByName: "Admin", reason: "خارج الاختصاص", createdAt: "2026-09-28T09:45:00Z" }} last={false} />
        <StatusHistoryItem entry={{ previousStatus: "IN_PROGRESS", newStatus: "RESOLVED", resolutionNote: "تم الإصلاح", createdAt: "2026-09-28T10:00:00Z" }} last={false} />
        <StatusHistoryItem entry={{ previousStatus: "RESOLVED", newStatus: "CLOSED", closingNote: "أغلقت", createdAt: "2026-09-28T10:10:00Z" }} last />
      </ol>,
    );
    expect(html).toContain("بواسطة");
    expect(html).toContain("Admin");
    expect(html).toContain("سبب الرفض");
    expect(html).toContain("خارج الاختصاص");
    expect(html).toContain("ملاحظات الحل");
    expect(html).toContain("ملاحظات الإغلاق");
  });

  it("finds the context of the current status only", () => {
    const history = [
      { previousStatus: null, newStatus: "PENDING" },
      { previousStatus: "PENDING", newStatus: "REJECTED", reason: "سبب" },
    ];
    expect(latestStatusContext(history, "REJECTED")?.reason).toBe("سبب");
    expect(latestStatusContext(history.slice(0, 1), "PENDING")).toBeNull();
    expect(latestStatusContext([{ previousStatus: "PENDING", newStatus: "REVIEWING" }], "REVIEWING")).toBeNull();
    expect(renderToStaticMarkup(<StatusContextNotes entry={{}} />)).toBe("");
  });
});

describe("status change dialog", () => {
  const noop = () => undefined;
  const values = { reason: "", resolutionNote: "", closingNote: "", message: "" };
  const fields = (currentStatus: string, selected: Parameters<typeof StatusChangeFields>[0]["selected"], reasonError?: string) =>
    renderToStaticMarkup(
      <StatusChangeFields
        currentStatus={currentStatus}
        selected={selected}
        onSelect={noop}
        values={values}
        onValueChange={noop}
        file={null}
        onFileChange={noop}
        reasonError={reasonError}
      />,
    );

  it("offers only valid next statuses", () => {
    const html = fields("PENDING", null);
    expect(html).toContain('value="REVIEWING"');
    expect(html).toContain('value="REJECTED"');
    expect(html).not.toContain('value="RESOLVED"');
    expect(html).not.toContain('value="CLOSED"');
    expect(html).not.toContain("سبب الرفض");
    expect(fields("CLOSED", null)).toContain("هذه حالة نهائية");
    expect(fields("REJECTED", null)).not.toContain('type="radio"');
  });

  it("shows a required rejection reason for REJECTED", () => {
    const html = fields("REVIEWING", "REJECTED", STATUS_ERROR_AR.REJECTION_REASON_REQUIRED);
    expect(html).toContain("سبب الرفض");
    expect(html).toMatch(/id="status-reason"[^>]*required/);
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain(STATUS_ERROR_AR.REJECTION_REASON_REQUIRED);
  });

  it("shows resolution / closing notes only for their status", () => {
    const resolved = fields("IN_PROGRESS", "RESOLVED");
    expect(resolved).toContain("ملاحظات الحل");
    expect(resolved).not.toContain("ملاحظات الإغلاق");
    expect(resolved).toContain("status-message");
    const closed = fields("RESOLVED", "CLOSED");
    expect(closed).toContain("ملاحظات الإغلاق");
    expect(closed).not.toContain("status-message");
    expect(fields("PENDING", "REVIEWING")).not.toMatch(/ملاحظات الحل|ملاحظات الإغلاق|سبب الرفض/);
  });

  it("validates the reason client-side and sends only relevant notes", () => {
    expect(rejectionReasonError("   ")).toBe(STATUS_ERROR_AR.REJECTION_REASON_REQUIRED);
    expect(rejectionReasonError("ab")).toBe(STATUS_ERROR_AR.REJECTION_REASON_TOO_SHORT);
    expect(rejectionReasonError(" سبب كاف ")).toBeNull();
    const all = { reason: " r ", resolutionNote: " n ", closingNote: " c ", message: " m " };
    expect(statusChangePayload("REJECTED", all)).toEqual({ status: "REJECTED", reason: "r", message: "m" });
    expect(statusChangePayload("RESOLVED", all, "f1")).toEqual({ status: "RESOLVED", resolutionNote: "n", message: "m", attachmentFileId: "f1" });
    expect(statusChangePayload("CLOSED", all)).toEqual({ status: "CLOSED", closingNote: "c" });
    expect(statusChangePayload("REVIEWING", { ...all, message: "  " })).toEqual({ status: "REVIEWING" });
  });

  it("stays within narrow (390px) screens", () => {
    const html = fields("PENDING", "REJECTED");
    expect(html).not.toMatch(/\bw-\[\d/);
    expect(html).not.toMatch(/(^|\s)grid-cols-2/);
    expect(html).toContain("sm:grid-cols-2");
    const dialogSource = fs.readFileSync(path.join(__dirname, "../src/components/ui/dialog.tsx"), "utf8");
    expect(dialogSource).toContain("w-[min(100%-1.5rem,36rem)]");
  });
});
