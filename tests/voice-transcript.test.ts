import { describe, expect, it } from "vitest";
import { parseFieldAnswer, fieldAnswerLabel, orderHasPendingTranscript } from "../src/lib/orders/field-answer";
import { resampleMono } from "../src/lib/speech/pcm";

describe("voice transcript", () => {
  it("keeps an Arabic transcript on an audio answer", () => {
    const answer = parseFieldAnswer(
      {
        inputType: "dynamic",
        contentType: "voice",
        text: null,
        fileId: "a".repeat(24),
        filename: "voice.ogg",
        transcript: { status: "ready", text: "  اسمي أحمد  " },
      },
      "DYNAMIC",
    );
    expect(answer.kind).toBe("audio");
    expect(answer.transcript).toEqual({ status: "ready", text: "اسمي أحمد" });
    expect(fieldAnswerLabel(answer)).toBe("اسمي أحمد");
  });

  it("detects a transcript that is still running", () => {
    expect(
      orderHasPendingTranscript({
        name: { contentType: "voice", transcript: { status: "pending", text: null } },
      }),
    ).toBe(true);
    expect(orderHasPendingTranscript({ name: { contentType: "text", text: "أحمد" } })).toBe(false);
  });

  it("resamples stereo audio down to 16 kHz", () => {
    const left = new Float32Array([0, 0, 1, 1]);
    const right = new Float32Array([0, 0, 1, 1]);
    const out = resampleMono([left, right], 32_000, 16_000);
    expect(out.length).toBe(2);
    expect(out[0]).toBeCloseTo(0);
    expect(out[1]).toBeCloseTo(1);
  });
});
