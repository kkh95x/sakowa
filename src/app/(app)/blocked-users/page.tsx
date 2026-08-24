"use client";

import { useEffect, useState } from "react";
import { ar } from "@/i18n/ar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { formatTime } from "@/lib/utils";

export default function BlockedPage() {
  const toast = useToast();
  const [blocks, setBlocks] = useState<Record<string, unknown>[]>([]);
  const [types, setTypes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const [b, r] = await Promise.all([fetch("/api/blocked-users"), fetch("/api/request-types")]);
    const bj = await b.json();
    const rj = await r.json();
    setBlocks(bj.blocks ?? []);
    const map: Record<string, string> = {};
    for (const t of rj.requestTypes ?? []) map[t.id] = t.name;
    setTypes(map);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">🚫 {ar.blockedUsers}</h1>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/60">
            <tr>
              <th className="px-3 py-2 text-start">Username</th>
              <th className="px-3 py-2 text-start">الاسم</th>
              <th className="px-3 py-2 text-start">Telegram ID</th>
              <th className="px-3 py-2 text-start">{ar.requests}</th>
              <th className="px-3 py-2 text-start">{ar.reason}</th>
              <th className="px-3 py-2 text-start">التاريخ</th>
              <th className="px-3 py-2 text-start">{ar.actions}</th>
            </tr>
          </thead>
          <tbody>
            {blocks.map((b) => (
              <tr key={String(b.id)} className="border-t border-border">
                <td className="px-3 py-2">{b.username ? `@${b.username}` : "-"}</td>
                <td className="px-3 py-2">{[b.firstName, b.lastName].filter(Boolean).join(" ") || "-"}</td>
                <td className="px-3 py-2">{String(b.telegramUserId)}</td>
                <td className="px-3 py-2">{types[String(b.requestTypeId)] ?? String(b.requestTypeId)}</td>
                <td className="px-3 py-2">{String(b.reason ?? "")}</td>
                <td className="px-3 py-2">{formatTime(String(b.blockedAt))}</td>
                <td className="px-3 py-2">
                  <Button
                    variant="outline"
                    loading={busy === String(b.id)}
                    onClick={async () => {
                      setBusy(String(b.id));
                      const res = await fetch(`/api/blocked-users/${b.id}/unblock`, { method: "POST" });
                      setBusy(null);
                      toast(res.ok ? ar.toast.userUnblocked : "فشل");
                      load();
                    }}
                  >
                    {ar.unblock}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
