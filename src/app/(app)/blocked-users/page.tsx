"use client";

import { useEffect, useState } from "react";
import { ShieldBan } from "lucide-react";
import { ar } from "@/i18n/ar";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { formatTime } from "@/lib/utils";

export default function BlockedPage() {
  const toast = useToast();
  const [blocks, setBlocks] = useState<Record<string, unknown>[]>([]);
  const [types, setTypes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    try {
      const [b, r] = await Promise.all([fetch("/api/blocked-users"), fetch("/api/request-types")]);
      const bj = await b.json();
      const rj = await r.json();
      setBlocks(bj.blocks ?? []);
      const map: Record<string, string> = {};
      for (const t of rj.requestTypes ?? []) map[t.id] = t.name;
      setTypes(map);
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function unblock(id: string) {
    setBusy(id);
    const res = await fetch(`/api/blocked-users/${id}/unblock`, { method: "POST" });
    setBusy(null);
    toast(res.ok ? ar.toast.userUnblocked : ar.unblockFailed, res.ok ? "success" : "error");
    load();
  }

  function fullName(b: Record<string, unknown>) {
    return [b.firstName, b.lastName].filter(Boolean).join(" ") || "—";
  }

  function typeName(b: Record<string, unknown>) {
    return types[String(b.requestTypeId)] ?? String(b.requestTypeId);
  }

  return (
    <div className="space-y-5">
      <PageHeader title={ar.blockedUsers} description={ar.blockedUsersDescription} />

      <Card className="overflow-hidden">
        {!loaded ? (
          <div className="divide-y divide-border">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="ms-auto h-8 w-20" />
              </div>
            ))}
          </div>
        ) : blocks.length === 0 ? (
          <EmptyState icon={<ShieldBan />} title={ar.noBlockedUsers} />
        ) : (
          <>
            <div className="relative hidden overflow-x-auto md:block">
              <table className="min-w-full text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 text-start font-medium">{ar.name}</th>
                    <th className="px-4 py-2.5 text-start font-medium">{ar.telegramUsername}</th>
                    <th className="px-4 py-2.5 text-start font-medium">{ar.telegramId}</th>
                    <th className="px-4 py-2.5 text-start font-medium">{ar.complaintType}</th>
                    <th className="px-4 py-2.5 text-start font-medium">{ar.reason}</th>
                    <th className="px-4 py-2.5 text-start font-medium">{ar.blockedAt}</th>
                    <th className="px-4 py-2.5 text-start font-medium">
                      <span className="sr-only">{ar.actions}</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {blocks.map((b) => (
                    <tr key={String(b.id)} className="transition-colors hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{fullName(b)}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {b.username ? <span dir="ltr">@{String(b.username)}</span> : "—"}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">
                        <span dir="ltr">{String(b.telegramUserId)}</span>
                      </td>
                      <td className="px-4 py-3">{typeName(b)}</td>
                      <td className="max-w-64 px-4 py-3 text-muted-foreground">
                        <span className="line-clamp-2">{String(b.reason ?? "") || "—"}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatTime(String(b.blockedAt))}</td>
                      <td className="px-4 py-3 text-end">
                        <Button variant="outline" size="sm" loading={busy === String(b.id)} onClick={() => unblock(String(b.id))}>
                          {ar.unblock}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-border md:hidden">
              {blocks.map((b) => (
                <li key={String(b.id)} className="space-y-2 px-4 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium">{fullName(b)}</div>
                      <div className="text-xs text-muted-foreground">
                        {b.username ? <span dir="ltr">@{String(b.username)}</span> : null}
                        {b.username ? " · " : null}
                        <span dir="ltr" className="tabular-nums">
                          {String(b.telegramUserId)}
                        </span>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" loading={busy === String(b.id)} onClick={() => unblock(String(b.id))}>
                      {ar.unblock}
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {typeName(b)} · {formatTime(String(b.blockedAt))}
                  </div>
                  {b.reason ? <p className="text-sm">{String(b.reason)}</p> : null}
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
