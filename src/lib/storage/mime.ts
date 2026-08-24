const EXT_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".zip": "application/zip",
  ".rar": "application/vnd.rar",
  ".7z": "application/x-7z-compressed",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export const ALLOWED_UPLOAD_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/zip",
  "application/x-zip-compressed",
  "application/vnd.rar",
  "application/x-7z-compressed",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/octet-stream",
]);

export function extensionOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i >= 0 ? filename.slice(i).toLowerCase() : "";
}

export function resolveUploadMime(filename: string, reportedMime?: string | null): string {
  const reported = (reportedMime || "").trim().toLowerCase();
  const ext = extensionOf(filename);
  const fromExt = EXT_MIME[ext];
  if (!reported || reported === "application/octet-stream") {
    return fromExt || "application/octet-stream";
  }
  return reported;
}

export function isAllowedUpload(mimeType: string, filename: string, allowGenericBinary = false): boolean {
  if (!ALLOWED_UPLOAD_MIMES.has(mimeType)) return false;
  if (mimeType === "application/octet-stream") {
    return Boolean(EXT_MIME[extensionOf(filename)]) || allowGenericBinary;
  }
  return true;
}
