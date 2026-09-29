/**
 * Remuxes a WebM/Opus recording (browser MediaRecorder) into an Ogg/Opus buffer.
 * Telegram sendVoice accepts Ogg Opus and rejects audio/webm.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i << 24;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 0x80000000) !== 0 ? ((crc << 1) ^ 0x04c11db7) >>> 0 : (crc << 1) >>> 0;
    }
    table[i] = crc >>> 0;
  }
  return table;
})();

const ID = {
  segment: 0x18538067,
  tracks: 0x1654ae6b,
  trackEntry: 0xae,
  trackNumber: 0xd7,
  codecId: 0x86,
  codecPrivate: 0x63a2,
  cluster: 0x1f43b675,
  simpleBlock: 0xa3,
  blockGroup: 0xa0,
  block: 0xa1,
} as const;

/** Milliseconds per Opus frame, indexed by the TOC config (RFC 6716). */
const FRAME_MS = [
  10, 20, 40, 60, 10, 20, 40, 60, 10, 20, 40, 60, 10, 20, 10, 20, 2.5, 5, 10, 20, 2.5, 5, 10, 20, 2.5, 5, 10, 20,
  2.5, 5, 10, 20,
];

export function isWebm(buffer: Buffer) {
  return buffer.length >= 4 && buffer.readUInt32BE(0) === 0x1a45dfa3;
}

/** Returns an Ogg Opus buffer, or null when the input is not WebM/Opus. */
export function webmOpusToOgg(input: Buffer): Buffer | null {
  if (!isWebm(input)) return null;
  const parsed = extractOpus(input);
  if (!parsed) return null;
  return muxOggOpus(parsed.opusHead, parsed.packets);
}

function extractOpus(input: Buffer): { opusHead: Buffer; packets: Buffer[] } | null {
  let opusTrack = 0;
  let opusHead: Buffer | null = null;
  const packets: Buffer[] = [];

  const onElement = (id: number, data: Buffer) => {
    if (id === ID.trackEntry) {
      readTrack(data);
      return;
    }
    if (id === ID.segment || id === ID.tracks || id === ID.cluster || id === ID.blockGroup) {
      walk(data, onElement);
      return;
    }
    if (id === ID.simpleBlock || id === ID.block) readBlock(data);
  };

  const readTrack = (data: Buffer) => {
    let number = 0;
    let codec = "";
    let head: Buffer | null = null;
    walk(data, (id, child) => {
      if (id === ID.trackNumber && child.length) number = child.readUIntBE(0, Math.min(child.length, 6));
      else if (id === ID.codecId) codec = child.toString("ascii");
      else if (id === ID.codecPrivate && child.subarray(0, 8).toString("ascii") === "OpusHead") head = Buffer.from(child);
    });
    if (codec === "A_OPUS" && head) {
      opusTrack = number;
      opusHead = head;
    }
  };

  const readBlock = (data: Buffer) => {
    if (!opusHead || !opusTrack) return;
    const track = readVint(data, 0, true);
    if (track.value !== opusTrack) return;
    const flagsAt = track.length + 2;
    if (flagsAt >= data.length) throw new Error("WEBM_BAD_BLOCK");
    const lacing = (data[flagsAt] >> 1) & 0x3;
    for (const frame of unlace(data.subarray(flagsAt + 1), lacing)) {
      if (frame.length) packets.push(frame);
    }
  };

  walk(input, onElement);
  if (!opusHead || packets.length === 0) return null;
  return { opusHead, packets };
}

function walk(buffer: Buffer, onElement: (id: number, data: Buffer) => void) {
  let offset = 0;
  while (offset + 2 <= buffer.length) {
    const id = readVint(buffer, offset, false);
    offset += id.length;
    if (offset >= buffer.length) break;
    const size = readVint(buffer, offset, true);
    offset += size.length;
    const end = size.value == null ? buffer.length : offset + size.value;
    if (end > buffer.length) throw new Error("WEBM_TRUNCATED");
    onElement(id.value, buffer.subarray(offset, end));
    if (size.value == null) break;
    offset = end;
  }
}

/** EBML vint. Element ids keep the length marker; sizes strip it. `null` size means unknown. */
function readVint(buffer: Buffer, offset: number, stripMarker: boolean): { value: number | null; length: number } {
  const first = buffer[offset];
  if (first == null) throw new Error("WEBM_TRUNCATED");
  let length = 1;
  let marker = 0x80;
  while (length <= 8 && (first & marker) === 0) {
    marker >>= 1;
    length += 1;
  }
  if (length > 8 || offset + length > buffer.length) throw new Error("WEBM_TRUNCATED");
  if (!stripMarker) {
    let raw = 0;
    for (let i = 0; i < length; i++) raw = raw * 256 + buffer[offset + i];
    return { value: raw, length };
  }
  const mask = (1 << (8 - length)) - 1;
  let value = first & mask;
  for (let i = 1; i < length; i++) value = value * 256 + buffer[offset + i];
  const max = 2 ** (7 * length) - 1;
  return { value: value === max ? null : value, length };
}

