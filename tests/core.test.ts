import { describe, expect, it } from "vitest";
import { OrderFilterBuilder } from "../src/lib/orders/filter-builder";
import { OrderService, OrderStatusService } from "../src/lib/orders/order-service";
import { parseFieldAnswer, displayChoice } from "../src/lib/orders/field-answer";
import { resolveUploadMime, isAllowedUpload } from "../src/lib/storage/mime";
import { normalizeTelegramFilePath, pinnedTelegramIp } from "../src/lib/telegram/api";
import { duplicateFieldNames, ensureUniqueFieldNames, nextFieldName } from "../src/lib/requests/field-names";
import { callbackButtonLabel, isSlashCommand } from "../src/lib/chat/callback-label";
import { ChatLogService, chatTextFingerprint } from "../src/lib/chat/chat-log-service";
import { sanitizeAuditValue, toAuditSnapshot } from "../src/lib/audit/audit";

describe("OrderFilterBuilder", () => {
  it("builds safe equality filters", () => {
    const q = OrderFilterBuilder.build([{ field: "email", operator: "eq", value: "a@b.com" }]);
    expect(q).toEqual({ $and: [{ "fields.email": "a@b.com" }] });
  });

  it("rejects operator injection via field names", () => {
    const q = OrderFilterBuilder.build([{ field: "$where", operator: "eq", value: "1" }]);
    expect(q).toEqual({});
  });
});

describe("OrderStatusService", () => {
  it("allows pending to reviewing", () => {
    expect(OrderStatusService.canTransition("PENDING", "REVIEWING")).toBe(true);
  });
  it("blocks archived to pending", () => {
    expect(OrderStatusService.canTransition("ARCHIVED", "PENDING")).toBe(false);
  });
});

