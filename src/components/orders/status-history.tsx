import { Paperclip } from "lucide-react";
import { ar } from "@/i18n/ar";
import { badgeDotClass } from "@/components/ui/badge";
import { statusTone } from "@/components/orders/status-badge";
import { canonicalizeStatus, complaintStatusLabel } from "@/lib/orders/complaint-status";
import { cn, formatTime } from "@/lib/utils";

type HistoryEntry = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function hasStatusContext(entry: HistoryEntry) {
  return Boolean(text(entry.reason) || text(entry.resolutionNote) || text(entry.closingNote));
}

/** The history entry that moved the complaint into its current status, when it carries context. */
export function latestStatusContext(history: HistoryEntry[], currentStatus: unknown) {
  const current = canonicalizeStatus(currentStatus);
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const entry = history[i];
    if (!entry.previousStatus) return null;
    if (canonicalizeStatus(entry.newStatus) !== current) continue;
    return hasStatusContext(entry) ? entry : null;
  }
  return null;
}

export function historyActorLabel(entry: HistoryEntry) {
  if (entry.changedBy === "TELEGRAM_USER") return ar.complainantActor;
  return text(entry.changedByName) || null;
}

const NOTE_STYLE = {
  reason: "border-danger/20 bg-danger-soft text-danger",
  resolutionNote: "border-success/20 bg-success-soft text-success",
  closingNote: "border-border bg-muted/60 text-muted-foreground",
} as const;

export function StatusContextNotes({ entry, className }: { entry: HistoryEntry; className?: string }) {
  const notes = (
    [
      ["reason", ar.rejectionReason],
      ["resolutionNote", ar.resolutionNote],
      ["closingNote", ar.closingNote],
    ] as const
  ).filter(([key]) => text(entry[key]));
  if (!notes.length) return null;
  return (
    <div className={cn("min-w-0 space-y-2", className)}>
      {notes.map(([key, label]) => (
        <div key={key} className={cn("min-w-0 rounded-xl border px-3 py-2", NOTE_STYLE[key])}>
          <div className="text-xs font-semibold">{label}</div>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
            {text(entry[key])}
          </p>
        </div>
      ))}
    </div>
  );
}

export function StatusHistoryItem({ entry, last }: { entry: HistoryEntry; last: boolean }) {
  const created = !entry.previousStatus;
  const actor = historyActorLabel(entry);
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      {!last ? <span aria-hidden className="absolute start-[5px] top-4 h-full w-px bg-border" /> : null}
      <span
        aria-hidden
        className={cn(
          "relative mt-1.5 size-[11px] shrink-0 rounded-full ring-4 ring-card",
          badgeDotClass(statusTone(entry.newStatus)),
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="font-medium">
            {created
              ? ar.complaintReceived
              : `${ar.statusChangedTo} ${complaintStatusLabel(entry.newStatus)}`}
          </span>
          {!created ? (
            <span className="text-xs text-muted-foreground">({complaintStatusLabel(entry.previousStatus)})</span>
          ) : null}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {entry.createdAt ? <time>{formatTime(String(entry.createdAt))}</time> : null}
          {actor ? (
            <span>
              {ar.changedBy}: <span className="font-medium text-foreground/80">{actor}</span>
            </span>
          ) : null}
        </div>
        <StatusContextNotes entry={entry} className="mt-2" />
        {entry.message ? (
          <div className="mt-2 min-w-0 rounded-xl bg-muted/60 px-3 py-2">
            <div className="text-xs font-semibold text-muted-foreground">{ar.messageToUser}</div>
            <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed">{String(entry.message)}</p>
          </div>
        ) : null}
        {entry.attachmentFileId ? (
          <a
            className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            href={`/api/files/${String(entry.attachmentFileId)}`}
            target="_blank"
            rel="noreferrer"
          >
            <Paperclip className="size-3.5" />
            {ar.viewAttachedFile}
          </a>
        ) : null}
      </div>
    </li>
  );
}
