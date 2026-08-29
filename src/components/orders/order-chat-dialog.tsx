"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, CheckCheck, ChevronDown, ChevronUp, ClipboardList, Copy, Paperclip, Pencil, RefreshCw, Send, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { CompactFileOpenButton } from "@/components/orders/field-answer-media";
import { ar } from "@/i18n/ar";
import { cn, formatTime, relativeTime } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import type { OrderStatus } from "@/types";

const PAGE_SIZE = 25;
const STATUSES: OrderStatus[] = ["PENDING", "REVIEWING", "COMPLETED", "REJECTED", "ARCHIVED"];
const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: ar.pending,
  REVIEWING: ar.reviewing,
  COMPLETED: ar.completed,
  REJECTED: ar.rejected,
  ARCHIVED: ar.archived,
};
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["REVIEWING", "REJECTED", "ARCHIVED"],
  REVIEWING: ["COMPLETED", "REJECTED", "ARCHIVED"],
  COMPLETED: ["ARCHIVED"],
  REJECTED: ["ARCHIVED"],
  ARCHIVED: [],
};

type ChatPeer = {
  name: string;
  username: string | null;
  telegramUserId: number;
  photoUrl: string | null;
  lastSeenAt: string | null;
  online: boolean;
};

type ChatMsg = {
  id: string;
  direction: "in" | "out";
  actor: "user" | "bot" | "admin";
  kind: "text" | "photo" | "document" | "command";
  text: string | null;
  filename: string | null;
  mimeType: string | null;
  gridFsId: string | null;
  telegramFileId: string | null;
  fileUrl: string | null;
  createdAt: string;
  editedAt?: string | null;
  reconstructed?: boolean;
};

type SummaryRow = {
  label: string;
  value: string;
  kind: "text" | "file" | "image";
  fieldName: string;
  gridFsId: string | null;
  telegramFileId: string | null;
  filename: string | null;
  copyValue?: string | null;
};

type UserOrderCard = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  createdAt: string;
  requestTypeId: string;
  requestTypeName: string;
  summary: SummaryRow[];
};

type UserServiceTab = {
  id: string;
  name: string;
  count: number;
};

function avatarColor(id: number) {
  const hues = [12, 32, 152, 188, 212, 262, 328];
  return `hsl(${hues[Math.abs(id) % hues.length]} 42% 44%)`;
}

function initials(name: string) {
  const parts = name.replace(/^@/, "").trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "U";
}

function presenceText(peer: ChatPeer | null) {
  if (!peer) return "";
  if (peer.online) return ar.online;
  if (!peer.lastSeenAt) return ar.lastSeenRecently;
  const diff = Date.now() - new Date(peer.lastSeenAt).getTime();
  if (diff < 60_000) return ar.lastSeenJustNow;
  return `${ar.lastSeen} ${relativeTime(peer.lastSeenAt)}`;
}

function PeerAvatar({ peer }: { peer: ChatPeer | null }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [peer?.photoUrl]);
  const letter = initials(peer?.name || "U");
  if (peer?.photoUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={peer.photoUrl}
        alt=""
        className="size-10 rounded-full object-cover"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div
      className="flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
      style={{ background: avatarColor(peer?.telegramUserId ?? 0) }}
    >
      {letter}
    </div>
  );
}

function chatClock(value: string) {
  return new Intl.DateTimeFormat("ar-SY", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Damascus",
  }).format(new Date(value));
}

function dayLabel(value: string) {
  const d = new Date(value);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return ar.today;
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return ar.yesterday;
  return new Intl.DateTimeFormat("ar-SY", {
    dateStyle: "medium",
    timeZone: "Asia/Damascus",
  }).format(d);
}

function ChatMedia({ msg }: { msg: ChatMsg }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!msg.fileUrl) return;
    let blobUrl: string | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(msg.fileUrl!, { credentials: "include" });
        if (!res.ok) throw new Error("load_failed");
        const blob = await res.blob();
        if (cancelled) return;
        blobUrl = URL.createObjectURL(blob);
        setObjectUrl(blobUrl);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [msg.fileUrl]);

  const isImage =
    msg.kind === "photo" ||
    Boolean(msg.mimeType?.startsWith("image/")) ||
    /\.(jpe?g|png|webp|gif)$/i.test(msg.filename || "");

  if (!msg.fileUrl && !msg.filename && (msg.kind === "text" || msg.kind === "command")) return null;

  if (failed) {
    return <div className="text-xs opacity-80">{msg.filename || ar.attachedFile}</div>;
  }

  if (isImage) {
    if (!msg.fileUrl) {
      return msg.filename ? <div className="text-xs opacity-80">{msg.filename}</div> : null;
    }
    if (!objectUrl) {
      return <div className="mb-1 h-32 max-w-full animate-pulse rounded-xl bg-black/10" />;
    }
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={objectUrl}
        alt={msg.filename || ""}
        className="mb-1 max-h-64 max-w-full rounded-xl object-cover"
      />
    );
  }

  if (msg.kind === "document" || msg.filename || msg.fileUrl) {
    return (
      <a
        href={objectUrl || msg.fileUrl || "#"}
        target="_blank"
        rel="noreferrer"
        className="mb-1 flex items-center gap-2 rounded-xl bg-black/5 px-3 py-2 text-sm underline"
        download={msg.filename || undefined}
      >
        <Paperclip className="size-4 shrink-0" />
        <span className="truncate">{msg.filename || ar.attachedFile}</span>
      </a>
    );
  }
  return null;
}

