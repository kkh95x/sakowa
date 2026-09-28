import { describe, expect, it } from "vitest";
import {
  BranchingEngine,
  matchCondition,
  nextAskIndex,
  pruneHiddenAnswers,
  validateBranchingConfig,
  validateVisibleAnswers,
  visibleFields,
  type BranchingRule,
} from "../src/lib/requests/branching";
import {
  dynamicAnswerHasContent,
  normalizeTelegramMessage,
  toDynamicAnswer,
} from "../src/lib/telegram/normalize-input";
import {
  canTransition,
  formatComplaintNumber,
  parseComplaintSeq,
  statusMongoQuery,
} from "../src/lib/orders/complaint-status";
import { OrderFilterBuilder } from "../src/lib/orders/filter-builder";
import { parseFieldAnswer } from "../src/lib/orders/field-answer";
import { adminRecipientQuery, complaintNotificationUrl, notificationDedupeWindowMs } from "../src/lib/notifications/notification-service";
import { isPersistableFileField, persistOrderFieldFiles } from "../src/lib/orders/persist-order-files";
import type { RequestField } from "../src/types";

function field(partial: Partial<RequestField> & Pick<RequestField, "id" | "name" | "label" | "type">): RequestField {
  return {
    required: false,
    sensitive: false,
    order: 0,
    active: true,
    options: [],
    ...partial,
  };
}

const married = field({
  id: "married",
  name: "married",
  label: "هل أنت متزوج؟",
  type: "RADIO",
  required: true,
  order: 0,
  options: [
    { value: "yes", label: "نعم" },
    { value: "no", label: "لا" },
  ],
});
const children = field({
  id: "children",
  name: "children_count",
  label: "عدد الأولاد",
  type: "NUMBER",
  required: true,
  order: 1,
});
const proof = field({
  id: "proof",
  name: "proof",
  label: "أرسل ما يثبت الشكوى",
  type: "DYNAMIC",
  required: true,
  order: 2,
});

const showChildren: BranchingRule = {
  id: "show-children",
  sourceFieldId: "married",
  operator: "equals",
  value: "yes",
  action: "show",
  targetFieldId: "children",
};

describe("complaint numbers", () => {
  it("formats SHK-00001 atomically from the sequence", () => {
    expect(formatComplaintNumber(1)).toBe("SHK-00001");
    expect(formatComplaintNumber(12)).toBe("SHK-00012");
    expect(parseComplaintSeq("SHK-00012")).toBe(12);
    expect(parseComplaintSeq("ORD-00012")).toBe(12);
  });
});

describe("complaint status transitions", () => {
  it("follows the complaint lifecycle", () => {
    expect(canTransition("PENDING", "REVIEWING")).toBe(true);
    expect(canTransition("REVIEWING", "IN_PROGRESS")).toBe(true);
    expect(canTransition("IN_PROGRESS", "RESOLVED")).toBe(true);
    expect(canTransition("RESOLVED", "CLOSED")).toBe(true);
    expect(canTransition("PENDING", "REJECTED")).toBe(true);
    expect(canTransition("REVIEWING", "REJECTED")).toBe(true);
    expect(canTransition("IN_PROGRESS", "REJECTED")).toBe(false);
    expect(canTransition("CLOSED", "PENDING")).toBe(false);
  });

  it("maps legacy completed/archived in queries", () => {
    expect(statusMongoQuery("RESOLVED")).toEqual({ $in: ["RESOLVED", "COMPLETED"] });
    expect(statusMongoQuery("CLOSED")).toEqual({ $in: ["CLOSED", "ARCHIVED"] });
  });
});

describe("dynamic telegram input", () => {
  it("normalizes text", () => {
    const input = normalizeTelegramMessage({ text: "وصف الشكوى" });
    expect(input?.contentType).toBe("text");
    expect(toDynamicAnswer(input!).text).toBe("وصف الشكوى");
  });

  it("normalizes image, voice, document and video", () => {
    expect(normalizeTelegramMessage({ photo: [{ file_id: "p1" }] })?.contentType).toBe("photo");
    expect(normalizeTelegramMessage({ voice: { file_id: "v1", mime_type: "audio/ogg" } })?.contentType).toBe("voice");
    expect(normalizeTelegramMessage({ document: { file_id: "d1", file_name: "a.pdf" } })?.contentType).toBe("document");
    expect(normalizeTelegramMessage({ video: { file_id: "vid", mime_type: "video/mp4" } })?.contentType).toBe("video");
  });

  it("stores a normalized dynamic answer", () => {
    const answer = toDynamicAnswer(normalizeTelegramMessage({ voice: { file_id: "voice-1" } })!);
    expect(answer.inputType).toBe("dynamic");
    expect(answer.contentType).toBe("voice");
    expect(answer.fileId).toBe("voice-1");
    expect(dynamicAnswerHasContent(answer)).toBe(true);
    const parsed = parseFieldAnswer(answer, "DYNAMIC");
    expect(parsed.kind).toBe("audio");
  });
});

