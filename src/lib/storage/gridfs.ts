import { ObjectId } from "mongodb";
import { Readable } from "stream";
import { getGridFSBucket } from "@/lib/db/client";
import { isAllowedUpload, resolveUploadMime } from "@/lib/storage/mime";
import type { FilePurpose } from "@/types";

const MAX_SIZE = 15 * 1024 * 1024;

export class GridFSStorageService {
  static async save(params: {
    buffer: Buffer;
    filename: string;
    mimeType: string;
    ownerType: string;
    ownerId: string;
    uploadedBy: string;
    purpose: FilePurpose;
  }) {
    const safeName = params.filename.replace(/[/\\]/g, "_").replace(/\.\./g, "");
    const mimeType = resolveUploadMime(safeName, params.mimeType);
    const allowGenericBinary =
      params.purpose === "ORDER_ATTACHMENT" ||
      params.purpose === "PAYMENT_PROOF" ||
      params.purpose === "ADMIN_ATTACHMENT" ||
      params.purpose === "REQUEST_IMAGE";
    if (!isAllowedUpload(mimeType, safeName, allowGenericBinary)) throw new Error("INVALID_MIME");
    if (params.buffer.length > MAX_SIZE) throw new Error("FILE_TOO_LARGE");
    const bucket = await getGridFSBucket();
    const upload = bucket.openUploadStream(safeName, {
      metadata: {
        ownerType: params.ownerType,
        ownerId: params.ownerId,
        uploadedBy: params.uploadedBy,
        mimeType,
        size: params.buffer.length,
        originalName: safeName,
        purpose: params.purpose,
        createdAt: new Date(),
      },
    });
    await new Promise<void>((resolve, reject) => {
      upload.on("finish", () => resolve());
      upload.on("error", reject);
      Readable.from(params.buffer).on("error", reject).pipe(upload);
    });
    return String(upload.id);
  }

  static async get(id: string) {
    const bucket = await getGridFSBucket();
    const files = await bucket.find({ _id: new ObjectId(id) }).toArray();
    return files[0] ?? null;
  }

  static async openDownload(id: string) {
    const bucket = await getGridFSBucket();
    return bucket.openDownloadStream(new ObjectId(id));
  }

  static async readBuffer(id: string) {
    const file = await this.get(id);
    if (!file) return null;
    const stream = await this.openDownload(id);
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      stream.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      stream.on("end", () => resolve());
      stream.on("error", reject);
    });
    const meta = (file.metadata ?? {}) as { mimeType?: string; originalName?: string };
    return {
      buffer: Buffer.concat(chunks),
      mimeType: meta.mimeType ?? "application/octet-stream",
      filename: meta.originalName ?? file.filename ?? "file.bin",
    };
  }
}
