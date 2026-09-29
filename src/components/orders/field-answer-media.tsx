"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Download, FileIcon, FileText, ImageIcon, Loader2, Minus, Pause, Play, Plus, X } from "lucide-react";
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
  const canPlay = mediaType === "audio" || mediaType === "video";

  if (
    answer.kind !== "file" &&
    answer.kind !== "image" &&
    answer.kind !== "audio" &&
    answer.kind !== "video"
  ) {
    return null;
  }

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

      {!canPreview && objectUrl && !canPlay ? (
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

      {canPlay && objectUrl ? (
        <div className="mt-2">
          {mediaType === "audio" ? (
            <audio controls src={objectUrl} className="w-full" />
          ) : (
            <video controls src={objectUrl} className="mt-1 w-full rounded-xl" />
          )}
        </div>
      ) : null}

      {answer.kind === "audio" && answer.transcript ? (
        <div className="mt-3 rounded-xl border border-border bg-muted/40 px-3 py-2.5">
          <div className="text-xs font-semibold text-muted-foreground">{ar.voiceTranscript}</div>
          {answer.transcript.status === "ready" && answer.transcript.text ? (
            <p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">{answer.transcript.text}</p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              {answer.transcript.status === "pending" ? ar.voiceTranscriptPending : ar.voiceTranscriptFailed}
            </p>
          )}
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

let activeVoice: HTMLAudioElement | null = null;

function voiceClock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export function InlineVoiceButton({ urls }: { urls: string[] }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const pendingSeek = useRef<number | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (activeVoice === audioRef.current) activeVoice = null;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  function bind(audio: HTMLAudioElement) {
    const rememberDuration = () => {
      if (Number.isFinite(audio.duration)) setDuration(audio.duration);
    };
    audio.onloadedmetadata = rememberDuration;
    audio.ondurationchange = rememberDuration;
    audio.ontimeupdate = () => setCurrent(audio.currentTime);
    audio.onended = () => {
      setState("idle");
      setCurrent(0);
    };
    audio.onpause = () => setState((value) => (value === "loading" ? value : "idle"));
    audio.onplay = () => setState("playing");
  }

  async function ensureAudio() {
    if (audioRef.current) return audioRef.current;
    setState("loading");
    let blob: Blob | null = null;
    for (const url of urls) {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) continue;
      const next = await res.blob();
      if (next.type.includes("json") && next.size < 800) continue;
      blob = next;
      break;
    }
    if (!blob) {
      setState("idle");
      return null;
    }
    const objectUrl = URL.createObjectURL(blob);
    urlRef.current = objectUrl;
    const audio = new Audio(objectUrl);
    bind(audio);
    audioRef.current = audio;
    return audio;
  }

  function applySeek(audio: HTMLAudioElement, ratio: number) {
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
      pendingSeek.current = ratio;
      audio.onloadedmetadata = () => {
        if (Number.isFinite(audio.duration)) setDuration(audio.duration);
        if (pendingSeek.current != null && audio.duration > 0) {
          audio.currentTime = pendingSeek.current * audio.duration;
          setCurrent(audio.currentTime);
          pendingSeek.current = null;
        }
      };
      return;
    }
    audio.currentTime = ratio * audio.duration;
    setCurrent(audio.currentTime);
  }

  async function toggle(e: MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (state === "playing" && audioRef.current) {
      audioRef.current.pause();
      return;
    }
    if (activeVoice && activeVoice !== audioRef.current) activeVoice.pause();
    const audio = await ensureAudio();
    if (!audio) return;
    activeVoice = audio;
    try {
      await audio.play();
    } catch {
      setState("idle");
    }
  }

  async function seek(e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const fromLeft = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0;
    const ratio = Math.min(1, Math.max(0, 1 - fromLeft));
    if (activeVoice && activeVoice !== audioRef.current) activeVoice.pause();
    const audio = await ensureAudio();
    if (!audio) return;
    applySeek(audio, ratio);
    activeVoice = audio;
    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        setState("idle");
      }
    }
  }

  const ratio = duration > 0 ? Math.min(1, current / duration) : 0;
  const shown = current > 0 || state === "playing" ? current : duration;

  return (
    <div className="flex w-full min-w-[12rem] items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60"
        onClick={toggle}
        disabled={state === "loading" || urls.length === 0}
        aria-label={state === "playing" ? ar.pauseVoice : ar.playVoice}
        title={state === "playing" ? ar.pauseVoice : ar.playVoice}
      >
        {state === "loading" ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : state === "playing" ? (
          <Pause className="size-3.5" />
        ) : (
          <Play className="size-3.5 translate-x-px" />
        )}
      </button>
      <button
        type="button"
        className="relative h-4 min-w-[4.5rem] flex-1"
        onClick={seek}
        aria-label={ar.playVoice}
      >
        <span className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-black/15" />
        <span
          className="absolute right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-primary"
          style={{ width: `${ratio * 100}%` }}
        />
      </button>
      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{voiceClock(shown)}</span>
    </div>
  );
}