describe("branching engine", () => {
  it("hides required children until married=yes", () => {
    const hidden = visibleFields([married, children, proof], [showChildren], { married: "no" });
    expect(hidden.map((f) => f.id)).toEqual(["married", "proof"]);
    const shown = visibleFields([married, children, proof], [showChildren], { married: "yes" });
    expect(shown.map((f) => f.id)).toEqual(["married", "children", "proof"]);
  });

  it("does not require hidden fields", () => {
    const result = validateVisibleAnswers({
      fields: [married, children, proof],
      rules: [showChildren],
      answers: {
        married: "no",
        proof: toDynamicAnswer(normalizeTelegramMessage({ text: "دليل" })!),
      },
    });
    expect(result.ok).toBe(true);
    expect(result.answers.children_count).toBeUndefined();
    expect(result.answers.children).toBeUndefined();
  });

  it("requires children when the show rule matches", () => {
    const result = validateVisibleAnswers({
      fields: [married, children, proof],
      rules: [showChildren],
      answers: { married: "yes", proof: "x" },
    });
    expect(result.ok).toBe(false);
  });

  it("clears children after changing married to no", () => {
    const pruned = pruneHiddenAnswers(
      [married, children, proof],
      [showChildren],
      { married: "no", children: 3, children_count: 3, proof: "x" },
    );
    expect(pruned.children).toBeUndefined();
    expect(pruned.children_count).toBeUndefined();
    expect(pruned.married).toBe("no");
  });

  it("supports nested show rules", () => {
    const extra = field({ id: "extra", name: "extra", label: "تفاصيل", type: "TEXT", required: true, order: 3 });
    const nested: BranchingRule = {
      id: "nested",
      sourceFieldId: "children",
      operator: "equals",
      value: "2",
      action: "show",
      targetFieldId: "extra",
    };
    const visible = visibleFields(
      [married, children, proof, extra],
      [showChildren, nested],
      { married: "yes", children: 2 },
    );
    expect(visible.map((f) => f.id)).toContain("extra");
    const skipped = visibleFields(
      [married, children, proof, extra],
      [showChildren, nested],
      { married: "yes", children: 1 },
    );
    expect(skipped.map((f) => f.id)).not.toContain("extra");
  });

  it("rejects invalid configuration", () => {
    const cycle: BranchingRule = {
      id: "cycle",
      sourceFieldId: "children",
      operator: "is_not_empty",
      action: "show",
      targetFieldId: "married",
    };
    const errors = validateBranchingConfig([married, children], [showChildren, cycle]);
    expect(errors.some((e) => e.code === "SHOW_CYCLE")).toBe(true);
    const missing = validateBranchingConfig([married], [showChildren]);
    expect(missing.some((e) => e.code === "MISSING_TARGET")).toBe(true);
  });

  it("compares selectable fields by option value not label", () => {
    expect(matchCondition(married, "yes", "equals", "yes")).toBe(true);
    expect(matchCondition(married, "نعم", "equals", "yes")).toBe(true);
  });

  it("asks the next visible field after an answer", () => {
    const nextNo = nextAskIndex([married, children, proof], [showChildren], { married: "no" }, 0);
    expect([married, children, proof][nextNo]?.id).toBe("proof");
    const nextYes = nextAskIndex([married, children, proof], [showChildren], { married: "yes" }, 0);
    expect([married, children, proof][nextYes]?.id).toBe("children");
  });

  it("exposes evaluate() for telegram and server validation", () => {
    const result = BranchingEngine.evaluate({
      fields: [married, children, proof],
      rules: [showChildren],
      answers: { married: "no" },
      currentField: married,
    });
    expect(result.visibleIds.has("children")).toBe(false);
    expect(result.requiredIds.has("children")).toBe(false);
  });
});

describe("notification helpers", () => {
  it("includes super admins as recipients", () => {
    expect(adminRecipientQuery()).toEqual({
      role: { $in: ["ADMIN", "SUPER_ADMIN"] },
      status: "ACTIVE",
    });
  });

  it("builds complaint deep links", () => {
    expect(complaintNotificationUrl("abc")).toBe("/complaints/abc");
    expect(notificationDedupeWindowMs()).toBe(5000);
  });
});

describe("order file persistence", () => {
  const def = (type: RequestField["type"]) => ({ id: type, name: type, label: type, type }) as RequestField;

  it("keeps plain text and choice answers untouched", async () => {
    const answers = { TEXT: "النت ضعيف", RADIO: "yes", NUMBER: "3", CHECKBOX: ["a", "b"] };
    const out = await persistOrderFieldFiles({
      botId: "b",
      orderId: "o",
      telegramUserId: 1,
      fields: answers,
      fieldDefs: [def("TEXT"), def("RADIO"), def("NUMBER"), def("CHECKBOX")],
    });
    expect(out.fields).toEqual(answers);
    expect(out.attachments).toEqual([]);
  });

  it("only treats file-shaped values as Telegram files", () => {
    expect(isPersistableFileField(def("TEXT"), "AgACAgQAAxkBAAMTarpbL7bjP85fJFefup4g")).toBe(false);
    expect(isPersistableFileField(def("TEXT"), { telegramFileId: "AgACAgQAAxkBAAMTarpbL7bjP85fJFefup4g" })).toBe(true);
    expect(isPersistableFileField(def("FILE"), "anything")).toBe(true);
  });
});

describe("mongo filter injection", () => {
  it("rejects $where, $function and dotted paths", () => {
    expect(OrderFilterBuilder.build([{ field: "$where", operator: "eq", value: "1" }])).toEqual({});
    expect(OrderFilterBuilder.build([{ field: "$function", operator: "eq", value: "1" }])).toEqual({});
    expect(OrderFilterBuilder.build([{ field: "email.$ne", operator: "eq", value: "x" }])).toEqual({});
  });
});
