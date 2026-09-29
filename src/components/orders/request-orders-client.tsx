"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Inbox,
  MessageCircle,
  MessageSquare,
  Paperclip,
  Search,
  SearchX,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { ar } from "@/i18n/ar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/card";
import { cn, formatTime, relativeTime } from "@/lib/utils";
import { USERNAME_FILTER_FIELD, operatorsForFilterField } from "@/lib/orders/filter-builder";
import type { FilterOperator, OrderAdminFields, OrderFilter, OrderStatus, RequestField } from "@/types";
import { useToast } from "@/components/ui/toast";
import { detectMediaType, displayFieldAnswer, fieldAnswerFileUrls, fieldAnswerLabel, orderHasPendingTranscript } from "@/lib/orders/field-answer";
import { InlineVoiceButton } from "@/components/orders/field-answer-media";
import { orderFieldDefinitionFor } from "@/lib/orders/order-field-rows";
import { parseAdminFields } from "@/lib/orders/admin-fields";
import { OrderChatDialog } from "@/components/orders/order-chat-dialog";
import { AdminFieldsButton, AdminFieldsDialog } from "@/components/orders/admin-fields-dialog";
import { StatusBadge, statusTone } from "@/components/orders/status-badge";
import { badgeDotClass } from "@/components/ui/badge";

const STATUSES: OrderStatus[] = ["PENDING", "REVIEWING", "IN_PROGRESS", "RESOLVED", "REJECTED", "CLOSED"];

const STATUS_LABEL: Record<string, string> = {
  PENDING: ar.pending,
  REVIEWING: ar.reviewing,
  IN_PROGRESS: ar.inProgress,
  RESOLVED: ar.resolved,
  COMPLETED: ar.resolved,
  REJECTED: ar.rejected,
  CLOSED: ar.closed,
  ARCHIVED: ar.closed,
};

type RequestTypeRow = {
  id: string;
  name: string;
  slug: string;
  botId: string;
  description?: string;
  active: boolean;
  telegramGroupId?: string | null;
  fields: RequestField[];
};

type OrderRow = {
  id: string;
  orderNumber: string;
  telegramUsername?: string | null;
  telegramName?: string | null;
  telegramUserId: number;
  photoUrl?: string | null;
  status: OrderStatus;
  createdAt: string;
  updatedAt?: string;
  fields?: Record<string, unknown>;
  formFields?: unknown;
  adminFields?: OrderAdminFields | null;
  botId?: string;
  requestTypeId?: string;
};

function isTableField(field: RequestField) {
  if (!field.active) return false;
  if (field.type === "INSTRUCTION") return false;
  return true;
}

function fieldAnswer(order: OrderRow, field: RequestField) {
  return displayFieldAnswer(orderFieldDefinitionFor(order, field), order.fields?.[field.name]);
}

function FieldCell({ order, field }: { order: OrderRow; field: RequestField }) {
  const answer = fieldAnswer(order, field);
  const label = fieldAnswerLabel(answer);
  const playable = detectMediaType(answer) === "audio" && Boolean(answer.gridFsId || answer.telegramFileId);
  if (!playable) return <span className="block max-w-[12rem] truncate">{label}</span>;
  const transcript = answer.transcript;
  const text = transcript?.status === "ready" ? transcript.text : "";
  return (
    <div className="flex w-full min-w-[16rem] max-w-[36rem] flex-col gap-1.5">
      <InlineVoiceButton urls={fieldAnswerFileUrls(order.id, field.name, answer)} />
      {text ? (
        <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-foreground" title={text}>
          {text}
        </p>
      ) : transcript?.status === "pending" ? (
        <p className="text-xs text-muted-foreground">{ar.voiceTranscriptPending}</p>
      ) : transcript?.status === "failed" ? (
        <p className="text-xs text-muted-foreground">{ar.voiceTranscriptFailed}</p>
      ) : null}
    </div>
  );
}

const PAGE_SIZES = [10, 20, 50];

