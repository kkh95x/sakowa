"use client";

import { useEffect, useState } from "react";
import { ar } from "@/i18n/ar";
import { Input } from "@/components/ui/input";
import { formatTime } from "@/lib/utils";

export default function LogsPage() {
  const [logs, setLogs] = useState<Record<string, unknown>[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");

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
          {["AUTH", "SECURITY", "USERS", "BOTS", "REQUESTS", "ORDERS", "BLOCKS"].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        {logs.map((l) => (
          <div key={String(l.id)} className="rounded-2xl border border-border bg-card p-3 text-sm">
            <div className="font-medium">
              {String(l.category)} / {String(l.action)}
            </div>
            <div className="text-xs text-muted-foreground">{formatTime(String(l.createdAt))}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
