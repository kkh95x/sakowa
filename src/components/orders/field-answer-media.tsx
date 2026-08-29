"use client";

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Download, FileIcon, FileText, ImageIcon, Minus, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { detectMediaType, fieldAnswerFileUrls, type FieldAnswer } from "@/lib/orders/field-answer";
import { ar } from "@/i18n/ar";
import { Button } from "@/components/ui/button";

export function downloadUrl(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "download";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function FullscreenViewer({
  open,
  onOpenChange,
  title,
  objectUrl,
  mediaType,
  filename,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  objectUrl: string;
  mediaType: "image" | "pdf";
  filename: string;
}) {
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (open) setZoom(1);
  }, [open]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/90" />
        <DialogPrimitive.Content className="fixed inset-0 z-[81] flex flex-col outline-none">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-black/40 px-4 py-3 text-white backdrop-blur">
            <DialogPrimitive.Title className="truncate text-sm font-semibold">{title}</DialogPrimitive.Title>
            <div className="flex items-center gap-2">
              {mediaType === "image" ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-white hover:bg-white/10"
                    aria-label={ar.zoomOut}
                    onClick={() => setZoom((z) => Math.max(0.25, +(z - 0.25).toFixed(2)))}
                  >
                    <Minus className="size-4" />
                  </Button>
                  <span className="min-w-12 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-white hover:bg-white/10"
                    aria-label={ar.zoomIn}
                    onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))}
                  >
                    <Plus className="size-4" />
                  </Button>
                </>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                className="text-white hover:bg-white/10"
                aria-label={ar.download}
                onClick={() => downloadUrl(objectUrl, filename)}
              >
                <Download className="size-4" />
              </Button>
              <DialogPrimitive.Close
                className="rounded-lg p-2 text-white/80 transition hover:bg-white/10 hover:text-white"
                aria-label={ar.cancel}
              >
                <X className="size-5" />
              </DialogPrimitive.Close>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto bg-black/80 p-4">
            {mediaType === "image" ? (
              <div className="flex min-h-full items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={objectUrl}
                  alt=""
                  className="max-w-none origin-center transition-transform duration-150"
                  style={{ transform: `scale(${zoom})` }}
                  draggable={false}
                />
              </div>
            ) : (
              <iframe
                src={objectUrl}
                title={title}
                className="mx-auto h-[calc(100vh-5rem)] w-full max-w-5xl rounded-lg bg-white"
              />
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function FieldAnswerMedia({
  orderId,
  fieldName,
  answer,
}: {
  orderId: string;
  fieldName: string;
  answer: FieldAnswer;
}) {
  const fileUrls = fieldAnswerFileUrls(orderId, fieldName, answer);
  const fileUrl = fileUrls[0] ?? null;
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const displayName = answer.filename || answer.text || "file";
  const urlsKey = fileUrls.join("|");

  useEffect(() => {
    const urls = urlsKey ? urlsKey.split("|") : [];
    if (!urls.length) {
      setObjectUrl(null);
      setMimeType(null);
      setFailed(false);
      return;
    }
    let blobUrl: string | null = null;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setObjectUrl(null);
    void (async () => {
      try {
        let lastError: unknown = null;
        for (const url of urls) {
          try {
            const res = await fetch(url, { credentials: "include" });
            if (!res.ok) {
              lastError = new Error(`HTTP ${res.status}`);
              continue;
            }
            const blob = await res.blob();
            if (cancelled) return;
            if (blob.type.includes("json") && blob.size < 512) {
              lastError = new Error("not_a_file");
              continue;
            }
            blobUrl = URL.createObjectURL(blob);
            setMimeType(blob.type || null);
            setObjectUrl(blobUrl);
            return;
          } catch (err) {
            lastError = err;
          }
        }
        if (!cancelled) {
          console.warn("file_load_failed", lastError);
          setFailed(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [urlsKey, reloadKey]);

  const mediaType = useMemo(
    () => (objectUrl ? detectMediaType(answer, mimeType) : detectMediaType(answer)),
    [answer, mimeType, objectUrl],
  );

  const canPreview = mediaType === "image" || mediaType === "pdf";

  if (answer.kind !== "file" && answer.kind !== "image") return null;

  if (!fileUrl) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-2xl border border-border bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
        {answer.kind === "image" ? <ImageIcon className="size-4" /> : <FileIcon className="size-4" />}
        <span>{answer.text}</span>
      </div>
    );
  }

  return (
    <>
      <div
        className={cn(
          "mt-3 w-full overflow-hidden rounded-2xl border border-border bg-muted/20 text-start transition",
          canPreview && objectUrl ? "cursor-zoom-in hover:border-primary/40 hover:bg-muted/35" : "cursor-default",
        )}
      >
        <div
          role={canPreview && objectUrl ? "button" : undefined}
          tabIndex={canPreview && objectUrl ? 0 : undefined}
          onClick={() => canPreview && objectUrl && setViewerOpen(true)}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && canPreview && objectUrl) {
              e.preventDefault();
              setViewerOpen(true);
            }
          }}
          className="flex items-center gap-3 p-3"
        >
          <div className="relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-background">
            {loading ? (
              <span className="text-[10px] text-muted-foreground">{ar.loading}</span>
            ) : failed ? (
              <FileIcon className="size-6 text-muted-foreground opacity-50" />
            ) : mediaType === "image" && objectUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={objectUrl} alt="" className="size-full object-cover" />
            ) : mediaType === "pdf" ? (
              <div className="flex flex-col items-center gap-0.5 text-primary">
                <FileText className="size-7" />
                <span className="text-[9px] font-bold uppercase">PDF</span>
              </div>
            ) : (
              <FileText className="size-7 text-primary" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{displayName}</div>
            <div className={`mt-0.5 text-xs ${failed ? "text-danger" : "text-primary"}`}>
              {failed
                ? ar.fileLoadFailed
                : canPreview && objectUrl
                  ? ar.previewAttachment
                  : ar.viewAttachedFile}
            </div>
            {failed ? (
              <button
                type="button"
                className="mt-1 text-xs text-primary underline"
                onClick={(e) => {
                  e.stopPropagation();
                  setReloadKey((k) => k + 1);
                }}
              >
                {ar.retryLoadFile}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {!canPreview && objectUrl ? (
        <div className="mt-2">
          <button
            type="button"
            className="text-sm text-primary underline"
            onClick={() => downloadUrl(objectUrl, displayName)}
          >
            {ar.download}
          </button>
        </div>
      ) : null}

      {objectUrl && (mediaType === "image" || mediaType === "pdf") ? (
        <FullscreenViewer
          open={viewerOpen}
          onOpenChange={setViewerOpen}
          title={displayName}
          objectUrl={objectUrl}
          mediaType={mediaType}
          filename={displayName}
        />
      ) : null}
    </>
  );
}

export function CompactFileOpenButton({
  orderId,
  fieldName,
  answer,
}: {
  orderId: string;
  fieldName: string;
  answer: FieldAnswer;
}) {
  const urls = fieldAnswerFileUrls(orderId, fieldName, answer);
  const [busy, setBusy] = useState(false);
  const [viewer, setViewer] = useState<{
    objectUrl: string;
    mediaType: "image" | "pdf";
    filename: string;
  } | null>(null);
  const filename = answer.filename || answer.text || "file";

  async function openFile(e: MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (!urls.length || busy) return;
    setBusy(true);
    let blobUrl: string | null = null;
    try {
      let blob: Blob | null = null;
      for (const url of urls) {
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) continue;
        const next = await res.blob();
        if (next.type.includes("json") && next.size < 512) continue;
        blob = next;
        break;
      }
      if (!blob) return;
      blobUrl = URL.createObjectURL(blob);
      const mediaType = detectMediaType(answer, blob.type);
      if (mediaType === "image" || mediaType === "pdf") {
        setViewer({ objectUrl: blobUrl, mediaType, filename });
        blobUrl = null;
      } else {
        downloadUrl(blobUrl, filename);
      }
    } finally {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="shrink-0 rounded-lg bg-[#517da2] px-2 py-0.5 text-[10px] font-medium text-white hover:opacity-90 disabled:opacity-50"
        onClick={openFile}
        disabled={busy || urls.length === 0}
      >
        {busy ? ar.loading : ar.open}
      </button>
      {viewer ? (
        <FullscreenViewer
          open
          onOpenChange={(open) => {
            if (!open) {
              URL.revokeObjectURL(viewer.objectUrl);
              setViewer(null);
            }
          }}
          title={viewer.filename}
          objectUrl={viewer.objectUrl}
          mediaType={viewer.mediaType}
          filename={viewer.filename}
        />
      ) : null}
    </>
  );
}
