import { describe, expect, it } from "vitest";
import { OrderFilterBuilder } from "../src/lib/orders/filter-builder";
import { OrderStatusService } from "../src/lib/orders/order-service";

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
