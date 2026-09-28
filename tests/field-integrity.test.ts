import fs from "fs";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => {
  const collections = new Map<string, Map<string, Record<string, unknown>>>();
  const key = (id: unknown) => String(id);
  const clone = <T>(doc: T): T => {
    const { _id, ...rest } = doc as Record<string, unknown>;
    return { ...structuredClone(rest), _id } as T;
  };
  const collection = (name: string) => {
    if (!collections.has(name)) collections.set(name, new Map());
    const docs = collections.get(name)!;
    return {
      insertOne: async (doc: Record<string, unknown>) => {
        docs.set(key(doc._id), clone(doc));
        return { insertedId: doc._id };
      },
      findOne: async (filter: Record<string, unknown>) => {
        const doc = filter._id !== undefined ? docs.get(key(filter._id)) : undefined;
        return doc ? clone(doc) : null;
      },
      updateOne: async (filter: Record<string, unknown>, update: { $set?: Record<string, unknown> }) => {
        const doc = docs.get(key(filter._id));
        if (!doc) return { matchedCount: 0 };
        docs.set(key(filter._id), { ...doc, ...structuredClone(update.$set ?? {}) });
        return { matchedCount: 1 };
      },
    };
  };
  return { collections, collection };
});

vi.mock("@/lib/db/client", () => ({
  collections: { requestTypes: "requestTypes", auditLogs: "auditLogs", bots: "bots" },
  getDb: async () => ({ collection: db.collection }),
}));
vi.mock("@/lib/audit/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/storage/gridfs", () => ({ GridFSStorageService: { get: vi.fn(async () => null) } }));
vi.mock("@/lib/telegram/telegram-service", () => ({ TelegramService: { syncBotCommands: vi.fn(async () => undefined) } }));
vi.mock("@/lib/api/http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/api/http")>()),
  withAuth: vi.fn(async () => ({ id: "admin-1", role: "ADMIN" })),
}));

import { PUT as putFields } from "../src/app/api/request-types/[id]/fields/route";
import { RequestTypeService } from "../src/lib/requests/request-type-service";
import {
  nextAskIndex,
  validateBranchingConfig,
  visibleFields,
  type BranchingRule,
} from "../src/lib/requests/branching";
import {
  addOption,
  changeOptionValue,
  duplicateOptionValue,
  normalizeOptions,
  optionValueError,
  removeOption,
  renameOption,
  rulesUsingOption,
} from "../src/lib/requests/field-options";
import {
  askableFields,
  canMoveField,
  fieldsOnlyPayload,
  moveField,
  sortFieldsByOrder,
} from "../src/lib/requests/field-order";
import { displayChoice } from "../src/lib/orders/field-answer";
import { validateFieldValue } from "../src/lib/telegram/validate-field";
import { openComplaintActivityNotice } from "../src/lib/telegram/normalize-input";
import type { RequestField } from "../src/types";

function field(partial: Partial<RequestField> & Pick<RequestField, "id" | "name" | "label" | "type">): RequestField {
  return { required: false, sensitive: false, order: 0, active: true, options: [], ...partial };
}

function employeeFields(): RequestField[] {
  return [
    field({ id: "emp-name", name: "employee_name", label: "اسم الموظف", type: "TEXT", order: 0, required: true }),
    field({
      id: "married",
      name: "married",
      label: "هل أنت متزوج؟",
      type: "RADIO",
      order: 1,
      required: true,
      options: [
        { value: "yes", label: "نعم" },
        { value: "no", label: "لا" },
      ],
    }),
    field({ id: "children", name: "children_count", label: "عدد الأطفال", type: "NUMBER", order: 2, required: true }),
    field({ id: "desc", name: "description", label: "وصف الشكوى", type: "TEXTAREA", order: 3, required: true }),
    field({ id: "proof", name: "proof", label: "إثبات", type: "FILE", order: 4 }),
  ];
}

const marriedRule: BranchingRule = {
  id: "rule-married",
  sourceFieldId: "married",
  operator: "equals",
  value: "yes",
  action: "show",
  targetFieldId: "children",
};

function askSequence(fields: RequestField[], rules: BranchingRule[], answers: Record<string, unknown>) {
  const ordered = askableFields(fields);
  const names: string[] = [];
  let i = nextAskIndex(ordered, rules, answers, -1);
  while (i < ordered.length) {
    names.push(ordered[i].name);
    i = nextAskIndex(ordered, rules, answers, i);
  }
  return names;
}