function unlace(data: Buffer, lacing: number): Buffer[] {
  if (lacing === 0) return [Buffer.from(data)];
  if (!data.length) throw new Error("WEBM_BAD_LACING");
  const count = data[0] + 1;
  let offset = 1;
  if (lacing === 2) {
    const total = data.length - 1;
    if (count === 0 || total % count !== 0) throw new Error("WEBM_BAD_LACING");
    const size = total / count;
    return Array.from({ length: count }, (_, i) => Buffer.from(data.subarray(offset + i * size, offset + (i + 1) * size)));
  }
  if (lacing === 1) {
    const sizes: number[] = [];
    for (let i = 0; i < count - 1; i++) {
      let size = 0;
      for (;;) {
        if (offset >= data.length) throw new Error("WEBM_BAD_LACING");
        const byte = data[offset++];
        size += byte;
        if (byte < 255) break;
      }
      sizes.push(size);
    }
    const frames = sizes.map((size) => {
      const frame = Buffer.from(data.subarray(offset, offset + size));
      offset += size;
      return frame;
    });
    frames.push(Buffer.from(data.subarray(offset)));
    return frames;
  }
  return unlaceEbml(data.subarray(1), count);
}

/** Matroska EBML lacing: the first frame size is an absolute vint, the rest are signed deltas. */
function unlaceEbml(data: Buffer, count: number): Buffer[] {
  if (count < 1) throw new Error("WEBM_BAD_LACING");
  const first = readVint(data, 0, true);
  if (first.value == null) throw new Error("WEBM_BAD_LACING");
  const sizes = [first.value];
  let offset = first.length;
  for (let i = 1; i < count - 1; i++) {
    const delta = readSignedVint(data, offset);
    offset += delta.length;
    sizes.push(sizes[i - 1] + delta.value);
  }
  const frames: Buffer[] = [];
  for (const size of sizes) {
    if (size < 0 || offset + size > data.length) throw new Error("WEBM_BAD_LACING");
    frames.push(Buffer.from(data.subarray(offset, offset + size)));
    offset += size;
  }
  frames.push(Buffer.from(data.subarray(offset)));
  return frames;
}

function readSignedVint(buffer: Buffer, offset: number): { value: number; length: number } {
  const vint = readVint(buffer, offset, true);
  if (vint.value == null) throw new Error("WEBM_BAD_LACING");
  const midpoint = 2 ** (7 * vint.length - 1) - 1;
  return { value: vint.value - midpoint, length: vint.length };
}

function muxOggOpus(opusHead: Buffer, packets: Buffer[]): Buffer {
  const serial = 0x53484b57;
  const preSkip = opusHead.length >= 12 ? opusHead.readUInt16LE(10) : 3840;
  const pages: Buffer[] = [
    oggPage({ serial, sequence: 0, granule: 0n, headerType: 0x02, packets: [opusHead] }),
    oggPage({ serial, sequence: 1, granule: 0n, headerType: 0x00, packets: [opusTags()] }),
  ];
  let sequence = 2;
  let sampleCursor = BigInt(preSkip);
  let batch: Buffer[] = [];
  let segments = 0;
  const flush = (end: boolean) => {
    if (!batch.length) return;
    pages.push(
      oggPage({
        serial,
        sequence,
        granule: sampleCursor,
        headerType: end ? 0x04 : 0x00,
        packets: batch,
      }),
    );
    sequence += 1;
    batch = [];
    segments = 0;
  };
  packets.forEach((packet, index) => {
    const needed = Math.floor(packet.length / 255) + 1;
    if (batch.length && segments + needed > 200) flush(false);
    batch.push(packet);
    segments += needed;
    sampleCursor += BigInt(opusPacketSamples(packet));
    if (index === packets.length - 1) flush(true);
  });
  return Buffer.concat(pages);
}

function opusPacketSamples(packet: Buffer) {
  const config = packet[0] >> 3;
  const framesCode = packet[0] & 0x3;
  const perFrame = Math.round(FRAME_MS[config] * 48);
  if (framesCode === 0) return perFrame;
  if (framesCode === 1 || framesCode === 2) return perFrame * 2;
  const count = packet.length > 1 ? packet[1] : 1;
  return perFrame * count;
}

function opusTags() {
  const vendor = Buffer.from("shakowa");
  const packet = Buffer.alloc(8 + 4 + vendor.length + 4);
  packet.write("OpusTags", 0, "ascii");
  packet.writeUInt32LE(vendor.length, 8);
  vendor.copy(packet, 12);
  packet.writeUInt32LE(0, 12 + vendor.length);
  return packet;
}

function oggPage(opts: {
  serial: number;
  sequence: number;
  granule: bigint;
  headerType: number;
  packets: Buffer[];
}) {
  const segments: number[] = [];
  for (const packet of opts.packets) {
    let remaining = packet.length;
    if (remaining === 0) {
      segments.push(0);
      continue;
    }
    while (remaining >= 255) {
      segments.push(255);
      remaining -= 255;
    }
    segments.push(remaining);
  }
  const header = Buffer.alloc(27 + segments.length);
  header.write("OggS", 0, "ascii");
  header[5] = opts.headerType;
  header.writeBigInt64LE(opts.granule, 6);
  header.writeUInt32LE(opts.serial >>> 0, 14);
  header.writeUInt32LE(opts.sequence >>> 0, 18);
  header[26] = segments.length;
  segments.forEach((value, index) => {
    header[27 + index] = value;
  });
  const page = Buffer.concat([header, ...opts.packets]);
  page.writeUInt32LE(oggCrc(page), 22);
  return page;
}

function oggCrc(data: Buffer) {
  let crc = 0;
  for (let i = 0; i < data.length; i++) {
    crc = (Math.imul(crc, 256) ^ CRC_TABLE[((crc >>> 24) ^ data[i]) & 0xff]) >>> 0;
  }
  return crc;
}
