"use client";

import { useEffect, useState } from "react";
import { ar } from "@/i18n/ar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatTime } from "@/lib/utils";

const CATEGORIES = ["AUTH", "SECURITY", "USERS", "BOTS", "REQUESTS", "ORDERS", "BLOCKS", "GROUPS"];

type AuditLog = {
  id: string;
  category?: string;
  action?: string;
  entityId?: string | null;
  metadata?: unknown;
  before?: unknown;
  after?: unknown;
  createdAt?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasKeys(value: unknown) {
  return isRecord(value) && Object.keys(value).length > 0;
}

function logHasBody(log: AuditLog) {
  return hasKeys(log.before) || hasKeys(log.after) || hasKeys(log.metadata);
}

function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  if (!hasKeys(value) && !Array.isArray(value)) return null;
  return (
    <div className="min-w-0">
      <div className="mb-1 text-xs font-medium text-muted-foreground">{title}</div>
      <pre
        dir="ltr"
        className="max-h-80 overflow-auto rounded-xl bg-muted p-3 text-left font-mono text-xs leading-relaxed text-foreground"
      >
        {prettyJson(value)}
      </pre>
    </div>
  );
}

export default function LogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});

  async function load() {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (category) params.set("category", category);
    const res = await fetch(`/api/audit-logs?${params}`);
    setLogs((await res.json()).logs ?? []);
  }

  useEffect(() => {
    load();
  }, [search, category]);

  function toggle(id: string) {
    setOpenIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{ar.logs}</h1>
      <div className="flex gap-2">
        <Input placeholder={ar.search} value={search} onChange={(e) => setSearch(e.target.value)} />
        <select
          className="rounded-xl border border-border bg-card px-3 py-2 text-sm"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">الكل</option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        {logs.map((l) => {
          const open = Boolean(openIds[l.id]);
          const hasBody = logHasBody(l);
          return (
            <div key={l.id} className="rounded-2xl border border-border bg-card p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium">
                    {String(l.category)} / {String(l.action)}
                  </div>
                  <div className="text-xs text-muted-foreground">{formatTime(String(l.createdAt))}</div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0 px-3 py-1.5 text-xs"
                  disabled={!hasBody}
                  onClick={() => toggle(l.id)}
                >
                  {open ? ar.hideBody : ar.showBody}
                </Button>
              </div>
              {open ? (
                hasBody ? (
                  <div
                    className={
                      hasKeys(l.before) && hasKeys(l.after)
                        ? "mt-3 grid gap-3 md:grid-cols-2"
                        : "mt-3 grid gap-3"
                    }
                  >
                    <JsonBlock title={ar.logBefore} value={l.before} />
                    <JsonBlock title={ar.logAfter} value={l.after} />
                    <div className={hasKeys(l.before) && hasKeys(l.after) ? "md:col-span-2" : undefined}>
                      <JsonBlock title={ar.logMetadata} value={l.metadata} />
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">{ar.noLogBody}</p>
                )
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