async function legacySave(id: string, fields: RequestField[]) {
  const req = new Request("http://test/api/request-types/x/fields", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fieldsOnlyPayload(fields)),
  });
  return putFields(req, { params: Promise.resolve({ id }) });
}

async function reload(id: string) {
  const doc = await RequestTypeService.get(id);
  return {
    fields: sortFieldsByOrder((doc?.fields as RequestField[]) ?? []),
    rules: (doc?.branchingRules as BranchingRule[]) ?? [],
    doc,
  };
}

async function createEmployeeType(rules: BranchingRule[] = [marriedRule]) {
  const { id } = await RequestTypeService.create({
    name: "شكوى موظف",
    botId: "bot-1",
    description: "وصف",
    fields: employeeFields(),
    branchingRules: rules,
    active: false,
    telegramGroupId: "group-1",
    actorId: "admin-1",
  });
  return id;
}

beforeEach(() => {
  db.collections.clear();
});

describe("choice options: label/value separation", () => {
  const options = [
    { value: "yes", label: "نعم" },
    { value: "no", label: "لا" },
  ];

  it("editing a label keeps the stored value", () => {
    const next = renameOption(options, 0, "نعم، متزوج");
    expect(next[0]).toEqual({ label: "نعم، متزوج", value: "yes" });
    expect(next[1]).toBe(options[1]);
  });

  it("clearing and retyping a label never rewrites the value", () => {
    let next = renameOption(options, 0, "");
    next = renameOption(next, 0, "Yes please");
    expect(next[0].value).toBe("yes");
  });

  it("new options get a unique generated value and leave existing ones untouched", () => {
    const next = addOption(options, "ربما");
    expect(next.slice(0, 2)).toEqual(options);
    expect(next[2]).toEqual({ value: "option_3", label: "ربما" });
    expect(addOption(next)[3].value).toBe("option_4");
    expect(addOption([{ value: "option_2", label: "x" }])[1].value).toBe("option_3");
  });

  it("changing the internal value is explicit and validated", () => {
    expect(changeOptionValue(options, 0, "married_yes")?.[0]).toEqual({ value: "married_yes", label: "نعم" });
    expect(changeOptionValue(options, 0, "  ")).toBeNull();
    expect(changeOptionValue(options, 0, "no")).toBeNull();
    expect(optionValueError(options, 0, "yes")).toBeNull();
  });

  it("removing an option keeps the remaining values", () => {
    expect(removeOption(options, 0)).toEqual([{ value: "no", label: "لا" }]);
  });

  it("server normalization trims but preserves stored values", () => {
    expect(normalizeOptions([{ value: " yes ", label: " نعم " }])).toEqual([{ value: "yes", label: "نعم" }]);
    expect(normalizeOptions([{ value: "", label: "legacy" }])).toEqual([{ value: "legacy", label: "legacy" }]);
    expect(duplicateOptionValue([{ value: "a", label: "1" }, { value: "a", label: "2" }])).toBe("a");
  });

  it("counts branching rules that depend on an option", () => {
    const married = employeeFields()[1];
    expect(rulesUsingOption([marriedRule], married, options[0])).toBe(1);
    expect(rulesUsingOption([marriedRule], married, options[1])).toBe(0);
  });

  it("branching still matches the stored value after relabelling", () => {
    const fields = employeeFields();
    fields[1] = { ...fields[1], options: renameOption(fields[1].options!, 0, "نعم، متزوج") };
    expect(validateBranchingConfig(fields, [marriedRule])).toEqual([]);
    const shown = visibleFields(fields, [marriedRule], { married: "yes" }).map((f) => f.id);
    expect(shown).toContain("children");
    const hidden = visibleFields(fields, [marriedRule], { married: "no" }).map((f) => f.id);
    expect(hidden).not.toContain("children");
  });

  it("stored answers display the new label and typed labels still resolve", () => {
    const married = { ...employeeFields()[1] };
    married.options = renameOption(married.options!, 0, "نعم، متزوج");
    expect(displayChoice(married, "yes")).toBe("نعم، متزوج");
    expect(validateFieldValue(married, "نعم، متزوج")).toBeNull();
    expect(validateFieldValue(married, "yes")).toBeNull();
  });
});