describe("OrderService.summarizeFields", () => {
  it("masks password fields and keeps a copy value", () => {
    const rows = OrderService.summarizeFields(
      { fields: { password: "Secret123!" } },
      [
        {
          id: "1",
          name: "password",
          label: "كلمة مرور",
          type: "PASSWORD",
          required: true,
          sensitive: false,
          order: 1,
          active: true,
        },
      ],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe("••••");
    expect(rows[0].copyValue).toBe("Secret123!");
  });
});

describe("upload mime", () => {
  it("normalizes telegram pdf/jpeg aliases", () => {
    expect(resolveUploadMime("receipt.pdf", "application/x-pdf")).toBe("application/pdf");
    expect(resolveUploadMime("photo.jpg", "image/jpg")).toBe("image/jpeg");
    expect(isAllowedUpload("application/x-pdf", "receipt.pdf")).toBe(true);
    expect(isAllowedUpload("image/jpg", "a.jpg")).toBe(true);
  });
});

describe("parseFieldAnswer", () => {
  it("keeps email answers as text", () => {
    const answer = parseFieldAnswer("Test@test.com", "EMAIL");
    expect(answer.kind).toBe("text");
    expect(answer.text).toBe("Test@test.com");
  });

  it("uses filename for stored telegram files", () => {
    const answer = parseFieldAnswer(
      { kind: "document", telegramFileId: "abc", filename: "sham_cash.pdf" },
      "FILE",
    );
    expect(answer.kind).toBe("file");
    expect(answer.filename).toBe("sham_cash.pdf");
  });
});

describe("displayChoice", () => {
  it("resolves select option labels", () => {
    const field = {
      id: "1",
      name: "invoice",
      label: "قيمة الفاتورة",
      type: "SELECT" as const,
      required: true,
      sensitive: false,
      order: 0,
      active: true,
      options: [
        { value: "95", label: "95 يورو" },
        { value: "120", label: "120 يورو" },
      ],
    };
    expect(displayChoice(field, "95")).toBe("95 يورو");
    expect(displayChoice(field, ["95", "120"])).toBe("95 يورو، 120 يورو");
  });
});

describe("callbackButtonLabel", () => {
  it("reads the pressed button text from the inline keyboard", () => {
    expect(
      callbackButtonLabel("o:0:1", [[{ text: "95 يورو", callback_data: "o:0:1" }]]),
    ).toBe("95 يورو");
    expect(callbackButtonLabel("confirm:yes")).toBe("تأكيد");
    expect(isSlashCommand("/s_abc")).toBe(true);
    expect(isSlashCommand("test")).toBe(false);
  });
});

describe("ChatLogService.reconstructFromOrder", () => {
  it("includes the selected service and option labels as commands", () => {
    const messages = ChatLogService.reconstructFromOrder({
      order: {
        _id: "abc123abc123abc123abc123",
        botId: "bot1",
        telegramUserId: 1,
        chatId: 1,
        createdAt: new Date("2026-01-01T12:00:00.000Z"),
        fields: { invoice: "95", ok: true },
      },
      fields: [
        {
          id: "1",
          name: "invoice",
          label: "قيمة الفاتورة",
          type: "SELECT",
          required: true,
          sensitive: false,
          order: 0,
          active: true,
          options: [{ value: "95", label: "95 يورو" }],
        },
        {
          id: "2",
          name: "ok",
          label: "تأكيد البيانات",
          type: "CONFIRMATION",
          required: true,
          sensitive: false,
          order: 1,
          active: true,
        },
      ],
      history: [],
      requestName: "شحن رصيد",
    });
    const inbound = messages.filter((m) => m.direction === "in");
    expect(inbound.map((m) => m.text)).toEqual(["شحن رصيد", "95 يورو", "نعم", "تأكيد"]);
    expect(inbound.every((m) => m.kind === "command")).toBe(true);
  });
});

describe("ensureUniqueFieldNames", () => {
  it("renames later duplicates so file and email no longer share a key", () => {
    const fields = [
      { name: "field_1", type: "RADIO" },
      { name: "field_3", type: "FILE" },
      { name: "field_3", type: "EMAIL" },
    ];
    expect(duplicateFieldNames(fields)).toEqual(["field_3"]);
    const unique = ensureUniqueFieldNames(fields);
    expect(unique.map((f) => f.name)).toEqual(["field_1", "field_3", "field_3_2"]);
    expect(nextFieldName(unique)).toBe("field_2");
  });
});

describe("normalizeTelegramFilePath", () => {
  it("strips local Bot API disk prefixes", () => {
    expect(normalizeTelegramFilePath("documents/file_1.pdf")).toBe("documents/file_1.pdf");
    expect(
      normalizeTelegramFilePath("/var/lib/telegram-bot-api/123:ABC/documents/file_1.pdf"),
    ).toBe("documents/file_1.pdf");
  });
});

describe("chatTextFingerprint", () => {
  it("keeps the original text after an edit so reconstructed history still matches", () => {
    const original = chatTextFingerprint({
      direction: "out",
      kind: "text",
      text: "تحديث على طلبك",
    });
    const edited = chatTextFingerprint({
      direction: "out",
      kind: "text",
      text: "نص معدّل",
      sourceText: "تحديث على طلبك",
    });
    expect(edited).toBe(original);
  });
});

describe("pinnedTelegramIp", () => {
  it("pins only cloud Telegram hosts", () => {
    const prev = process.env.TELEGRAM_API_IP;
    process.env.TELEGRAM_API_IP = "149.154.166.110";
    expect(pinnedTelegramIp("api.telegram.org")).toBe("149.154.166.110");
    expect(pinnedTelegramIp("telegram-bot-api")).toBeUndefined();
    expect(pinnedTelegramIp("127.0.0.1")).toBeUndefined();
    if (prev === undefined) delete process.env.TELEGRAM_API_IP;
    else process.env.TELEGRAM_API_IP = prev;
  });
});

describe("sanitizeAuditValue", () => {
  it("strips secrets and maps _id to id", () => {
    expect(
      sanitizeAuditValue({
        _id: "abc123",
        name: "bot",
        tokenEncrypted: "secret-token",
        webhookSecret: "whsec",
        passwordHash: "hash",
        nested: { recoveryCodes: ["x"], title: "ok" },
      }),
    ).toEqual({
      id: "abc123",
      name: "bot",
      nested: { title: "ok" },
    });
  });

  it("wraps non-object snapshots", () => {
    expect(toAuditSnapshot("hello")).toEqual({ value: "hello" });
    expect(toAuditSnapshot(null)).toBeUndefined();
  });
});
