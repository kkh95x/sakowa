import { describe, expect, it } from "vitest";
import { COMPLAINT_TEMPLATES, fieldsFromTemplate } from "../src/lib/requests/complaint-templates";

describe("complaint templates", () => {
  it("offers cars, salaries, and transport with voice-capable questions", () => {
    expect(COMPLAINT_TEMPLATES.map((template) => template.name)).toEqual([
      "شكاوي سيارات",
      "شكاوي رواتب",
      "شكاوي مواصلات",
    ]);
    for (const template of COMPLAINT_TEMPLATES) {
      const fields = fieldsFromTemplate(template);
      expect(fields.length).toBeGreaterThanOrEqual(3);
      expect(new Set(fields.map((field) => field.name)).size).toBe(fields.length);
      expect(fields.every((field) => field.type === "DYNAMIC" && field.telegramMessage && field.label)).toBe(true);
    }
  });
});