describe("legacy builder (bot details) preserves branching rules", () => {
  it("create → save through legacy builder → reload keeps the rule", async () => {
    const id = await createEmployeeType();
    const before = await reload(id);
    const res = await legacySave(id, before.fields);
    expect(res.status).toBe(200);
    const after = await reload(id);
    expect(after.rules).toEqual([marriedRule]);
    expect(after.doc?.telegramGroupId).toBe("group-1");
    expect(after.doc?.description).toBe("وصف");
  });

  it("editing label/type/message/option label keeps rules and option values", async () => {
    const id = await createEmployeeType();
    const { fields } = await reload(id);
    const edited = fields.map((f) => {
      if (f.id === "desc") return { ...f, label: "تفاصيل", type: "TEXT" as const, telegramMessage: "اكتب التفاصيل" };
      if (f.id === "married") return { ...f, options: renameOption(f.options!, 0, "نعم، متزوج") };
      return f;
    });
    const res = await legacySave(id, edited);
    expect(res.status).toBe(200);
    const after = await reload(id);
    expect(after.rules).toEqual([marriedRule]);
    const married = after.fields.find((f) => f.id === "married")!;
    expect(married.options).toEqual([
      { value: "yes", label: "نعم، متزوج" },
      { value: "no", label: "لا" },
    ]);
    const desc = after.fields.find((f) => f.id === "desc")!;
    expect(desc).toMatchObject({ label: "تفاصيل", type: "TEXT", telegramMessage: "اكتب التفاصيل" });
  });

  it("the old label→value rewrite is rejected instead of silently breaking the rule", async () => {
    const id = await createEmployeeType();
    const { fields } = await reload(id);
    const rewritten = fields.map((f) =>
      f.id === "married" ? { ...f, options: [{ value: "متزوج", label: "متزوج" }, { value: "أعزب", label: "أعزب" }] } : f,
    );
    const res = await legacySave(id, rewritten);
    expect(res.status).toBe(400);
    const after = await reload(id);
    expect(after.rules).toEqual([marriedRule]);
    expect(after.fields.find((f) => f.id === "married")!.options![0].value).toBe("yes");
  });

  it("editing unrelated request-type properties never touches branching rules", async () => {
    const id = await createEmployeeType();
    await RequestTypeService.update(id, { name: "اسم جديد", description: "وصف جديد", actorId: "admin-1" });
    await RequestTypeService.linkGroup(id, null, "admin-1");
    await RequestTypeService.setActive(id, true, "admin-1");
    const after = await reload(id);
    expect(after.rules).toEqual([marriedRule]);
    expect(after.doc?.name).toBe("اسم جديد");
  });

  it("rejects duplicate option values", async () => {
    const id = await createEmployeeType([]);
    const { fields } = await reload(id);
    const dup = fields.map((f) =>
      f.id === "married" ? { ...f, options: [{ value: "yes", label: "نعم" }, { value: "yes", label: "أكيد" }] } : f,
    );
    const res = await legacySave(id, dup);
    expect(res.status).toBe(400);
  });
});

