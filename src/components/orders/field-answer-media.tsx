"use client";

import { useEffect, useMemo, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Download, FileIcon, FileText, ImageIcon, Minus, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { detectMediaType, fieldAnswerFileUrl, type FieldAnswer } from "@/lib/orders/field-answer";
import { ar } from "@/i18n/ar";
import { Button } from "@/components/ui/button";

function downloadUrl(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "download";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function FullscreenViewer({
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
  const fileUrl = fieldAnswerFileUrl(orderId, fieldName, answer);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);

  const displayName = answer.filename || answer.text || "file";

  useEffect(() => {
    if (!fileUrl) {
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
        const res = await fetch(fileUrl, { credentials: "include" });
        if (!res.ok) throw new Error("load_failed");
        const blob = await res.blob();
        if (cancelled) return;
        blobUrl = URL.createObjectURL(blob);
        setMimeType(blob.type || null);
        setObjectUrl(blobUrl);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [fileUrl]);

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
      <button
        type="button"
        onClick={() => canPreview && objectUrl && setViewerOpen(true)}
        disabled={!canPreview || !objectUrl || loading || failed}
        className={cn(
          "mt-3 w-full overflow-hidden rounded-2xl border border-border bg-muted/20 text-start transition",
          canPreview && objectUrl ? "cursor-zoom-in hover:border-primary/40 hover:bg-muted/35" : "cursor-default",
        )}
      >
        <div className="flex items-center gap-3 p-3">
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
            <div className="mt-0.5 text-xs text-primary">
              {canPreview && objectUrl ? ar.previewAttachment : ar.viewAttachedFile}
            </div>
          </div>
        </div>
      </button>

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