function pageWindow(page: number, totalPages: number) {
  const width = 5;
  let start = Math.max(1, page - 2);
  const end = Math.min(totalPages, start + width - 1);
  start = Math.max(1, end - width + 1);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

function OrdersPagination({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const pages = pageWindow(page, totalPages);
  return (
    <nav
      aria-label={ar.pageOf.replace("{page}", String(page)).replace("{total}", String(totalPages))}
      className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <span className="text-sm text-muted-foreground">
        {ar.showingRange.replace("{from}", String(from)).replace("{to}", String(to)).replace("{total}", String(total))}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          {ar.rowsPerPage}
          <Select
            aria-label={ar.rowsPerPage}
            value={String(pageSize)}
            onChange={(e) => onPageSize(Number(e.target.value))}
            className="h-8 w-[4.5rem]"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </Select>
        </label>
        <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronRight className="size-4" />
          {ar.previous}
        </Button>
        {pages.map((n) => (
          <Button
            key={n}
            type="button"
            variant={n === page ? "secondary" : "outline"}
            size="sm"
            aria-current={n === page ? "page" : undefined}
            onClick={() => onPage(n)}
          >
            {n}
          </Button>
        ))}
        <Button type="button" variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          {ar.next}
          <ChevronLeft className="size-4" />
        </Button>
      </div>
    </nav>
  );
}

function operatorLabel(op: FilterOperator) {
  return ar.operators[op] ?? op;
}

function avatarColor(id: number) {
  const hues = [12, 32, 152, 188, 212, 262, 328];
  return `hsl(${hues[Math.abs(id) % hues.length]} 42% 44%)`;
}

function initials(name: string) {
  const parts = name.replace(/^@/, "").trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "U";
}

function ComplainantAvatar({ order, size = "size-9" }: { order: OrderRow; size?: string }) {
  const [failed, setFailed] = useState(false);
  const name = order.telegramName || order.telegramUsername || "";
  useEffect(() => {
    setFailed(false);
  }, [order.photoUrl]);
  if (order.photoUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={order.photoUrl}
        alt=""
        className={cn(size, "shrink-0 rounded-full object-cover ring-1 ring-border")}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div
      className={cn(size, "flex shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ring-1 ring-border")}
      style={{ background: avatarColor(Number(order.telegramUserId) || 0) }}
      aria-hidden
    >
      {initials(name)}
    </div>
  );
}

function complainantName(order: OrderRow) {
  return order.telegramName || (order.telegramUsername ? `@${order.telegramUsername}` : String(order.telegramUserId));
}

export default function RequestOrdersClient() {
  const { slug } = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const orderQuery = searchParams.get("order");
  const statusQuery = searchParams.get("status") as OrderStatus | null;
  const toast = useToast();

  const [requestType, setRequestType] = useState<RequestTypeRow | null>(null);
  const [loadingType, setLoadingType] = useState(true);
  const [status, setStatus] = useState<OrderStatus>(
    statusQuery && STATUSES.includes(statusQuery) ? statusQuery : "PENDING",
  );
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [transcriptTick, setTranscriptTick] = useState(0);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [search, setSearch] = useState(orderQuery ?? "");
  const [filters, setFilters] = useState<OrderFilter[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftField, setDraftField] = useState("");
  const [draftOperator, setDraftOperator] = useState<FilterOperator>("eq");
  const [draftValue, setDraftValue] = useState("");
  const [draftValueTo, setDraftValueTo] = useState("");
  const [chatOrderId, setChatOrderId] = useState<string | null>(null);
  const [adminOrder, setAdminOrder] = useState<OrderRow | null>(null);
  const [rowMenu, setRowMenu] = useState<{ order: OrderRow; x: number; y: number } | null>(null);
  const [rowAction, setRowAction] = useState<{ kind: "message" | "attach" | "block"; order: OrderRow } | null>(null);
  const [actionText, setActionText] = useState("");
  const [actionFile, setActionFile] = useState<File | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const pressTimer = useRef(0);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const suppressRowClick = useRef(false);

  const columns = useMemo(
    () => (requestType?.fields ?? []).filter(isTableField).sort((a, b) => a.order - b.order),
    [requestType],
  );

  const filterFields = columns;
  const filterChoices = [
    { name: USERNAME_FILTER_FIELD, label: ar.telegramUsername, type: "TEXT" as const },
    ...filterFields.map((field) => ({ name: field.name, label: field.label, type: field.type })),
  ];
  const draftChoice = filterChoices.find((field) => field.name === draftField) ?? filterChoices[0];
  const draftFieldMeta = filterFields.find((f) => f.name === draftField);
  const draftOperators = operatorsForFilterField(draftChoice?.name ?? "", draftChoice?.type);
  const allTotal = STATUSES.reduce((sum, s) => sum + (counts[s] ?? 0), 0);
  const slugKey = Array.isArray(slug) ? slug[0] : String(slug ?? "");

  useEffect(() => {
    let cancelled = false;
    async function loadType() {
      setLoadingType(true);
      setRequestType(null);
      try {
        const res = await fetch(`/api/request-types/${encodeURIComponent(slugKey)}`);
        if (!res.ok) {
          if (!cancelled) setRequestType(null);
          return;
        }
        const data = await res.json();
        if (!cancelled) setRequestType(data.requestType ?? null);
      } finally {
        if (!cancelled) setLoadingType(false);
      }
    }
    void loadType();
    return () => {
      cancelled = true;
    };
  }, [slugKey]);

  useEffect(() => {
    if (statusQuery && STATUSES.includes(statusQuery) && statusQuery !== status) {
      setStatus(statusQuery);
      setPage(1);
    }
  }, [statusQuery, status]);

  useEffect(() => {
    if (!requestType) return;
    if (!draftField && filterFields[0]) {
      setDraftField(filterFields[0].name);
      const ops = operatorsForFilterField(filterFields[0].name, filterFields[0].type);
      setDraftOperator(ops[0] ?? "eq");
    }
  }, [requestType, filterFields, draftField]);

  useEffect(() => {
    if (!requestType) return;
    let cancelled = false;
    async function loadOrders() {
      if (transcriptTick === 0) setLoadingOrders(true);
      try {
        const params = new URLSearchParams({
          requestTypeId: requestType!.id,
          status,
          page: String(page),
          pageSize: String(pageSize),
        });
        if (search.trim()) params.set("search", search.trim());
        if (filters.length) params.set("filters", JSON.stringify(filters));
        const res = await fetch(`/api/orders?${params}`);
        const data = await res.json();
        if (!res.ok) {
          toast(ar.loadOrdersFailed);
          return;
        }
        if (cancelled) return;
        setOrders(
          ((data.items ?? data.orders ?? []) as OrderRow[]).map((o) => ({
            ...o,
            id: String((o as { id?: string }).id ?? ""),
            createdAt: String(o.createdAt),
            updatedAt: o.updatedAt ? String(o.updatedAt) : undefined,
            status: o.status,
          })),
        );
        setTotal(data.total ?? 0);
        setCounts(data.counts ?? {});
      } finally {
        if (!cancelled) setLoadingOrders(false);
      }
    }
    void loadOrders();
    return () => {
      cancelled = true;
    };
  }, [requestType, status, page, pageSize, search, filters, toast, transcriptTick]);

  const transcriptPending = orders.some((order) => orderHasPendingTranscript(order.fields));
  useEffect(() => {
    if (!transcriptPending) return;
    const timer = window.setInterval(() => setTranscriptTick((tick) => tick + 1), 4000);
    return () => window.clearInterval(timer);
  }, [transcriptPending]);

  useEffect(() => {
    if (!loadingType && !requestType && slug) {
      const t = window.setTimeout(() => router.replace("/requests"), 50);
      return () => window.clearTimeout(t);
    }
  }, [loadingType, requestType, slug, router]);

  function addFilter() {
    if (!draftField) return;
    const next: OrderFilter = {
      field: draftField,
      operator: draftOperator,
      value: draftOperator === "yes" || draftOperator === "no" ? undefined : draftValue,
      valueTo: draftOperator === "between" ? draftValueTo : undefined,
    };
    setFilters((prev) => [...prev, next]);
    setPage(1);
  }

  function clearFilters() {
    setFilters([]);
    setDraftValue("");
    setDraftValueTo("");
    setPage(1);
  }

  function removeFilter(index: number) {
    setFilters((prev) => prev.filter((_, i) => i !== index));
    setPage(1);
  }

  function openRowMenu(order: OrderRow, x: number, y: number) {
    const width = 220;
    const height = 188;
    setRowMenu({
      order,
      x: Math.min(Math.max(8, x), window.innerWidth - width - 8),
      y: Math.min(Math.max(8, y), window.innerHeight - height - 8),
    });
  }

  function clearRowPress() {
    window.clearTimeout(pressTimer.current);
    pressStart.current = null;
  }

  function onRowPointerDown(event: ReactPointerEvent, order: OrderRow) {
    if (event.pointerType === "mouse") return;
    if ((event.target as HTMLElement).closest("a,button,input,textarea")) return;
    pressStart.current = { x: event.clientX, y: event.clientY };
    pressTimer.current = window.setTimeout(() => {
      suppressRowClick.current = true;
      openRowMenu(order, event.clientX, event.clientY);
      pressStart.current = null;
    }, 480);
  }

  function onRowPointerMove(event: ReactPointerEvent) {
    if (!pressStart.current) return;
    const dx = event.clientX - pressStart.current.x;
    const dy = event.clientY - pressStart.current.y;
    if (dx * dx + dy * dy > 100) clearRowPress();
  }

  function onRowContextMenu(event: ReactMouseEvent, order: OrderRow) {
    event.preventDefault();
    openRowMenu(order, event.clientX, event.clientY);
  }

  function chooseRowAction(kind: "message" | "attach" | "block" | "admin") {
    const order = rowMenu?.order;
    setRowMenu(null);
    if (!order) return;
    if (kind === "admin") {
      setAdminOrder(order);
      return;
    }
    setActionText("");
    setActionFile(null);
    setActionReason("");
    setRowAction({ kind, order });
  }

  useEffect(() => {
    if (!rowMenu) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setRowMenu(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rowMenu]);

  async function submitRowMessage() {
    if (!rowAction || rowAction.kind !== "message") return;
    if (!actionText.trim() && !actionFile) return;
    setActionBusy(true);
    try {
      let fileId: string | undefined;
      if (actionFile) {
        const body = new FormData();
        body.append("file", actionFile);
        body.append("ownerId", rowAction.order.id);
        const uploaded = await fetch("/api/uploads", { method: "POST", body });
        if (!uploaded.ok) {
          toast(ar.sendFailed);
          return;
        }
        fileId = String((await uploaded.json()).fileId);
      }
      const res = await fetch(`/api/orders/${rowAction.order.id}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: actionText.trim() || undefined, fileId }),
      });
      toast(res.ok ? ar.messageSent : ar.sendFailed);
      if (res.ok) setRowAction(null);
    } finally {
      setActionBusy(false);
    }
  }

  async function submitRowAttachment() {
    if (!rowAction || !actionFile) return;
    setActionBusy(true);
    try {
      const body = new FormData();
      body.append("file", actionFile);
      const res = await fetch(`/api/orders/${rowAction.order.id}/attachments`, { method: "POST", body });
      toast(res.ok ? ar.toast.fileUploaded : ar.sendFailed);
      if (res.ok) setRowAction(null);
    } finally {
      setActionBusy(false);
    }
  }

  async function submitRowBlock() {
    if (!rowAction) return;
    const order = rowAction.order;
    if (!order.botId) {
      toast(ar.sendFailed);
      return;
    }
    setActionBusy(true);
    try {
      const res = await fetch("/api/blocked-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegramUserId: Number(order.telegramUserId),
          username: order.telegramUsername || undefined,
          firstName: order.telegramName || undefined,
          botId: order.botId,
          requestTypeId: order.requestTypeId || requestType?.id,
          reason: actionReason,
        }),
      });
      toast(res.ok ? ar.toast.userBlocked : ar.sendFailed);
      if (res.ok) setRowAction(null);
    } finally {
      setActionBusy(false);
    }
  }

  if (loadingType) {
    return (
      <div className="space-y-5" aria-busy="true">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-10 w-full max-w-2xl" />
        <Card className="space-y-3 p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </Card>
      </div>
    );
  }

  if (!requestType) {
    return (
      <Card>
        <EmptyState
          icon={<SearchX />}
          title={ar.requestNotFound}
          action={
            <Button type="button" onClick={() => router.replace("/requests")}>
              {ar.requests}
            </Button>
          }
        />
      </Card>
    );
  }

  const narrowing = Boolean(search.trim()) || filters.length > 0;
  const showFilterPanel = filtersOpen || filters.length > 0;
  const initialLoading = loadingOrders && orders.length === 0;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={ar.navComplaints}
        title={requestType.name}
        description={`${allTotal} ${ar.orderWord} · ${STATUS_LABEL[status]}: ${total}`}
      />

      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <div role="tablist" aria-label={ar.status} className="inline-flex min-w-max gap-1 rounded-xl border border-border bg-card p-1 shadow-card">
          {STATUSES.map((s) => {
            const active = s === status;
            return (
              <Link
                key={s}
                role="tab"
                aria-selected={active}
                href={`/requests/${encodeURIComponent(slugKey)}?status=${s}`}
                className={cn(
                  "inline-flex h-8 items-center gap-2 rounded-lg px-3 text-sm transition-colors",
                  active ? "bg-primary-soft font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <span aria-hidden className={cn("size-1.5 rounded-full", badgeDotClass(statusTone(s)))} />
                {STATUS_LABEL[s]}
                <span className={cn("text-xs tabular-nums", active ? "text-primary/80" : "text-muted-foreground/80")}>
                  {counts[s] ?? 0}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-md">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label={ar.search}
            placeholder={ar.searchComplaints}
            className="ps-9"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <Button
          type="button"
          variant={showFilterPanel ? "secondary" : "outline"}
          aria-expanded={showFilterPanel}
          onClick={() => setFiltersOpen((v) => !v)}
        >
          <SlidersHorizontal className="size-4" />
          {ar.showFilters}
          {filters.length ? (
            <span className="rounded-full bg-primary px-1.5 text-[11px] leading-5 text-primary-foreground tabular-nums">
              {filters.length}
            </span>
          ) : null}
        </Button>
      </div>

      {showFilterPanel ? (
        <Card className="space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] lg:items-end">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground" htmlFor="flt-field">
                {ar.column}
              </label>
              <Select
                id="flt-field"
                value={draftField}
                onChange={(e) => {
                  const name = e.target.value;
                  const choice = filterChoices.find((field) => field.name === name);
                  const ops = operatorsForFilterField(name, choice?.type);
                  setDraftField(name);
                  setDraftOperator(ops[0] ?? "contains");
                  setDraftValue("");
                  setDraftValueTo("");
                }}
              >
                {filterChoices.map((field) => (
                  <option key={field.name} value={field.name}>
                    {field.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground" htmlFor="flt-op">
                {ar.operator}
              </label>
              <Select
                id="flt-op"
                value={draftOperator}
                onChange={(e) => setDraftOperator(e.target.value as FilterOperator)}
              >
                {draftOperators.map((op) => (
                  <option key={op} value={op}>
                    {operatorLabel(op)}
                  </option>
                ))}
              </Select>
            </div>
            {draftOperator !== "yes" && draftOperator !== "no" ? (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground" htmlFor="flt-value">
                  {ar.value}
                </label>
                {draftFieldMeta?.type === "SELECT" || draftFieldMeta?.type === "RADIO" ? (
                  <Select id="flt-value" value={draftValue} onChange={(e) => setDraftValue(e.target.value)}>
                    <option value="">—</option>
                    {(draftFieldMeta.options ?? []).map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input id="flt-value" value={draftValue} onChange={(e) => setDraftValue(e.target.value)} />
                )}
                {draftChoice?.type === "DYNAMIC" ? (
                  <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{ar.voiceFilterHint}</p>
                ) : null}
              </div>
            ) : (
              <div className="hidden lg:block" />
            )}
            {draftOperator === "between" ? (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground" htmlFor="flt-value2">
                  {ar.value} 2
                </label>
                <Input id="flt-value2" value={draftValueTo} onChange={(e) => setDraftValueTo(e.target.value)} />
              </div>
            ) : (
              <div className="hidden lg:block" />
            )}
            <div className="flex gap-2">
              <Button type="button" onClick={addFilter}>
                {ar.addFilter}
              </Button>
              <Button type="button" variant="ghost" onClick={clearFilters} disabled={filters.length === 0}>
                {ar.clearAll}
              </Button>
            </div>
          </div>
          {filters.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <span className="text-xs text-muted-foreground">{ar.activeFilters}:</span>
              {filters.map((f, i) => {
                const label = filterChoices.find((x) => x.name === f.field)?.label ?? f.field;
                const valuePart =
                  f.operator === "yes" || f.operator === "no"
                    ? ""
                    : f.operator === "between"
                      ? ` ${String(f.value)} — ${String(f.valueTo)}`
                      : ` ${String(f.value ?? "")}`;
                return (
                  <span
                    key={`${f.field}-${f.operator}-${i}`}
                    className="inline-flex items-center gap-1 rounded-full bg-primary-soft py-0.5 pe-1 ps-2.5 text-xs text-primary"
                  >
                    {label} {operatorLabel(f.operator)}
                    {valuePart}
                    <button
                      type="button"
                      onClick={() => removeFilter(i)}
                      className="flex size-5 items-center justify-center rounded-full hover:bg-primary/10"
                      aria-label={`${ar.removeFilter}: ${label}`}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          ) : null}
        </Card>
      ) : null}

      <Card className={cn("hidden overflow-hidden md:block", loadingOrders && orders.length > 0 && "opacity-70 transition-opacity")}>
        <div className="relative overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-start font-medium">{ar.orderNumber}</th>
                <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-start font-medium">{ar.complainant}</th>
                {columns.map((col) => (
                  <th key={col.id} scope="col" className="whitespace-nowrap px-4 py-2.5 text-start font-medium">
                    {col.label}
                  </th>
                ))}
                <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-start font-medium">{ar.adminNotes}</th>
                <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-start font-medium">{ar.status}</th>
                <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-start font-medium">{ar.createdAt}</th>
                <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-start font-medium">{ar.lastUpdated}</th>
                <th scope="col" className="px-4 py-2.5 text-end font-medium">
                  <span className="sr-only">{ar.actions}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {initialLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={`sk-${i}`}>
                      <td colSpan={columns.length + 7} className="px-4 py-3">
                        <Skeleton className="h-6 w-full" />
                      </td>
                    </tr>
                  ))
                : null}
              {orders.map((order) => {
                const admin = parseAdminFields(order.adminFields);
                return (
                  <tr
                    key={order.id}
                    className="group cursor-pointer transition-colors hover:bg-muted/40"
                    onContextMenu={(e) => onRowContextMenu(e, order)}
                    onPointerDown={(e) => onRowPointerDown(e, order)}
                    onPointerUp={clearRowPress}
                    onPointerCancel={clearRowPress}
                    onPointerMove={onRowPointerMove}
                    onClick={(e) => {
                      if (suppressRowClick.current) {
                        suppressRowClick.current = false;
                        return;
                      }
                      if ((e.target as HTMLElement).closest("a,button")) return;
                      router.push(`/complaints/${order.id}`);
                    }}
                  >
                    <td className="whitespace-nowrap px-4 py-3">
                      <Link
                        href={`/complaints/${order.id}`}
                        className="font-semibold tabular-nums text-foreground hover:text-primary"
                        dir="ltr"
                      >
                        {order.orderNumber}
                      </Link>
                    </td>
                    <td className="max-w-[16rem] px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <ComplainantAvatar order={order} />
                        <div className="min-w-0">
                          <div className="truncate font-medium">{order.telegramName || "—"}</div>
                          <div className="truncate text-xs text-muted-foreground" dir="ltr">
                            {order.telegramUsername ? `@${order.telegramUsername}` : order.telegramUserId}
                          </div>
                        </div>
                      </div>
                    </td>
                    {columns.map((col) => {
                      const value = fieldAnswerLabel(fieldAnswer(order, col));
                      return (
                        <td key={col.id} className="px-4 py-3 align-top text-foreground/90" title={value}>
                          <FieldCell order={order} field={col} />
                        </td>
                      );
                    })}
                    <td className="max-w-[12rem] px-4 py-3">
                      {admin.adminNotes || admin.attachmentFileId ? (
                        <div className="flex min-w-0 items-center gap-1.5">
                          {admin.attachmentFileId ? (
                            <a
                              href={`/api/files/${admin.attachmentFileId}`}
                              target="_blank"
                              rel="noreferrer"
                              className="shrink-0 text-primary"
                              title={admin.attachmentFilename || ar.adminAttachment}
                              aria-label={admin.attachmentFilename || ar.adminAttachment}
                            >
                              <Paperclip className="size-3.5" />
                            </a>
                          ) : null}
                          <span className="truncate text-muted-foreground" title={admin.adminNotes || undefined}>
                            {admin.adminNotes || admin.attachmentFilename || ar.adminAttachment}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatTime(order.createdAt)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {order.updatedAt ? relativeTime(order.updatedAt) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setChatOrderId(order.id)}
                          title={ar.openConversation}
                        >
                          <MessageCircle className="size-3.5" />
                          {ar.conversation}
                        </Button>
                        <AdminFieldsButton onClick={() => setAdminOrder(order)} compact />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!loadingOrders && orders.length === 0 ? <ListEmpty narrowing={narrowing} status={status} /> : null}
        <OrdersPagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPage={setPage}
          onPageSize={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </Card>

      <div className="grid gap-3 md:hidden">
        {initialLoading
          ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36 w-full rounded-2xl" />)
          : null}
        {orders.map((order) => {
          const admin = parseAdminFields(order.adminFields);
          return (
            <Card
              key={order.id}
              className="overflow-hidden"
              onContextMenu={(e) => onRowContextMenu(e, order)}
              onPointerDown={(e) => onRowPointerDown(e, order)}
              onPointerUp={clearRowPress}
              onPointerCancel={clearRowPress}
              onPointerMove={onRowPointerMove}
            >
              <Link href={`/complaints/${order.id}`} className="block px-4 pb-3 pt-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <ComplainantAvatar order={order} />
                    <div className="min-w-0">
                      <div className="font-semibold tabular-nums" dir="ltr">
                        {order.orderNumber}
                      </div>
                      <div className="mt-0.5 truncate text-sm text-muted-foreground">{complainantName(order)}</div>
                    </div>
                  </div>
                  <StatusBadge status={order.status} />
                </div>
                <dl className="mt-3 space-y-1.5 text-sm">
                  {columns.slice(0, 3).map((col) => (
                    <div key={col.id} className="flex justify-between gap-3">
                      <dt className="shrink-0 text-muted-foreground">{col.label}</dt>
                      <dd className="min-w-0 flex-1 text-end font-medium">
                        <FieldCell order={order} field={col} />
                      </dd>
                    </div>
                  ))}
                  {admin.adminNotes || admin.attachmentFileId ? (
                    <div className="flex justify-between gap-3">
                      <dt className="shrink-0 text-muted-foreground">{ar.adminNotes}</dt>
                      <dd className="flex min-w-0 items-center justify-end gap-1 truncate text-end font-medium">
                        {admin.attachmentFileId ? <Paperclip className="size-3.5 shrink-0 text-primary" /> : null}
                        <span className="truncate">{admin.adminNotes || admin.attachmentFilename || ar.adminAttachment}</span>
                      </dd>
                    </div>
                  ) : null}
                </dl>
                <div className="mt-3 text-xs text-muted-foreground">{formatTime(order.createdAt)}</div>
              </Link>
              <div className="flex items-center gap-1 border-t border-border bg-muted/30 px-2 py-1.5">
                <Button type="button" variant="ghost" size="sm" onClick={() => setChatOrderId(order.id)}>
                  <MessageCircle className="size-3.5" />
                  {ar.conversation}
                </Button>
                <AdminFieldsButton onClick={() => setAdminOrder(order)} compact />
              </div>
            </Card>
          );
        })}
        {!loadingOrders && orders.length === 0 ? (
          <Card>
            <ListEmpty narrowing={narrowing} status={status} />
          </Card>
        ) : null}
      </div>

      <Card className="md:hidden">
        <OrdersPagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPage={setPage}
          onPageSize={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </Card>

      {rowMenu ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[70] cursor-default"
            aria-label={ar.cancel}
            onClick={() => setRowMenu(null)}
          />
          <div
            role="menu"
            className="fixed z-[80] min-w-52 overflow-hidden rounded-xl border border-border bg-card p-1 shadow-pop"
            style={{ left: rowMenu.x, top: rowMenu.y }}
          >
            <button
              type="button"
              role="menuitem"
              className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm hover:bg-muted"
              onClick={() => chooseRowAction("message")}
            >
              <MessageSquare className="size-4 text-muted-foreground" />
              {ar.sendMessage}
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm hover:bg-muted"
              onClick={() => chooseRowAction("attach")}
            >
              <Paperclip className="size-4 text-muted-foreground" />
              {ar.attachFile}
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm hover:bg-muted"
              onClick={() => chooseRowAction("admin")}
            >
              <ClipboardList className="size-4 text-muted-foreground" />
              {ar.editAdminFields}
            </button>
            <div className="my-1 h-px bg-border" />
            <button
              type="button"
              role="menuitem"
              className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm text-danger hover:bg-danger-soft"
              onClick={() => chooseRowAction("block")}
            >
              <Ban className="size-4" />
              {ar.block}
            </button>
          </div>
        </>
      ) : null}

      <Dialog
        open={rowAction?.kind === "message"}
        onOpenChange={(open) => {
          if (!open) setRowAction(null);
        }}
        title={ar.sendMessage}
        size="md"
        footer={
          <>
            <Button type="button" loading={actionBusy} disabled={!actionText.trim() && !actionFile} onClick={() => void submitRowMessage()}>
              {ar.send}
            </Button>
            <Button type="button" variant="outline" onClick={() => setRowAction(null)}>
              {ar.cancel}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="row-message">{ar.typeMessage}</Label>
            <Textarea id="row-message" value={actionText} onChange={(e) => setActionText(e.target.value)} rows={5} />
          </div>
          <input type="file" onChange={(e) => setActionFile(e.target.files?.[0] ?? null)} />
        </div>
      </Dialog>

      <Dialog
        open={rowAction?.kind === "attach"}
        onOpenChange={(open) => {
          if (!open) setRowAction(null);
        }}
        title={ar.attachFile}
        size="sm"
        footer={
          <>
            <Button type="button" loading={actionBusy} disabled={!actionFile} onClick={() => void submitRowAttachment()}>
              {ar.attachFile}
            </Button>
            <Button type="button" variant="outline" onClick={() => setRowAction(null)}>
              {ar.cancel}
            </Button>
          </>
        }
      >
        <input type="file" onChange={(e) => setActionFile(e.target.files?.[0] ?? null)} />
      </Dialog>

      <Dialog
        open={rowAction?.kind === "block"}
        onOpenChange={(open) => {
          if (!open) setRowAction(null);
        }}
        title={ar.block}
        description={ar.blockReasonHint}
        size="sm"
        footer={
          <>
            <Button type="button" variant="danger" loading={actionBusy} onClick={() => void submitRowBlock()}>
              {ar.block}
            </Button>
            <Button type="button" variant="outline" onClick={() => setRowAction(null)}>
              {ar.cancel}
            </Button>
          </>
        }
      >
        <div>
          <Label htmlFor="row-block-reason">
            {ar.reason} <span className="font-normal text-muted-foreground">({ar.optional})</span>
          </Label>
          <Input id="row-block-reason" value={actionReason} onChange={(e) => setActionReason(e.target.value)} />
        </div>
      </Dialog>

      <OrderChatDialog
        orderId={chatOrderId}
        open={Boolean(chatOrderId)}
        onOpenChange={(next) => {
          if (!next) setChatOrderId(null);
        }}
        onOrderIdChange={setChatOrderId}
      />
      <AdminFieldsDialog
        open={Boolean(adminOrder)}
        onOpenChange={(open) => {
          if (!open) setAdminOrder(null);
        }}
        orderId={adminOrder?.id ?? null}
        orderNumber={adminOrder?.orderNumber}
        value={adminOrder?.adminFields}
        onSaved={(next) => {
          const id = adminOrder?.id;
          if (!id) return;
          setOrders((prev) => prev.map((row) => (row.id === id ? { ...row, adminFields: next } : row)));
          setAdminOrder((prev) => (prev ? { ...prev, adminFields: next } : prev));
        }}
      />
    </div>
  );
}

function ListEmpty({ narrowing, status }: { narrowing: boolean; status: OrderStatus }) {
  if (narrowing) {
    return <EmptyState icon={<SearchX />} title={ar.noResults} description={ar.noResultsHint} />;
  }
  return (
    <EmptyState
      icon={<Inbox />}
      title={status === "PENDING" ? ar.emptyPending : ar.noOrdersInStatus}
      description={status === "PENDING" ? ar.emptyPendingHint : undefined}
    />
  );
}
