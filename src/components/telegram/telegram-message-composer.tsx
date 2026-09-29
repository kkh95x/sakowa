"use client";

import { useEffect, useRef, useState } from "react";
import { Reorder, useDragControls } from "framer-motion";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  FileText,
  GripVertical,
  ImageIcon,
  MessageSquareText,
  Mic,
  Plus,
  Trash2,
  Type,
  Upload,
} from "lucide-react";
import { ar } from "@/i18n/ar";
import { Button, buttonClass } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Dropdown, DropdownItem } from "@/components/ui/dropdown";
import { AuthImage } from "@/components/requests/auth-image";
import {
  PROMPT_IMAGE_MIMES,
  PROMPT_MAX_BLOCKS,
  createPromptBlock,
  movePromptBlock,
  removePromptBlock,
  updatePromptBlock,
  withPromptHint,
} from "@/lib/telegram/field-prompt";
import { cn } from "@/lib/utils";
import type { TelegramPromptBlock, TelegramPromptBlockType } from "@/types";

type MediaBlock = Extract<TelegramPromptBlock, { type: "image" | "document" | "audio" }>;

const BLOCK_TYPES = ["text", "image", "document", "audio"] as const;

const BLOCK_META: Record<TelegramPromptBlockType, { label: string; icon: typeof Type }> = {
  text: { label: ar.promptBlockText, icon: Type },
  image: { label: ar.promptBlockImage, icon: ImageIcon },
  document: { label: ar.promptBlockDocument, icon: FileText },
  audio: { label: ar.promptBlockAudio, icon: Mic },
};