describe("field ordering", () => {
  const three = () => [
    field({ id: "a", name: "a", label: "A", type: "TEXT", order: 0 }),
    field({ id: "b", name: "b", label: "B", type: "TEXT", order: 1 }),
    field({ id: "c", name: "c", label: "C", type: "TEXT", order: 2 }),
  ];
  const ids = (fields: RequestField[]) => fields.map((f) => f.id);

  it("first field cannot move up and last cannot move down", () => {
    const fields = three();
    expect(canMoveField(fields, 0, -1)).toBe(false);
    expect(canMoveField(fields, 2, 1)).toBe(false);
    expect(moveField(fields, 0, -1)).toBe(fields);
    expect(moveField(fields, 2, 1)).toBe(fields);
  });

  it("moves first down and last up", () => {
    expect(ids(moveField(three(), 0, 1))).toEqual(["b", "a", "c"]);
    expect(ids(moveField(three(), 2, -1))).toEqual(["a", "c", "b"]);
  });

  it("moves a middle field in both directions and renumbers order", () => {
    const up = moveField(three(), 1, -1);
    expect(ids(up)).toEqual(["b", "a", "c"]);
    expect(up.map((f) => f.order)).toEqual([0, 1, 2]);
    const down = moveField(three(), 1, 1);
    expect(ids(down)).toEqual(["a", "c", "b"]);
    expect(down.map((f) => f.order)).toEqual([0, 1, 2]);
  });

  it("editors load fields by persisted order, not array position", () => {
    const shuffled = [three()[2], three()[0], three()[1]];
    expect(ids(sortFieldsByOrder(shuffled))).toEqual(["a", "b", "c"]);
  });

  it("reorder persists to the stored document and survives reload", async () => {
    const id = await createEmployeeType();
    let { fields } = await reload(id);
    fields = moveField(fields, 3, -1);
    fields = moveField(fields, 2, -1);
    expect(ids(fields)).toEqual(["emp-name", "desc", "married", "children", "proof"]);
    expect((await legacySave(id, fields)).status).toBe(200);
    const after = await reload(id);
    expect(ids(after.fields)).toEqual(["emp-name", "desc", "married", "children", "proof"]);
    expect(after.fields.map((f) => f.order)).toEqual([0, 1, 2, 3, 4]);
    expect(after.rules).toEqual([marriedRule]);
  });

  it("Telegram asks questions in the persisted order", async () => {
    const id = await createEmployeeType();
    let { fields } = await reload(id);
    fields = moveField(fields, 4, -1);
    fields = moveField(fields, 3, -1);
    fields = moveField(fields, 2, -1);
    fields = moveField(fields, 1, -1);
    await legacySave(id, fields);
    const stored = (await RequestTypeService.get(id))?.fields as RequestField[];
    const answers = { married: "yes" };
    expect(askSequence(stored, [marriedRule], answers)).toEqual([
      "proof",
      "employee_name",
      "married",
      "children_count",
      "description",
    ]);
  });

  it("branching and hidden fields keep working after reorder", async () => {
    const id = await createEmployeeType();
    let { fields } = await reload(id);
    fields = moveField(fields, 3, -1);
    await legacySave(id, fields);
    const { fields: stored, rules } = await reload(id);
    expect(askSequence(stored, rules, { married: "no" })).toEqual([
      "employee_name",
      "married",
      "description",
      "proof",
    ]);
    expect(askSequence(stored, rules, { married: "yes" })).toEqual([
      "employee_name",
      "married",
      "description",
      "children_count",
      "proof",
    ]);
    const inactive = stored.map((f) => (f.id === "proof" ? { ...f, active: false } : f));
    expect(askSequence(inactive, rules, { married: "no" })).toEqual(["employee_name", "married", "description"]);
  });

  it("a reorder that would make a goto rule point backwards is rejected", async () => {
    const goto: BranchingRule = {
      id: "rule-goto",
      sourceFieldId: "married",
      operator: "equals",
      value: "no",
      action: "goto",
      targetFieldId: "desc",
    };
    const id = await createEmployeeType([marriedRule, goto]);
    let { fields } = await reload(id);
    fields = moveField(fields, 3, -1);
    fields = moveField(fields, 2, -1);
    expect(ids(fields).indexOf("desc")).toBeLessThan(ids(fields).indexOf("married"));
    expect((await legacySave(id, fields)).status).toBe(400);
    const after = await reload(id);
    expect(ids(after.fields)).toEqual(["emp-name", "married", "children", "desc", "proof"]);
    expect(after.rules).toEqual([marriedRule, goto]);
  });
});

describe("notification Arabic encoding", () => {
  it("open-complaint activity notifications use real Arabic titles", () => {
    const text = openComplaintActivityNotice("SHK-00005", {
      contentType: "text",
      text: "مرحبا",
    } as never);
    expect(text).toMatchObject({
      type: "NEW_COMPLAINT_MESSAGE",
      title: "رسالة جديدة في شكوى",
      message: "SHK-00005: مرحبا",
    });
    const file = openComplaintActivityNotice("SHK-00005", {
      contentType: "document",
      telegramFileId: "f1",
    } as never);
    expect(file.type).toBe("NEW_COMPLAINT_ATTACHMENT");
    expect(file.title).toBe("مرفق جديد في شكوى");
    expect(openComplaintActivityNotice("SHK-1", null).message).toBe("SHK-1: رسالة");
  });

  it("survives JSON + UTF-8 SSE framing unchanged", () => {
    const payload = { items: [openComplaintActivityNotice("SHK-2", null)] };
    const frame = new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
    const decoded = JSON.parse(new TextDecoder().decode(frame).slice(6).trim());
    expect(decoded.items[0].title).toBe("رسالة جديدة في شكوى");
  });

  it("no source file contains Arabic literals with stripped high bytes", () => {
    const stripped = ["شكوى", "رسالة", "جديدة", "جديد", "مرفق", "الشكوى"].map((w) =>
      [...w].map((c) => String.fromCharCode(c.charCodeAt(0) & 0xff)).join(""),
    );
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        return e.isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : [];
      });
    const offenders = walk(path.resolve(__dirname, "../src")).flatMap((file) => {
      const source = fs.readFileSync(file, "utf8");
      return stripped.filter((s) => source.includes(`"${s}`) || source.includes(` ${s} `)).map((s) => `${file}: ${s}`);
    });
    expect(offenders).toEqual([]);
  });
});
