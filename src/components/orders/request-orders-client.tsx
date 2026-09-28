"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Inbox,
  MessageCircle,
  Paperclip,
  Search,
  SearchX,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { ar } from "@/i18n/ar";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/card";
import { cn, formatTime, relativeTime } from "@/lib/utils";
import { operatorsForField } from "@/lib/orders/filter-builder";
import type { FilterOperator, OrderAdminFields, OrderFilter, OrderStatus, RequestField } from "@/types";
import { useToast } from "@/components/ui/toast";
import { displayFieldAnswer, fieldAnswerLabel } from "@/lib/orders/field-answer";
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

function fieldValue(order: OrderRow, field: RequestField) {
  return fieldAnswerLabel(displayFieldAnswer(orderFieldDefinitionFor(order, field), order.fields?.[field.name]));
}

function operatorLabel(op: FilterOperator) {
  return ar.operators[op] ?? op;
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
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
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

  const columns = useMemo(
    () => (requestType?.fields ?? []).filter(isTableField).sort((a, b) => a.order - b.order),
    [requestType],
  );

  const filterFields = columns;
  const draftFieldMeta = filterFields.find((f) => f.name === draftField);
  const draftOperators = draftFieldMeta ? operatorsForField(draftFieldMeta.type) : [];
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
      const ops = operatorsForField(filterFields[0].type);
      setDraftOperator(ops[0] ?? "eq");
    }
  }, [requestType, filterFields, draftField]);

  useEffect(() => {
    if (!requestType) return;
    let cancelled = false;
    async function loadOrders() {
      setLoadingOrders(true);
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
  }, [requestType, status, page, pageSize, search, filters, toast]);

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

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
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
        {filterFields.length > 0 ? (
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
        ) : null}
      </div>

      {showFilterPanel ? (
        <Card className="space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] lg:items-end">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground" htmlFor="flt-field">
                {ar.column}
              </label>
              <Select id="flt-field" value={draftField} onChange={(e) => setDraftField(e.target.value)}>
                {filterFields.map((f) => (
                  <option key={f.id} value={f.name}>
                    {f.label}
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
                const label = filterFields.find((x) => x.name === f.field)?.label ?? f.field;
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
                    onClick={(e) => {
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
                    <td className="max-w-[14rem] px-4 py-3">
                      <div className="truncate font-medium">{order.telegramName || "—"}</div>
                      <div className="truncate text-xs text-muted-foreground" dir="ltr">
                        {order.telegramUsername ? `@${order.telegramUsername}` : order.telegramUserId}
                      </div>
                    </td>
                    {columns.map((col) => {
                      const value = fieldValue(order, col);
                      return (
                        <td key={col.id} className="max-w-[12rem] truncate px-4 py-3 text-foreground/90" title={value}>
                          {value}
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
      </Card>

      <div className="grid gap-3 md:hidden">
        {initialLoading
          ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36 w-full rounded-2xl" />)
          : null}
        {orders.map((order) => {
          const admin = parseAdminFields(order.adminFields);
          return (
            <Card key={order.id} className="overflow-hidden">
              <Link href={`/complaints/${order.id}`} className="block px-4 pb-3 pt-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold tabular-nums" dir="ltr">
                      {order.orderNumber}
                    </div>
                    <div className="mt-0.5 truncate text-sm text-muted-foreground">{complainantName(order)}</div>
                  </div>
                  <StatusBadge status={order.status} />
                </div>
                <dl className="mt-3 space-y-1.5 text-sm">
                  {columns.slice(0, 3).map((col) => (
                    <div key={col.id} className="flex justify-between gap-3">
                      <dt className="shrink-0 text-muted-foreground">{col.label}</dt>
                      <dd className="min-w-0 truncate text-end font-medium">{fieldValue(order, col)}</dd>
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

      {totalPages > 1 || page > 1 ? (
        <nav aria-label={ar.pageOf.replace("{page}", String(page)).replace("{total}", String(totalPages))} className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">
            {ar.pageOf.replace("{page}", String(page)).replace("{total}", String(totalPages))}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronRight className="size-4" />
              {ar.previous}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              {ar.next}
              <ChevronLeft className="size-4" />
            </Button>
          </div>
        </nav>
      ) : null}

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
