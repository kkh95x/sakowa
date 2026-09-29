import { describe, expect, it } from "vitest";
import { isWebm, webmOpusToOgg } from "../src/lib/telegram/ogg-opus";

function ebmlSize(value: number) {
  if (value < 0x7f) return Buffer.from([0x80 | value]);
  const buf = Buffer.alloc(2);
  buf[0] = 0x40 | (value >> 8);
  buf[1] = value & 0xff;
  return buf;
}

function el(idHex: string, body: Buffer) {
  const id = Buffer.from(idHex, "hex");
  return Buffer.concat([id, ebmlSize(body.length), body]);
}

function textEl(idHex: string, text: string) {
  return el(idHex, Buffer.from(text));
}

function uintEl(idHex: string, value: number) {
  return el(idHex, Buffer.from([value]));
}

function opusHead() {
  const head = Buffer.alloc(19);
  head.write("OpusHead", 0, "ascii");
  head[8] = 1;
  head[9] = 1;
  head.writeUInt16LE(3840, 10);
  head.writeUInt32LE(48000, 12);
  return head;
}

/** One 20ms mono Opus packet (TOC only plus a dummy payload). */
function opusPacket(marker: number) {
  return Buffer.from([0xf8, marker, 0x11, 0x22]);
}

function simpleBlock(packet: Buffer, timecode: number) {
  const block = Buffer.alloc(4 + packet.length);
  block[0] = 0x81;
  block.writeInt16BE(timecode, 1);
  block[3] = 0x80;
  packet.copy(block, 4);
  return el("A3", block);
}

function sampleWebm() {
  const track = Buffer.concat([
    uintEl("D7", 1),
    uintEl("83", 2),
    textEl("86", "A_OPUS"),
    el("63A2", opusHead()),
  ]);
  const cluster = Buffer.concat([uintEl("E7", 0), simpleBlock(opusPacket(1), 0), simpleBlock(opusPacket(2), 20)]);
  const segment = Buffer.concat([el("1654AE6B", el("AE", track)), el("1F43B675", cluster)]);
  const header = Buffer.concat([
    uintEl("4286", 1),
    uintEl("42F7", 1),
    textEl("4282", "webm"),
  ]);
  return Buffer.concat([el("1A45DFA3", header), el("18538067", segment)]);
}

describe("webm Opus remux", () => {
  it("turns a WebM/Opus recording into an Ogg Opus voice", () => {
    const webm = sampleWebm();
    expect(isWebm(webm)).toBe(true);
    const ogg = webmOpusToOgg(webm);
    expect(ogg).toBeTruthy();
    expect(ogg!.subarray(0, 4).toString("ascii")).toBe("OggS");
    expect(ogg!.includes(Buffer.from("OpusHead"))).toBe(true);
    expect(ogg!.includes(Buffer.from("OpusTags"))).toBe(true);
    expect(ogg!.includes(opusPacket(1))).toBe(true);
    expect(ogg!.includes(opusPacket(2))).toBe(true);
    expect(ogg![5] & 0x02).toBe(0x02);

    let sawEnd = false;
    let offset = 0;
    while (offset + 27 <= ogg!.length) {
      expect(ogg!.subarray(offset, offset + 4).toString("ascii")).toBe("OggS");
      const headerType = ogg![offset + 5];
      const segments = ogg![offset + 26];
      let body = 0;
      for (let i = 0; i < segments; i++) body += ogg![offset + 27 + i];
      if (headerType & 0x04) sawEnd = true;
      offset += 27 + segments + body;
    }
    expect(offset).toBe(ogg!.length);
    expect(sawEnd).toBe(true);
  });

  it("leaves non-webm audio untouched", () => {
    expect(webmOpusToOgg(Buffer.from("OggSnot-webm"))).toBeNull();
    expect(isWebm(Buffer.from("OggS"))).toBe(false);
  });
});