export function formatBytes(size?: number) {
  if (!size && size !== 0) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Ordered text/image/document composition for any Telegram message the bot sends
 * (field questions, bot welcome). Uploads go to the shared `BOT_MEDIA` purpose and
 * blocks are stored as `TelegramPromptBlock[]`.
 */
export function TelegramMessageComposer({
  ownerId,
  blocks,
  onChange,
  fallbackLabel,
  hint,
  buttons,
  buttonsLabel,
  title = ar.telegramMessage,
  subtitle = ar.telegramMessageSubtitle,
  emptyHint = ar.promptEmpty,
}: {
  /** Upload owner reference (field id, bot id, …). */
  ownerId: string;
  blocks: TelegramPromptBlock[];
  onChange: (blocks: TelegramPromptBlock[]) => void;
  /** Shown in the preview when nothing is composed yet. */
  fallbackLabel: string;
  hint?: string;
  buttons?: string[];
  /** Shown above the preview buttons, e.g. the complaint menu that follows a welcome. */
  buttonsLabel?: string;
  title?: string;
  subtitle?: string;
  emptyHint?: string;
}) {
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [localUrls, setLocalUrls] = useState<Record<string, string>>({});
  const localUrlsRef = useRef(localUrls);
  localUrlsRef.current = localUrls;
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => () => Object.values(localUrlsRef.current).forEach((u) => URL.revokeObjectURL(u)), []);

  function setLocalUrl(blockId: string, url: string | null) {
    setLocalUrls((prev) => {
      if (prev[blockId]) URL.revokeObjectURL(prev[blockId]);
      const next = { ...prev };
      if (url) next[blockId] = url;
      else delete next[blockId];
      return next;
    });
  }

  function add(type: TelegramPromptBlockType) {
    if (blocks.length >= PROMPT_MAX_BLOCKS) return;
    onChange([...blocks, createPromptBlock(type)]);
  }

  function remove(id: string) {
    setLocalUrl(id, null);
    onChange(removePromptBlock(blocks, id));
  }

  async function upload(block: MediaBlock, file: File | null) {
    if (!file) return;
    setErrors((e) => ({ ...e, [block.id]: "" }));
    if (block.type === "image") {
      if (!PROMPT_IMAGE_MIMES.includes(file.type)) {
        setErrors((e) => ({ ...e, [block.id]: "الصورة يجب أن تكون JPG أو PNG أو WEBP." }));
        return;
      }
      setLocalUrl(block.id, URL.createObjectURL(file));
    }
    if (block.type === "audio") {
      const mime = file.type.split(";")[0];
      if (!mime.startsWith("audio/")) {
        setErrors((e) => ({ ...e, [block.id]: ar.micDenied }));
        return;
      }
      setLocalUrl(block.id, URL.createObjectURL(file));
    }
    setUploading((u) => ({ ...u, [block.id]: true }));
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("ownerId", ownerId);
      fd.append("purpose", "BOT_MEDIA");
      fd.append("blockType", block.type);
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLocalUrl(block.id, null);
        setErrors((e) => ({
          ...e,
          [block.id]: `${ar.promptUploadFailed}${typeof data.error === "string" ? `: ${data.error}` : ""}`,
        }));
        return;
      }
      onChangeRef.current(
        updatePromptBlock(blocksRef.current, block.id, {
          storageId: String(data.fileId),
          fileName: String(data.filename ?? file.name),
          mimeType: String(data.mimeType ?? file.type),
          size: Number(data.size ?? file.size),
        }),
      );
    } finally {
      setUploading((u) => ({ ...u, [block.id]: false }));
    }
  }

  const addMenu = (
    <Dropdown
      trigger={
        <Button type="button" variant="outline" size="sm" disabled={blocks.length >= PROMPT_MAX_BLOCKS}>
          <Plus className="size-3.5" />
          {ar.addContent}
        </Button>
      }
    >
      {BLOCK_TYPES.map((type) => {
        const Icon = BLOCK_META[type].icon;
        return (
          <DropdownItem key={type} icon={<Icon />} onSelect={() => add(type)}>
            {BLOCK_META[type].label}
          </DropdownItem>
        );
      })}
    </Dropdown>
  );

  return (
    <section className="space-y-3" aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <MessageSquareText className="size-4 text-muted-foreground" aria-hidden />
            {title}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        </div>
        {addMenu}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0 rounded-2xl border border-border bg-muted/30">
          {blocks.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
              <p className="text-sm text-muted-foreground">{emptyHint}</p>
              <div className="flex flex-wrap justify-center gap-2">
                {BLOCK_TYPES.map((type) => {
                  const Icon = BLOCK_META[type].icon;
                  return (
                    <Button key={type} type="button" variant="outline" size="sm" onClick={() => add(type)}>
                      <Icon className="size-3.5" />
                      {BLOCK_META[type].label}
                    </Button>
                  );
                })}
              </div>
            </div>
          ) : (
            <Reorder.Group axis="y" values={blocks} onReorder={onChange} className="space-y-2.5 p-2.5 sm:p-3" as="ol">
              {blocks.map((block, index) => (
                <BlockCard
                  key={block.id}
                  block={block}
                  index={index}
                  total={blocks.length}
                  uploading={Boolean(uploading[block.id])}
                  error={errors[block.id]}
                  localUrl={localUrls[block.id]}
                  onMove={(dir) => onChange(movePromptBlock(blocks, index, dir))}
                  onRemove={() => remove(block.id)}
                  onText={(text) => onChange(updatePromptBlock(blocks, block.id, { text }))}
                  onUpload={(file) => block.type !== "text" && void upload(block, file)}
                />
              ))}
            </Reorder.Group>
          )}
        </div>

        <TelegramPreview
          blocks={blocks}
          fallbackLabel={fallbackLabel}
          hint={hint}
          buttons={buttons}
          buttonsLabel={buttonsLabel}
          localUrls={localUrls}
        />
      </div>
    </section>
  );
}

