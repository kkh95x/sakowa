"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { ar } from "@/i18n/ar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatTime } from "@/lib/utils";
import { operatorsForField } from "@/lib/orders/filter-builder";
import type { FilterOperator, OrderAdminFields, OrderFilter, OrderStatus, RequestField } from "@/types";
import { useToast } from "@/components/ui/toast";
import { fieldAnswerLabel, parseFieldAnswer } from "@/lib/orders/field-answer";
import { formatPaymentDate, parseAdminFields } from "@/lib/orders/admin-fields";
import { OrderChatDialog } from "@/components/orders/order-chat-dialog";
import { AdminFieldsButton, AdminFieldsDialog } from "@/components/orders/admin-fields-dialog";

const STATUSES: OrderStatus[] = ["PENDING", "REVIEWING", "COMPLETED", "REJECTED", "ARCHIVED"];

const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: ar.pending,
  REVIEWING: ar.reviewing,
  COMPLETED: ar.completed,
  REJECTED: ar.rejected,
  ARCHIVED: ar.archived,
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
  fields?: Record<string, unknown>;
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
  return fieldAnswerLabel(parseFieldAnswer(order.fields?.[field.name], field.type));
}

function dash(value: string | null | undefined) {
  return value?.trim() ? value : "—";
}

function operatorLabel(op: FilterOperator) {
  return ar.operators[op] ?? op;
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

  useEffect(() => {
    let cancelled = false;
    async function loadType() {
      setLoadingType(true);
      setRequestType(null);
      const key = Array.isArray(slug) ? slug[0] : String(slug ?? "");
      try {
        const res = await fetch(`/api/request-types/${encodeURIComponent(key)}`);
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
  }, [slug]);

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
          toast(ar.actionFailed);
          return;
        }
        if (cancelled) return;
        setOrders(
          ((data.items ?? data.orders ?? []) as OrderRow[]).map((o) => ({
            ...o,
            id: String((o as { id?: string }).id ?? ""),
            createdAt: String(o.createdAt),
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
    return <div className="text-sm text-muted-foreground">{ar.loading}</div>;
  }

  if (!requestType) {
    return (
      <div className="space-y-3 rounded-2xl border border-border bg-card p-6">
        <div>{ar.requestNotFound}</div>
        <Button type="button" onClick={() => router.replace("/requests")}>
          {ar.requests}
        </Button>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{requestType.name}</h1>
        <p className="text-sm text-muted-foreground">
          {STATUS_LABEL[status]} · {total} {ar.orderWord}
        </p>
      </div>

      <div className="flex w-full max-w-md gap-2">
        <Input
          placeholder={ar.search}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <div className="font-semibold">{ar.filters}</div>
        <div className="grid gap-2 md:grid-cols-4">
          <div>
            <div className="mb-1 text-xs text-muted-foreground">{ar.column}</div>
            <select
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
              value={draftField}
              onChange={(e) => setDraftField(e.target.value)}
            >
              {filterFields.map((f) => (
                <option key={f.id} value={f.name}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="mb-1 text-xs text-muted-foreground">{ar.operator}</div>
            <select
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
              value={draftOperator}
              onChange={(e) => setDraftOperator(e.target.value as FilterOperator)}
            >
              {draftOperators.map((op) => (
                <option key={op} value={op}>
                  {operatorLabel(op)}
                </option>
              ))}
            </select>
          </div>
          {draftOperator !== "yes" && draftOperator !== "no" && (
            <div>
              <div className="mb-1 text-xs text-muted-foreground">{ar.value}</div>
              {draftFieldMeta?.type === "SELECT" || draftFieldMeta?.type === "RADIO" ? (
                <select
                  className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
                  value={draftValue}
                  onChange={(e) => setDraftValue(e.target.value)}
                >
                  <option value="">—</option>
                  {(draftFieldMeta.options ?? []).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : (
                <Input value={draftValue} onChange={(e) => setDraftValue(e.target.value)} />
              )}
            </div>
          )}
          {draftOperator === "between" && (
            <div>
              <div className="mb-1 text-xs text-muted-foreground">{ar.value} 2</div>
              <Input value={draftValueTo} onChange={(e) => setDraftValueTo(e.target.value)} />
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={addFilter}>
            {ar.addFilter}
          </Button>
          <Button type="button" variant="outline" onClick={clearFilters} disabled={filters.length === 0}>
            {ar.clearAll}
          </Button>
        </div>
        {filters.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {filters.map((f, i) => {
              const label = filterFields.find((x) => x.name === f.field)?.label ?? f.field;
              const valuePart =
                f.operator === "yes" || f.operator === "no"
                  ? ""
                  : f.operator === "between"
                    ? ` ${String(f.value)} — ${String(f.valueTo)}`
                    : ` ${String(f.value ?? "")}`;
              return (
                <button
                  key={`${f.field}-${f.operator}-${i}`}
                  type="button"
                  onClick={() => removeFilter(i)}
                  className="rounded-full bg-muted px-3 py-1 text-xs"
                  title="إزالة"
                >
                  {label} {operatorLabel(f.operator)}
                  {valuePart} ×
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="hidden overflow-x-auto rounded-2xl border border-border bg-card md:block">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/60">
              <tr>
                <th className="px-3 py-2 text-start">{ar.orderNumber}</th>
                <th className="px-3 py-2 text-start">{ar.actions}</th>
                <th className="px-3 py-2 text-start">{ar.telegramUsername}</th>
                <th className="px-3 py-2 text-start">{ar.telegramName}</th>
                <th className="px-3 py-2 text-start">{ar.telegramId}</th>
                {columns.map((col) => (
                  <th key={col.id} className="px-3 py-2 text-start">
                    {col.label}
                  </th>
                ))}
                <th className="px-3 py-2 text-start">{ar.shamCashReceiptNumber}</th>
                <th className="px-3 py-2 text-start">{ar.invoiceNumber}</th>
                <th className="px-3 py-2 text-start">{ar.paymentDate}</th>
                <th className="px-3 py-2 text-start">{ar.adminNotes}</th>
                <th className="px-3 py-2 text-start">{ar.invoiceFile}</th>
                <th className="px-3 py-2 text-start">{ar.orderTime}</th>
                <th className="px-3 py-2 text-start">{ar.status}</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const admin = parseAdminFields(order.adminFields);
                return (
                <tr key={order.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium">{order.orderNumber}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                      <a
                        className="inline-flex items-center rounded-xl border border-border px-2.5 py-1.5 text-sm hover:bg-muted"
                        href={`/orders/${order.id}`}
                      >
                        {ar.open}
                      </a>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-xl bg-[#517da2] px-2.5 py-1.5 text-sm text-white hover:opacity-90"
                        onClick={() => setChatOrderId(order.id)}
                        title={ar.openConversation}
                      >
                        <MessageCircle className="size-3.5" />
                        {ar.openConversation}
                      </button>
                      <AdminFieldsButton onClick={() => setAdminOrder(order)} />
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {order.telegramUsername ? `@${order.telegramUsername}` : "—"}
                  </td>
                  <td className="px-3 py-2">{order.telegramName || "—"}</td>
                  <td className="px-3 py-2">{order.telegramUserId}</td>
                  {columns.map((col) => (
                    <td key={col.id} className="max-w-[12rem] truncate px-3 py-2">
                      {fieldValue(order, col)}
                    </td>
                  ))}
                  <td className="max-w-[10rem] truncate px-3 py-2">{dash(admin.shamCashReceiptNumber)}</td>
                  <td className="max-w-[10rem] truncate px-3 py-2">{dash(admin.invoiceNumber)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{dash(formatPaymentDate(admin.paymentDate))}</td>
                  <td className="max-w-[12rem] truncate px-3 py-2" title={admin.adminNotes || undefined}>
                    {dash(admin.adminNotes)}
                  </td>
                  <td className="max-w-[10rem] truncate px-3 py-2">
                    {admin.invoiceFileId ? (
                      <a
                        className="text-primary underline"
                        href={`/api/files/${admin.invoiceFileId}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {admin.invoiceFilename || ar.invoiceFile}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatTime(order.createdAt)}</td>
                  <td className="px-3 py-2">{STATUS_LABEL[order.status]}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
          {!loadingOrders && orders.length === 0 && (
            <div className="p-8 text-center">
              <div className="font-medium">
                {status === "PENDING" ? ar.emptyPending : ar.noOrdersInStatus}
              </div>
              {status === "PENDING" && (
                <div className="mt-1 text-sm text-muted-foreground">{ar.emptyPendingHint}</div>
              )}
            </div>
          )}
        </div>

        <div className="grid gap-3 md:hidden">
          {orders.map((order) => {
            const admin = parseAdminFields(order.adminFields);
            return (
            <div key={order.id} className="rounded-2xl border border-border bg-card p-4 text-start">
              <div className="flex items-start justify-between gap-2">
                <div className="font-semibold">{order.orderNumber}</div>
                <div className="text-xs text-muted-foreground">{STATUS_LABEL[order.status]}</div>
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {order.telegramUsername ? `@${order.telegramUsername}` : order.telegramName || order.telegramUserId}
              </div>
              <div className="mt-2 space-y-1 text-sm">
                {columns.slice(0, 3).map((col) => (
                  <div key={col.id} className="flex justify-between gap-3">
                    <span className="text-muted-foreground">{col.label}</span>
                    <span className="truncate font-medium">{fieldValue(order, col)}</span>
                  </div>
                ))}
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{ar.shamCashReceiptNumber}</span>
                  <span className="truncate font-medium">{dash(admin.shamCashReceiptNumber)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{ar.invoiceNumber}</span>
                  <span className="truncate font-medium">{dash(admin.invoiceNumber)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{ar.paymentDate}</span>
                  <span className="truncate font-medium">{dash(formatPaymentDate(admin.paymentDate))}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{ar.adminNotes}</span>
                  <span className="truncate font-medium">{dash(admin.adminNotes)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{ar.invoiceFile}</span>
                  <span className="truncate font-medium">
                    {admin.invoiceFileId ? (
                      <a
                        className="text-primary underline"
                        href={`/api/files/${admin.invoiceFileId}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {admin.invoiceFilename || ar.invoiceFile}
                      </a>
                    ) : (
                      "—"
                    )}
                  </span>
                </div>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">{formatTime(order.createdAt)}</div>
              <div className="mt-3 flex flex-nowrap items-center gap-2">
                <a
                  href={`/orders/${order.id}`}
                  className="inline-flex items-center rounded-xl border border-border px-3 py-1.5 text-sm hover:bg-muted"
                >
                  {ar.open}
                </a>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-xl bg-[#517da2] px-3 py-1.5 text-sm text-white hover:opacity-90"
                  onClick={() => setChatOrderId(order.id)}
                  title={ar.openConversation}
                >
                  <MessageCircle className="size-3.5" />
                  {ar.openConversation}
                </button>
                <AdminFieldsButton onClick={() => setAdminOrder(order)} />
              </div>
            </div>
            );
          })}
          {!loadingOrders && orders.length === 0 && (
            <div className="rounded-2xl border border-border bg-card p-6 text-center">
              <div className="font-medium">
                {status === "PENDING" ? ar.emptyPending : ar.noOrdersInStatus}
              </div>
              {status === "PENDING" && (
                <div className="mt-1 text-sm text-muted-foreground">{ar.emptyPendingHint}</div>
              )}
            </div>
          )}
        </div>

        {loadingOrders && <div className="text-sm text-muted-foreground">{ar.loading}</div>}

        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-semibold">{requestType.name}</div>
            <div className="text-sm text-muted-foreground">
              {STATUS_LABEL[status]}: {total} {ar.orderWord}
              <span className="mx-1.5 text-border">·</span>
              {ar.totalRows}: {allTotal}
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">
              صفحة {page} من {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {ar.previous}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              {ar.next}
            </Button>
          </div>
        </div>
      </div>
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
