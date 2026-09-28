"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ScrollText, Search } from "lucide-react";
import { ar } from "@/i18n/ar";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/card";
import { cn, formatTime } from "@/lib/utils";

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
        className="max-h-80 overflow-auto rounded-xl border border-border bg-muted/50 p-3 text-left font-mono text-xs leading-relaxed text-foreground"
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
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (category) params.set("category", category);
    try {
      const res = await fetch(`/api/audit-logs?${params}`);
      setLogs((await res.json()).logs ?? []);
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    load();
  }, [search, category]);

  function toggle(id: string) {
    setOpenIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div className="space-y-5">
      <PageHeader title={ar.logs} description={ar.logsDescription} />

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            className="ps-9"
            placeholder={ar.search}
            aria-label={ar.search}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          className="sm:w-48"
          aria-label={ar.category}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">{ar.allCategories}</option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
      </div>

      <Card className="overflow-hidden">
        {!loaded ? (
          <div className="divide-y divide-border">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-2 px-5 py-4">
                <Skeleton className="h-4 w-56" />
                <Skeleton className="h-3 w-32" />
              </div>
            ))}
          </div>
        ) : logs.length === 0 ? (
          <EmptyState icon={<ScrollText />} title={ar.noLogs} />
        ) : (
          <ul className="divide-y divide-border">
            {logs.map((l) => {
              const open = Boolean(openIds[l.id]);
              const hasBody = logHasBody(l);
              return (
                <li key={l.id} className="px-4 py-3 text-sm sm:px-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
                      <Badge tone="neutral">
                        <span dir="ltr">{String(l.category)}</span>
                      </Badge>
                      <span className="font-medium" dir="ltr">
                        {String(l.action)}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatTime(String(l.createdAt))}</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      disabled={!hasBody}
                      aria-expanded={open}
                      onClick={() => toggle(l.id)}
                    >
                      {open ? ar.hideBody : ar.showBody}
                      <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
                    </Button>
                  </div>
                  {open ? (
                    hasBody ? (
                      <div
                        className={
                          hasKeys(l.before) && hasKeys(l.after) ? "mt-3 grid gap-3 md:grid-cols-2" : "mt-3 grid gap-3"
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
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