function BlockCard({
  block,
  index,
  total,
  uploading,
  error,
  localUrl,
  onMove,
  onRemove,
  onText,
  onUpload,
}: {
  block: TelegramPromptBlock;
  index: number;
  total: number;
  uploading: boolean;
  error?: string;
  localUrl?: string;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onText: (text: string) => void;
  onUpload: (file: File | null) => void;
}) {
  const controls = useDragControls();
  const meta = BLOCK_META[block.type];
  const Icon = meta.icon;
  const textEmpty = block.type === "text" && !block.text.trim();

  return (
    <Reorder.Item
      value={block}
      dragListener={false}
      dragControls={controls}
      className="list-none overflow-hidden rounded-xl border border-border bg-card shadow-card"
    >
      <div className="flex items-center gap-1.5 border-b border-border bg-muted/30 px-1.5 py-1">
        <button
          type="button"
          className="flex size-8 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
          onPointerDown={(e) => controls.start(e)}
          aria-label={ar.dragToReorder}
          title={ar.dragToReorder}
        >
          <GripVertical className="size-4" />
        </button>
        <span className="flex size-6 items-center justify-center rounded-md bg-primary-soft text-primary">
          <Icon className="size-3.5" aria-hidden />
        </span>
        <span className="text-xs font-semibold">
          <span className="tabular-nums text-muted-foreground">{index + 1}.</span> {meta.label}
        </span>
        <div className="ms-auto flex items-center">
          <IconButton label={ar.moveUp} disabled={index === 0} onClick={() => onMove(-1)}>
            <ChevronUp className="size-4" />
          </IconButton>
          <IconButton label={ar.moveDown} disabled={index === total - 1} onClick={() => onMove(1)}>
            <ChevronDown className="size-4" />
          </IconButton>
          <IconButton label={ar.delete} onClick={onRemove} className="hover:bg-danger-soft hover:text-danger">
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      </div>

      <div className="p-3">
        {block.type === "text" ? (
          <>
            <Textarea
              value={block.text}
              onChange={(e) => onText(e.target.value)}
              placeholder={ar.promptTextPlaceholder}
              rows={3}
              aria-label={ar.promptBlockText}
              aria-invalid={textEmpty || undefined}
            />
            {textEmpty ? <p className="mt-1 text-xs text-danger">{ar.promptTextRequired}</p> : null}
          </>
        ) : block.type === "audio" ? (
          <AudioBody block={block} uploading={uploading} localUrl={localUrl} onUpload={onUpload} />
        ) : (
          <MediaBody block={block} uploading={uploading} localUrl={localUrl} onUpload={onUpload} />
        )}
        {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
      </div>
    </Reorder.Item>
  );
}

function AudioBody({
  block,
  uploading,
  localUrl,
  onUpload,
}: {
  block: Extract<TelegramPromptBlock, { type: "audio" }>;
  uploading: boolean;
  localUrl?: string;
  onUpload: (file: File | null) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [micError, setMicError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  useEffect(() => {
    return () => {
      recorder.current?.stream.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function toggle() {
    if (recording) {
      recorder.current?.stop();
      setRecording(false);
      return;
    }
    setMicError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      rec.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const raw = rec.mimeType || mime || "audio/webm";
        const type = raw.split(";")[0] || "audio/webm";
        const ext = type.includes("ogg") ? "ogg" : type.includes("mp4") ? "m4a" : type.includes("mpeg") ? "mp3" : "webm";
        onUpload(new File(chunks.current, `voice.${ext}`, { type }));
      };
      rec.start();
      recorder.current = rec;
      setRecording(true);
    } catch {
      setMicError(ar.micDenied);
    }
  }

  const src = localUrl || (block.storageId ? `/api/files/${block.storageId}` : "");
  const recordButton = (
    <Button type="button" variant={recording ? "danger" : "primary"} size="sm" loading={uploading} onClick={() => void toggle()}>
      <Mic className="size-3.5" />
      {recording ? ar.promptStopRecording : block.storageId || localUrl ? ar.promptReplace : ar.promptRecordAudio}
    </Button>
  );

  return (
    <div className="space-y-2">
      {recording ? <p className="text-xs font-medium text-danger">{ar.promptRecording}</p> : null}
      {src ? <audio controls src={src} className="h-9 w-full" /> : null}
      {!src && !recording ? (
        <div className="flex flex-col items-center gap-2.5 rounded-xl border border-dashed border-warning/50 bg-warning-soft/40 px-3 py-6 text-center">
          <p className="text-xs text-muted-foreground">{ar.promptMissingFile}</p>
          {recordButton}
        </div>
      ) : (
        <div className="flex justify-end">{recordButton}</div>
      )}
      {micError ? <p className="text-xs text-danger">{micError}</p> : null}
    </div>
  );
}

function MediaBody({
  block,
  uploading,
  localUrl,
  onUpload,
}: {
  block: MediaBlock;
  uploading: boolean;
  localUrl?: string;
  onUpload: (file: File | null) => void;
}) {
  const isImage = block.type === "image";
  const hasFile = Boolean(block.storageId);
  const picker = (
    <label
      className={buttonClass(
        hasFile ? "outline" : "primary",
        "sm",
        cn("shrink-0 cursor-pointer", uploading && "pointer-events-none opacity-60"),
      )}
    >
      <Upload className="size-3.5" />
      {uploading ? ar.loading : hasFile ? ar.promptReplace : isImage ? ar.promptUploadImage : ar.promptUploadDocument}
      <input
        type="file"
        accept={isImage ? PROMPT_IMAGE_MIMES.join(",") : undefined}
        className="sr-only"
        disabled={uploading}
        onChange={(e) => {
          onUpload(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
    </label>
  );

  if (!hasFile && !localUrl) {
    return (
      <div className="flex flex-col items-center gap-2.5 rounded-xl border border-dashed border-warning/50 bg-warning-soft/40 px-3 py-6 text-center">
        <p className="text-xs text-muted-foreground">{ar.promptMissingFile}</p>
        {picker}
      </div>
    );
  }

  if (isImage) {
    return (
      <div className="overflow-hidden rounded-xl border border-border">
        <AuthImage
          fileId={block.storageId || null}
          localUrl={localUrl}
          className="max-h-52 min-h-32 w-full bg-muted/40 object-contain"
        />
        <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
          <span className="truncate text-xs text-muted-foreground" dir="ltr">
            {block.fileName} {block.size ? `· ${formatBytes(block.size)}` : ""}
          </span>
          {picker}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border p-3">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted">
        <FileText className="size-5 text-primary" />
      </div>
      <div className="min-w-0 flex-1" dir="ltr">
        <div className="truncate text-sm font-medium">{block.fileName || ar.attachedFile}</div>
        <div className="truncate text-xs text-muted-foreground">
          {[block.mimeType, formatBytes(block.size)].filter(Boolean).join(" · ")}
        </div>
      </div>
      {picker}
    </div>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  className,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30",
        className,
      )}
    >
      {children}
    </button>
  );
}

function TelegramPreview({
  blocks,
  fallbackLabel,
  hint,
  buttons,
  buttonsLabel,
  localUrls,
}: {
  blocks: TelegramPromptBlock[];
  fallbackLabel: string;
  hint?: string;
  buttons?: string[];
  buttonsLabel?: string;
  localUrls: Record<string, string>;
}) {
  const usable = blocks.filter((b) => (b.type === "text" ? b.text.trim() : b.storageId || localUrls[b.id]));
  const base: TelegramPromptBlock[] = usable.length
    ? usable
    : [{ id: "fallback", type: "text", text: fallbackLabel || "—" }];
  const shown = withPromptHint(base, hint);

  return (
    <div className="self-start rounded-2xl border border-border bg-[#e6ebee] p-3">
      <div className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold text-[#4a5a66]">
        <Eye className="size-3.5" aria-hidden />
        {ar.preview}
      </div>
      <div className="flex flex-col items-start gap-1.5">
        {shown.map((b) => (
          <div
            key={b.id}
            className="max-w-full overflow-hidden rounded-2xl rounded-ss-sm bg-white text-sm shadow-sm dark:bg-[#182533]"
          >
            {b.type === "text" ? (
              <p className="whitespace-pre-wrap px-3 py-2">{b.text}</p>
            ) : b.type === "image" ? (
              <AuthImage fileId={b.storageId || null} localUrl={localUrls[b.id]} className="max-h-40 w-56 object-cover" />
            ) : b.type === "audio" ? (
              <div className="w-56 px-3 py-2">
                <audio
                  controls
                  src={localUrls[b.id] || (b.storageId ? `/api/files/${b.storageId}` : undefined)}
                  className="h-9 w-full"
                />
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2" dir="ltr">
                <FileText className="size-8 shrink-0 text-primary" />
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium">{b.fileName || ar.attachedFile}</div>
                  <div className="text-[11px] text-muted-foreground">{formatBytes(b.size)}</div>
                </div>
              </div>
            )}
          </div>
        ))}
        {buttons?.length ? (
          <div className="grid w-full gap-1">
            {buttonsLabel ? <p className="px-1 pt-1 text-[11px] text-muted-foreground">{buttonsLabel}</p> : null}
            {buttons.map((label, i) => (
              <div
                key={`${label}-${i}`}
                className="rounded-lg bg-white/70 px-2 py-1.5 text-center text-xs font-medium dark:bg-[#182533]/80"
              >
                {label}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
