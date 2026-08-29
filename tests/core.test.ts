import { describe, expect, it } from "vitest";
import { OrderFilterBuilder } from "../src/lib/orders/filter-builder";
import { OrderStatusService } from "../src/lib/orders/order-service";
import { parseFieldAnswer } from "../src/lib/orders/field-answer";
import { resolveUploadMime, isAllowedUpload } from "../src/lib/storage/mime";
import { normalizeTelegramFilePath, pinnedTelegramIp } from "../src/lib/telegram/api";
import { duplicateFieldNames, ensureUniqueFieldNames, nextFieldName } from "../src/lib/requests/field-names";

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