function sameBubble(a: ChatMsg, b: ChatMsg) {
  if (a.gridFsId && b.gridFsId && a.gridFsId === b.gridFsId && a.direction === b.direction) return true;
  if (a.telegramFileId && b.telegramFileId && a.telegramFileId === b.telegramFileId && a.direction === b.direction) {
    return true;
  }
  if (a.direction === b.direction && a.kind === b.kind && (a.text || "") === (b.text || "") && a.kind === "text") {
    return Boolean(a.text);
  }
  return false;
}

function CopyFieldButton({ value }: { value: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy(e: MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast(ar.copied);
    } catch {
      toast(ar.copyFailed);
    }
  }

  return (
    <button
      type="button"
      className="flex size-5 shrink-0 items-center justify-center rounded-md text-[#517da2] hover:bg-[#517da2]/10"
      aria-label={ar.copy}
      title={ar.copy}
      onClick={copy}
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
    </button>
  );
}

function OrderSideCard({
  item,
  current,
  showService,
  onSelect,
  onChangeStatus,
}: {
  item: UserOrderCard;
  current: boolean;
  showService: boolean;
  onSelect: (id: string) => void;
  onChangeStatus: (item: UserOrderCard) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const extra = Math.max(0, item.summary.length - 4);
  const rows = expanded ? item.summary : item.summary.slice(0, 4);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(item.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(item.id);
        }
      }}
      className={cn(
        "w-full cursor-pointer rounded-2xl border p-3 text-start shadow-sm transition",
        current
          ? "border-[#517da2] bg-white ring-2 ring-[#517da2]/30"
          : "border-transparent bg-white hover:border-[#c5d4e0]",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="truncate text-sm font-semibold text-slate-800">#{item.orderNumber}</div>
          <button
            type="button"
            className="flex size-7 shrink-0 items-center justify-center rounded-lg text-[#517da2] hover:bg-[#517da2]/10"
            aria-label={ar.changeStatus}
            title={ar.changeStatus}
            onClick={(e) => {
              e.stopPropagation();
              onChangeStatus(item);
            }}
          >
            <RefreshCw className="size-3.5" />
          </button>
        </div>
        <div className="shrink-0 text-[10px] text-slate-400">
          {item.createdAt ? formatTime(item.createdAt) : ""}
        </div>
      </div>
      {showService && item.requestTypeName ? (
        <div className="mt-0.5 truncate text-xs text-[#517da2]">{item.requestTypeName}</div>
      ) : null}
      <dl className="mt-2 space-y-1">
        {rows.map((row) => {
          const isFile = row.kind === "file" || row.kind === "image";
          return (
            <div key={`${item.id}-${row.fieldName}`} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 text-[11px]">
              <dt className="text-slate-400">{row.label}</dt>
              <dd className="flex min-w-0 items-center justify-end gap-1.5">
                {isFile ? (
                  <>
                    <span className="truncate font-medium text-slate-700">{row.value}</span>
                    <CompactFileOpenButton
                      orderId={item.id}
                      fieldName={row.fieldName}
                      answer={{
                        kind: row.kind,
                        text: row.value,
                        gridFsId: row.gridFsId ?? undefined,
                        telegramFileId: row.telegramFileId ?? undefined,
                        filename: row.filename ?? undefined,
                      }}
                    />
                  </>
                ) : (
                  <>
                    <span className="truncate font-medium text-slate-700">{row.value}</span>
                    {row.copyValue ? <CopyFieldButton value={row.copyValue} /> : null}
                  </>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      {extra > 0 ? (
        <button
          type="button"
          className="mt-2 text-[11px] font-medium text-[#517da2] hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
        >
          {expanded ? ar.showLess : `${ar.showMore} (${extra})`}
        </button>
      ) : null}
    </div>
  );
}

function UserOrdersPanel({
  serviceId,
  onServiceChange,
  userServices,
  allServicesCount,
  orderTab,
  onTabChange,
  orderCounts,
  ordersLoading,
  sortedOrders,
  activeId,
  onSelect,
  onChangeStatus,
  onClose,
}: {
  serviceId: string;
  onServiceChange: (id: string) => void;
  userServices: UserServiceTab[];
  allServicesCount: number;
  orderTab: OrderStatus;
  onTabChange: (status: OrderStatus) => void;
  orderCounts: Record<OrderStatus, number>;
  ordersLoading: boolean;
  sortedOrders: UserOrderCard[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onChangeStatus: (item: UserOrderCard) => void;
  onClose?: () => void;
}) {
  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#dbe3ea] px-3 py-2">
        <div className="text-sm font-semibold text-[#334155]">{ar.userOrders}</div>
        {onClose ? (
          <button
            type="button"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
            aria-label={ar.hideUserOrders}
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>
      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-[#edf2f7] px-2 py-2">
        <button
          type="button"
          onClick={() => onServiceChange("all")}
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium",
            serviceId === "all" ? "bg-[#2b5278] text-white" : "bg-white text-slate-600 hover:bg-slate-100",
          )}
        >
          {ar.allServices}
          <span
            className={cn(
              "rounded-full px-1.5 text-[10px]",
              serviceId === "all" ? "bg-white/20" : "bg-slate-100 text-slate-500",
            )}
          >
            {allServicesCount}
          </span>
        </button>
        {userServices.map((svc) => {
          const active = serviceId === svc.id;
          return (
            <button
              key={svc.id}
              type="button"
              onClick={() => onServiceChange(svc.id)}
              className={cn(
                "flex max-w-[10rem] shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium",
                active ? "bg-[#2b5278] text-white" : "bg-white text-slate-600 hover:bg-slate-100",
              )}
              title={svc.name}
            >
              <span className="truncate">{svc.name}</span>
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px]",
                  active ? "bg-white/20" : "bg-slate-100 text-slate-500",
                )}
              >
                {svc.count}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex shrink-0 gap-1 overflow-x-auto px-2 py-2">
        {STATUSES.map((tab) => {
          const count = orderCounts[tab];
          const active = orderTab === tab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => onTabChange(tab)}
              className={cn(
                "flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium",
                active ? "bg-[#517da2] text-white" : "bg-white text-slate-600 hover:bg-slate-100",
              )}
            >
              {STATUS_LABEL[tab]}
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px]",
                  active ? "bg-white/20" : "bg-slate-100 text-slate-500",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-2 pb-3">
        {ordersLoading ? (
          <div className="py-8 text-center text-xs text-muted-foreground">{ar.loading}</div>
        ) : null}
        {!ordersLoading && sortedOrders.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">{ar.noOrdersInStatus}</div>
        ) : null}
        {sortedOrders.map((item) => (
          <OrderSideCard
            key={item.id}
            item={item}
            current={item.id === activeId}
            showService={serviceId === "all"}
            onSelect={onSelect}
            onChangeStatus={onChangeStatus}
          />
        ))}
      </div>
    </>
  );
}

function isCommandMsg(msg: ChatMsg) {
  return msg.kind === "command" || Boolean(msg.text?.trim().startsWith("/"));
}

function canManageOutgoing(msg: ChatMsg) {
  if (msg.direction !== "out") return false;
  if (msg.reconstructed) return false;
  if (msg.id.startsWith("tmp-") || msg.id.startsWith("rec-")) return false;
  return /^[a-f0-9]{24}$/i.test(msg.id);
}

function hasMedia(msg: ChatMsg) {
  return (
    msg.kind === "photo" ||
    msg.kind === "document" ||
    Boolean(msg.gridFsId || msg.telegramFileId || msg.filename)
  );
}

function ChatBubble({
  msg,
  editing,
  onOpenMenu,
}: {
  msg: ChatMsg;
  editing: boolean;
  onOpenMenu: (msg: ChatMsg, x: number, y: number) => void;
}) {
  const pressTimer = useRef<number>(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const outgoing = msg.direction === "out";
  const command = isCommandMsg(msg);
  const manage = canManageOutgoing(msg);

  function clearPress() {
    window.clearTimeout(pressTimer.current);
    start.current = null;
  }

  return (
    <div className="group relative flex" dir="ltr">
      <div
        className={cn(
          "relative max-w-[82%] rounded-2xl px-2.5 py-1.5 shadow-sm",
          outgoing ? "ml-auto rounded-br-md bg-[#eeffde]" : "mr-auto rounded-bl-md bg-white",
          editing && "ring-2 ring-[#517da2]/40",
        )}
        onContextMenu={(e) => {
          if (!manage) return;
          e.preventDefault();
          onOpenMenu(msg, e.clientX, e.clientY);
        }}
        onPointerDown={(e) => {
          if (!manage || e.pointerType === "mouse") return;
          start.current = { x: e.clientX, y: e.clientY };
          pressTimer.current = window.setTimeout(() => {
            onOpenMenu(msg, e.clientX, e.clientY);
            start.current = null;
          }, 480);
        }}
        onPointerUp={clearPress}
        onPointerCancel={clearPress}
        onPointerMove={(e) => {
          if (!start.current) return;
          const dx = e.clientX - start.current.x;
          const dy = e.clientY - start.current.y;
          if (dx * dx + dy * dy > 100) clearPress();
        }}
      >
        {manage ? (
          <button
            type="button"
            className={cn(
              "absolute top-0.5 flex size-6 items-center justify-center rounded-full bg-white/90 text-slate-500 shadow-sm opacity-0 transition hover:bg-white hover:text-slate-700 group-hover:opacity-100 focus:opacity-100",
              outgoing ? "-left-8" : "-right-8",
            )}
            aria-label={ar.messageActions}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              onOpenMenu(msg, rect.left, rect.bottom);
            }}
          >
            <ChevronDown className="size-3.5" />
          </button>
        ) : null}
        <div dir="rtl" className="text-start">
          <ChatMedia msg={msg} />
          {msg.text ? (
            <div
              className={cn(
                "whitespace-pre-wrap break-words text-[15px] leading-snug text-[#111]",
                command &&
                  "inline-block rounded-md border border-[#54a9eb]/30 bg-[#54a9eb]/15 px-2 py-0.5 font-medium text-[#2481cc]",
              )}
            >
              {msg.text}
            </div>
          ) : null}
          <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-black/45">
            {msg.editedAt ? <span>{ar.messageEditedMark}</span> : null}
            <span>{chatClock(msg.createdAt)}</span>
            {outgoing ? <CheckCheck className="size-3.5 text-[#4fc3f7]" /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function mergeChat(prev: ChatMsg[], next: ChatMsg[], prepend = false) {
  if (!next.length && prev.length) return prev;
  const temps = prev.filter((m) => {
    if (!m.id.startsWith("tmp-")) return false;
    return !next.some((n) => sameBubble(n, m) || (n.direction === m.direction && n.gridFsId && n.gridFsId === m.gridFsId));
  });
  const older = prepend
    ? prev.filter((m) => !m.id.startsWith("tmp-"))
    : (() => {
        const oldestNext = next[0] ? new Date(next[0].createdAt).getTime() : 0;
        return prev.filter((m) => {
          if (m.id.startsWith("tmp-")) return false;
          return new Date(m.createdAt).getTime() < oldestNext;
        });
      })();
  const merged = [...older, ...next, ...temps];
  const seen = new Set<string>();
  const out: ChatMsg[] = [];
  for (const msg of merged.slice().sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )) {
    const keys = [
      msg.id,
      msg.gridFsId ? `fs:${msg.direction}:${msg.gridFsId}` : "",
      msg.telegramFileId ? `tg:${msg.direction}:${msg.telegramFileId}` : "",
    ].filter(Boolean);
    if (keys.some((key) => seen.has(key))) continue;
    for (const key of keys) seen.add(key);
    out.push(msg);
  }
  return out;
}

export function OrderChatDialog({
  orderId,
  open,
  onOpenChange,
  onOrderIdChange,
}: {
  orderId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOrderIdChange?: (orderId: string) => void;
}) {
  const toast = useToast();
  const [activeId, setActiveId] = useState<string | null>(orderId);
  const [peer, setPeer] = useState<ChatPeer | null>(null);
  const [orderNumber, setOrderNumber] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlderUi, setLoadingOlderUi] = useState(false);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [orderTab, setOrderTab] = useState<OrderStatus>("PENDING");
  const [serviceId, setServiceId] = useState("all");
  const [userOrders, setUserOrders] = useState<UserOrderCard[]>([]);
  const [userServices, setUserServices] = useState<UserServiceTab[]>([]);
  const [orderCounts, setOrderCounts] = useState<Record<OrderStatus, number>>({
    PENDING: 0,
    REVIEWING: 0,
    COMPLETED: 0,
    REJECTED: 0,
    ARCHIVED: 0,
  });
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [statusTarget, setStatusTarget] = useState<UserOrderCard | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusFile, setStatusFile] = useState<File | null>(null);
  const [statusBusy, setStatusBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<ChatMsg | null>(null);
  const [menu, setMenu] = useState<{ id: string; left: number; top: number } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ChatMsg | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const openedFor = useRef<string | null>(null);
  const prependHeight = useRef<number | null>(null);
  const stickToBottom = useRef(true);
  const loadingOlder = useRef(false);
  const hasOlderRef = useRef(false);
  hasOlderRef.current = hasOlder;

  useEffect(() => {
    if (orderId) setActiveId(orderId);
  }, [orderId]);

  useEffect(() => {
    if (!open) {
      setPanelOpen(false);
      setHasOlder(false);
      setStatusTarget(null);
      setStatusMessage("");
      setStatusFile(null);
      setStatusBusy(null);
      setEditing(null);
      setMenu(null);
      setDeleteTarget(null);
    }
  }, [open]);

  async function loadChat(opts?: { before?: string; initial?: boolean }) {
    if (!activeId) return;
    const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (opts?.before) params.set("before", opts.before);
    const res = await fetch(`/api/orders/${activeId}/chat?${params}`, {
      cache: "no-store",
      credentials: "include",
    });
    if (!res.ok) return;
    const data = await res.json();
    setPeer(data.peer ?? null);
    setOrderNumber(String(data.orderNumber ?? ""));
    const next = Array.isArray(data.messages) ? (data.messages as ChatMsg[]) : [];
    setMessages((prev) => mergeChat(prev, next, Boolean(opts?.before)));
    if (opts?.before || opts?.initial) setHasOlder(Boolean(data.hasOlder));
  }

  async function loadUserOrders(id: string, status: OrderStatus, requestTypeId: string) {
    setOrdersLoading(true);
    try {
      const params = new URLSearchParams({ status, requestTypeId });
      const res = await fetch(`/api/orders/${id}/user-orders?${params}`, {
        cache: "no-store",
        credentials: "include",
      });
      if (!res.ok) return;
      const data = await res.json();
      setOrderCounts({
        PENDING: Number(data.counts?.PENDING ?? 0),
        REVIEWING: Number(data.counts?.REVIEWING ?? 0),
        COMPLETED: Number(data.counts?.COMPLETED ?? 0),
        REJECTED: Number(data.counts?.REJECTED ?? 0),
        ARCHIVED: Number(data.counts?.ARCHIVED ?? 0),
      });
      setUserServices(Array.isArray(data.services) ? data.services : []);
      setUserOrders(Array.isArray(data.items) ? data.items : []);
    } finally {
      setOrdersLoading(false);
    }
  }

  useEffect(() => {
    if (!open || !activeId) return;
    if (openedFor.current !== activeId) {
      setMessages([]);
      setPeer(null);
      setHasOlder(false);
      openedFor.current = activeId;
      stickToBottom.current = true;
    }
    setLoading(true);
    setText("");
    setFile(null);
    setEditing(null);
    setMenu(null);
    setDeleteTarget(null);
    void loadChat({ initial: true }).finally(() => setLoading(false));
    const timer = window.setInterval(() => {
      void loadChat();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [open, activeId]);

  useEffect(() => {
    if (!open || !panelOpen || !activeId) return;
    void loadUserOrders(activeId, orderTab, serviceId);
  }, [open, panelOpen, activeId, orderTab, serviceId]);

  const sortedOrders = useMemo(
    () =>
      [...userOrders].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [userOrders],
  );

  const allServicesCount = userServices.reduce((sum, row) => sum + row.count, 0);

  const groups = useMemo(() => {
    const days: { label: string; items: ChatMsg[] }[] = [];
    for (const msg of messages) {
      const label = dayLabel(msg.createdAt);
      const last = days[days.length - 1];
      if (!last || last.label !== label) days.push({ label, items: [msg] });
      else last.items.push(msg);
    }
    return days;
  }, [messages]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (prependHeight.current != null) {
      el.scrollTop = el.scrollHeight - prependHeight.current;
      prependHeight.current = null;
      loadingOlder.current = false;
      return;
    }
    if (stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  useEffect(() => {
    if (!menu) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenu(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  function cancelEdit() {
    setEditing(null);
    setText("");
    setFile(null);
  }

  function startEdit(msg: ChatMsg) {
    setEditing(msg);
    setText(msg.text || "");
    setFile(null);
    setMenu(null);
    window.setTimeout(() => composerRef.current?.focus(), 0);
  }

  function openMessageMenu(msg: ChatMsg, clientX: number, clientY: number) {
    const root = shellRef.current;
    if (!root) return;
    const r = root.getBoundingClientRect();
    const width = 176;
    const height = 96;
    let left = clientX - r.left - width + 12;
    let top = clientY - r.top;
    left = Math.min(Math.max(8, left), r.width - width - 8);
    top = Math.min(Math.max(8, top), r.height - height - 8);
    setMenu({ id: msg.id, left, top });
  }

  async function saveEdit() {
    if (!activeId || !editing) return;
    const nextText = text.trim();
    if (!nextText && !hasMedia(editing)) return;
    if (nextText === (editing.text || "").trim()) {
      cancelEdit();
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/orders/${activeId}/chat`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: editing.id, text: nextText }),
      });
      if (!res.ok) {
        toast(ar.messageEditFailed);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { telegramSynced?: boolean };
      setMessages((prev) =>
        prev.map((m) =>
          m.id === editing.id ? { ...m, text: nextText || null, editedAt: new Date().toISOString() } : m,
        ),
      );
      cancelEdit();
      toast(data.telegramSynced === false ? ar.telegramNotSynced : ar.messageEdited);
      await loadChat();
    } finally {
      setSending(false);
    }
  }

  async function confirmDelete() {
    if (!activeId || !deleteTarget) return;
    setSending(true);
    try {
      const res = await fetch(
        `/api/orders/${activeId}/chat?messageId=${encodeURIComponent(deleteTarget.id)}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!res.ok) {
        toast(ar.messageDeleteFailed);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { telegramSynced?: boolean };
      const id = deleteTarget.id;
      setMessages((prev) => prev.filter((m) => m.id !== id));
      if (editing?.id === id) cancelEdit();
      setDeleteTarget(null);
      toast(data.telegramSynced === false ? ar.telegramNotSynced : ar.messageDeleted);
      await loadChat();
    } finally {
      setSending(false);
    }
  }

  async function send() {
    if (editing) {
      await saveEdit();
      return;
    }
    if (!activeId || (!text.trim() && !file)) return;
    const outgoingText = text.trim();
    const outgoingFile = file;
    setSending(true);
    try {
      let fileId: string | undefined;
      if (outgoingFile) {
        const fd = new FormData();
        fd.append("file", outgoingFile);
        fd.append("ownerId", activeId);
        const up = await fetch("/api/uploads", { method: "POST", body: fd });
        if (!up.ok) {
          toast(ar.sendFailed);
          return;
        }
        fileId = String((await up.json()).fileId);
      }
      const res = await fetch(`/api/orders/${activeId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: outgoingText || undefined, fileId }),
      });
      if (!res.ok) {
        toast(ar.sendFailed);
        return;
      }
      setText("");
      setFile(null);
      stickToBottom.current = true;
      setMessages((prev) => [
        ...prev,
        {
          id: `tmp-${Date.now()}`,
          direction: "out",
          actor: "admin",
          kind: outgoingFile
            ? outgoingFile.type.startsWith("image/")
              ? "photo"
              : "document"
            : "text",
          text: outgoingText || null,
          filename: outgoingFile?.name ?? null,
          mimeType: outgoingFile?.type ?? null,
          gridFsId: fileId ?? null,
          telegramFileId: null,
          fileUrl: fileId ? `/api/files/${fileId}` : null,
          createdAt: new Date().toISOString(),
        },
      ]);
      await loadChat();
    } finally {
      setSending(false);
    }
  }

  async function loadOlder() {
    if (!hasOlderRef.current || loadingOlder.current || !messages.length) return;
    const oldest = messages[0];
    loadingOlder.current = true;
    setLoadingOlderUi(true);
    prependHeight.current = scroller.current?.scrollHeight ?? null;
    stickToBottom.current = false;
    try {
      await loadChat({ before: oldest.createdAt });
    } finally {
      loadingOlder.current = false;
      setLoadingOlderUi(false);
    }
  }

  function selectOrder(id: string) {
    if (id !== activeId) {
      setActiveId(id);
      onOrderIdChange?.(id);
    }
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
      setPanelOpen(false);
    }
  }

  function closeStatusDialog() {
    setStatusTarget(null);
    setStatusMessage("");
    setStatusFile(null);
    setStatusBusy(null);
  }

  async function changeOrderStatus(next: OrderStatus) {
    if (!statusTarget) return;
    setStatusBusy(next);
    try {
      let attachmentFileId: string | undefined;
      if (statusFile) {
        const fd = new FormData();
        fd.append("file", statusFile);
        fd.append("ownerId", statusTarget.id);
        const up = await fetch("/api/uploads", { method: "POST", body: fd });
        if (!up.ok) {
          toast(ar.updateFailed);
          return;
        }
        attachmentFileId = String((await up.json()).fileId);
      }
      const res = await fetch(`/api/orders/${statusTarget.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: next,
          message: statusMessage.trim() || undefined,
          attachmentFileId,
        }),
      });
      if (!res.ok) {
        toast(ar.updateFailed);
        return;
      }
      toast(ar.toast.orderUpdated);
      closeStatusDialog();
      if (activeId) void loadUserOrders(activeId, orderTab, serviceId);
      if (statusTarget.id === activeId) void loadChat();
    } finally {
      setStatusBusy(null);
    }
  }

  const handle = peer?.username ? `@${peer.username.replace(/^@/, "")}` : null;
  const status = presenceText(peer);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={peer?.name || ar.openConversation}
      description={presenceText(peer) || undefined}
      header={
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative shrink-0">
            <PeerAvatar peer={peer} />
            {peer?.online ? (
              <span className="absolute bottom-0 end-0 size-2.5 rounded-full border-2 border-[#517da2] bg-[#4ade80]" />
            ) : null}
          </div>
          <div className="min-w-0 text-start" dir="rtl">
            <div className="truncate text-[15px] font-semibold leading-tight">
              {peer?.name || ar.openConversation}
            </div>
            <div className={cn("truncate text-xs", peer?.online ? "text-[#b7ffce]" : "text-white/75")}>
              {[handle, status || (orderNumber ? `#${orderNumber}` : "")]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </div>
        </div>
      }
      headerActions={
        <button
          type="button"
          className={cn(
            "rounded-xl p-1.5 text-white/80 transition hover:bg-white/10 hover:text-white",
            panelOpen && "bg-white/20 text-white",
          )}
          aria-label={panelOpen ? ar.hideUserOrders : ar.showUserOrders}
          onClick={() => setPanelOpen((v) => !v)}
        >
          <ClipboardList className="size-5" />
        </button>
      }
      size="sm"
      className={cn(
        "grid h-[min(92vh,760px)] max-h-[min(92vh,760px)] grid-rows-[auto_minmax(0,1fr)] w-[min(100%-1rem,26.5rem)]",
        panelOpen && "md:w-[min(100%-1rem,52rem)]",
      )}
      headerClassName="items-center border-none bg-[#517da2] px-3 py-2.5 text-white [&_button]:text-white/80 [&_button:hover]:bg-white/10 [&_button:hover]:text-white"
      bodyClassName="min-h-0 overflow-hidden p-0"
    >
      <div ref={shellRef} className="relative flex h-full min-h-0">
        {panelOpen ? (
          <aside className="hidden w-[min(100%,18.75rem)] shrink-0 flex-col border-e border-[#dbe3ea] bg-[#f4f7fb] md:flex">
            <UserOrdersPanel
              serviceId={serviceId}
              onServiceChange={setServiceId}
              userServices={userServices}
              allServicesCount={allServicesCount}
              orderTab={orderTab}
              onTabChange={setOrderTab}
              orderCounts={orderCounts}
              ordersLoading={ordersLoading}
              sortedOrders={sortedOrders}
              activeId={activeId}
              onSelect={selectOrder}
              onChangeStatus={setStatusTarget}
            />
          </aside>
        ) : null}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            ref={scroller}
            className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3"
            onScroll={(e) => {
              const el = e.currentTarget;
              stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
              if (el.scrollTop < 80) void loadOlder();
            }}
            style={{
              backgroundColor: "#e7eef4",
              backgroundImage:
                "radial-gradient(rgba(80,120,150,0.12) 1px, transparent 1px), radial-gradient(rgba(80,120,150,0.08) 1px, transparent 1px)",
              backgroundSize: "18px 18px, 18px 18px",
              backgroundPosition: "0 0, 9px 9px",
            }}
          >
            {hasOlder ? (
              <div className="sticky top-2 z-10 flex justify-center">
                <button
                  type="button"
                  onClick={() => void loadOlder()}
                  disabled={loadingOlderUi}
                  className="flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-medium text-[#517da2] shadow-md hover:bg-white disabled:opacity-60"
                >
                  <ChevronUp className="size-4" />
                  {loadingOlderUi ? ar.loading : ar.loadOlderMessages}
                </button>
              </div>
            ) : null}
            {loading && !messages.length ? (
              <div className="py-10 text-center text-sm text-muted-foreground">{ar.loading}</div>
            ) : null}
            {!loading && messages.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">{ar.noMessagesYet}</div>
            ) : null}
            {groups.map((group) => (
              <div key={group.label} className="space-y-2">
                <div className="flex justify-center">
                  <span className="rounded-full bg-black/25 px-3 py-0.5 text-[11px] text-white">
                    {group.label}
                  </span>
                </div>
                {group.items.map((msg) => (
                  <ChatBubble
                    key={msg.id}
                    msg={msg}
                    editing={editing?.id === msg.id}
                    onOpenMenu={openMessageMenu}
                  />
                ))}
              </div>
            ))}
          </div>

          {editing ? (
            <div className="flex shrink-0 items-center gap-2 border-t border-[#dbe3ea] bg-[#f4f7fb] px-3 py-2">
              <Pencil className="size-4 shrink-0 text-[#517da2]" />
              <div className="min-w-0 flex-1 text-start">
                <div className="text-[11px] font-semibold text-[#517da2]">{ar.editMessage}</div>
                <div className="truncate text-xs text-slate-500">
                  {editing.text || ar.editCaption}
                </div>
              </div>
              <button type="button" className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700" onClick={cancelEdit} aria-label={ar.cancel}>
                <X className="size-4" />
              </button>
            </div>
          ) : null}
          <form
            className="flex shrink-0 items-end gap-2 border-t border-[#dbe3ea] bg-white px-2 py-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <input
              ref={fileInput}
              type="file"
              className="hidden"
              accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,.csv,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/*,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {editing ? null : (
              <button
                type="button"
                className="mb-0.5 rounded-full p-2 text-muted-foreground hover:bg-muted"
                onClick={() => fileInput.current?.click()}
                aria-label={ar.attachFile}
              >
                <Paperclip className="size-5" />
              </button>
            )}
            <div className="min-w-0 flex-1">
              {file ? (
                <div className="mb-1 flex items-center gap-2 rounded-lg bg-muted px-2 py-1 text-xs">
                  <span className="truncate">{file.name}</span>
                  <button type="button" onClick={() => setFile(null)} aria-label={ar.delete}>
                    <X className="size-3.5" />
                  </button>
                </div>
              ) : null}
              <textarea
                ref={composerRef}
                rows={1}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder={editing && hasMedia(editing) ? ar.editCaption : ar.typeMessage}
                className="max-h-28 w-full resize-none rounded-2xl border border-border bg-background px-3 py-2 text-sm outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={
                sending ||
                (editing ? !text.trim() && !hasMedia(editing) : !text.trim() && !file)
              }
              className="mb-0.5 flex size-10 items-center justify-center rounded-full bg-[#517da2] text-white disabled:opacity-40"
              aria-label={editing ? ar.save : ar.send}
            >
              {editing ? <Check className="size-4" /> : <Send className="size-4" />}
            </button>
          </form>
        </div>

        <AnimatePresence>
          {panelOpen ? (
            <motion.div
              key="mobile-orders"
              className="absolute inset-0 z-20 flex flex-col justify-end md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <button
                type="button"
                className="absolute inset-0 bg-black/40"
                aria-label={ar.hideUserOrders}
                onClick={() => setPanelOpen(false)}
              />
              <motion.div
                role="dialog"
                aria-label={ar.userOrders}
                className="relative z-10 flex max-h-[82%] min-h-[18rem] flex-col rounded-t-3xl bg-[#f4f7fb] pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgba(15,23,42,0.22)]"
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 30, stiffness: 340 }}
              >
                <div className="flex shrink-0 justify-center pt-2">
                  <div className="h-1 w-10 rounded-full bg-slate-300" />
                </div>
                <UserOrdersPanel
                  serviceId={serviceId}
                  onServiceChange={setServiceId}
                  userServices={userServices}
                  allServicesCount={allServicesCount}
                  orderTab={orderTab}
                  onTabChange={setOrderTab}
                  orderCounts={orderCounts}
                  ordersLoading={ordersLoading}
                  sortedOrders={sortedOrders}
                  activeId={activeId}
                  onSelect={selectOrder}
                  onChangeStatus={setStatusTarget}
                  onClose={() => setPanelOpen(false)}
                />
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {menu ? (
          <>
            <button
              type="button"
              className="absolute inset-0 z-30 cursor-default"
              aria-label={ar.cancel}
              onClick={() => setMenu(null)}
            />
            <div
              role="menu"
              className="absolute z-40 min-w-[10.5rem] overflow-hidden rounded-xl bg-white py-1 text-sm shadow-xl ring-1 ring-black/10"
              style={{ left: menu.left, top: menu.top }}
            >
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-start text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  const msg = messages.find((m) => m.id === menu.id);
                  if (msg) startEdit(msg);
                }}
              >
                <Pencil className="size-3.5" />
                {ar.edit}
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-start text-red-600 hover:bg-red-50"
                onClick={() => {
                  const msg = messages.find((m) => m.id === menu.id);
                  setMenu(null);
                  if (msg) setDeleteTarget(msg);
                }}
              >
                <Trash2 className="size-3.5" />
                {ar.delete}
              </button>
            </div>
          </>
        ) : null}
      </div>

      <Dialog
        nested
        open={Boolean(deleteTarget)}
        onOpenChange={(next) => {
          if (!next) setDeleteTarget(null);
        }}
        title={ar.deleteMessage}
        description={ar.confirmDeleteMessage}
        size="sm"
        footer={
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>
              {ar.cancel}
            </Button>
            <Button type="button" variant="danger" loading={sending} onClick={() => void confirmDelete()}>
              {ar.delete}
            </Button>
          </div>
        }
      >
        {deleteTarget?.text ? (
          <div className="rounded-xl bg-muted px-3 py-2 text-sm text-slate-700">{deleteTarget.text}</div>
        ) : (
          <div className="text-sm text-muted-foreground">{deleteTarget?.filename || ar.confirmDeleteMessage}</div>
        )}
      </Dialog>

      <Dialog
        nested
        open={Boolean(statusTarget)}
        onOpenChange={(next) => {
          if (!next) closeStatusDialog();
        }}
        title={ar.changeStatus}
        description={
          statusTarget
            ? `#${statusTarget.orderNumber} · ${STATUS_LABEL[statusTarget.status] ?? statusTarget.status}`
            : ar.statusChangeMessage
        }
        size="md"
        footer={
          <Button type="button" variant="outline" onClick={closeStatusDialog}>
            {ar.cancel}
          </Button>
        }
      >
        <div className="space-y-4">
          <div>
            <Label>{ar.statusChangeMessage}</Label>
            <textarea
              className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2"
              placeholder={ar.statusChangeMessage}
              value={statusMessage}
              onChange={(e) => setStatusMessage(e.target.value)}
              rows={4}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="cursor-pointer rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground">
              {ar.attachFile}
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,.csv,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/*,application/pdf"
                className="hidden"
                onChange={(e) => setStatusFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {statusFile ? (
              <span className="text-xs text-muted-foreground">
                {statusFile.name}
                <button type="button" className="ms-2 text-danger" onClick={() => setStatusFile(null)}>
                  {ar.delete}
                </button>
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">{ar.statusChangeFileHint}</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {(statusTarget ? TRANSITIONS[statusTarget.status] ?? [] : []).map((s) => (
              <Button
                key={s}
                variant="outline"
                loading={statusBusy === s}
                onClick={() => void changeOrderStatus(s)}
              >
                {STATUS_LABEL[s]}
              </Button>
            ))}
            {statusTarget && (TRANSITIONS[statusTarget.status] ?? []).length === 0 ? (
              <div className="text-xs text-muted-foreground">{ar.noTransitions}</div>
            ) : null}
          </div>
        </div>
      </Dialog>
    </Dialog>
  );
}
