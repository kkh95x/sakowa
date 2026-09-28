import Link from "next/link";
import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { Activity, ArrowLeft, Bell, Bot, CheckCircle2, Clock3, FolderKanban, Inbox, Search, Wrench } from "lucide-react";
import { collections, getDb } from "@/lib/db/client";
import { getCurrentUser } from "@/lib/auth/session";
import { RequestTypeService } from "@/lib/requests/request-type-service";
import { ar } from "@/i18n/ar";
import { complaintStatusLabel, emptyStatusCounts, accumulateStatusCount, canonicalizeStatus } from "@/lib/orders/complaint-status";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/orders/status-badge";
import { cn, relativeTime } from "@/lib/utils";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
    return null;
  }
  if (user.role === "SUPER_ADMIN") redirect("/users");
  const db = await getDb();
  const [bots, statusRows, typeRows, unread, recent, history, types] = await Promise.all([
    db.collection(collections.bots).countDocuments({}),
    db
      .collection(collections.orders)
      .aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }])
      .toArray(),
    db
      .collection(collections.orders)
      .aggregate([{ $group: { _id: { type: "$requestTypeId", status: "$status" }, count: { $sum: 1 } } }])
      .toArray(),
    db.collection(collections.notifications).countDocuments({ recipientUserId: user.id, read: false }),
    db
      .collection(collections.orders)
      .find(
        {},
        {
          projection: {
            orderNumber: 1,
            status: 1,
            createdAt: 1,
            updatedAt: 1,
            telegramName: 1,
            telegramUsername: 1,
            requestTypeId: 1,
          },
        },
      )
      .sort({ createdAt: -1 })
      .limit(8)
      .toArray(),
    db
      .collection(collections.orderStatusHistory)
      .find({}, { projection: { orderId: 1, previousStatus: 1, newStatus: 1, createdAt: 1 } })
      .sort({ createdAt: -1 })
      .limit(8)
      .toArray(),
    RequestTypeService.list(),
  ]);

  const counts = emptyStatusCounts();
  for (const row of statusRows) accumulateStatusCount(counts, row._id, Number(row.count) || 0);
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  const typeName = new Map(types.map((t) => [String(t._id), String(t.name)]));
  const perType = new Map<string, { total: number; pending: number }>();
  for (const row of typeRows) {
    const id = String((row._id as { type?: unknown }).type ?? "");
    const entry = perType.get(id) ?? { total: 0, pending: 0 };
    const n = Number(row.count) || 0;
    entry.total += n;
    if (canonicalizeStatus((row._id as { status?: unknown }).status) === "PENDING") entry.pending += n;
    perType.set(id, entry);
  }

  const historyOrderIds = [...new Set(history.map((h) => String(h.orderId)))];
  const historyOrders = historyOrderIds.length
    ? await db
        .collection(collections.orders)
        .find(
          { _id: { $in: historyOrderIds.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id)) } },
          { projection: { orderNumber: 1 } },
        )
        .toArray()
    : [];
  const orderNumberById = new Map(historyOrders.map((o) => [String(o._id), String(o.orderNumber ?? "")]));

  const kpis = [
    { label: ar.totalComplaints, value: total, icon: Inbox, tone: "text-foreground bg-muted" },
    { label: ar.pending, value: counts.PENDING, icon: Clock3, tone: "text-warning bg-warning-soft" },
    { label: ar.reviewing, value: counts.REVIEWING, icon: Search, tone: "text-info bg-info-soft" },
    { label: ar.inProgress, value: counts.IN_PROGRESS, icon: Wrench, tone: "text-accent-foreground bg-accent-soft" },
    { label: ar.resolved, value: counts.RESOLVED, icon: CheckCircle2, tone: "text-success bg-success-soft" },
  ];
  const minor = [
    { label: ar.rejected, value: counts.REJECTED },
    { label: ar.closed, value: counts.CLOSED },
    { label: ar.unread, value: unread, icon: Bell, href: "/notifications" },
    { label: ar.bots, value: bots, icon: Bot, href: "/bots" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={ar.dashboard} description={`${ar.welcomeUser} ${user.displayName}`} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {kpis.map((k, i) => {
          const Icon = k.icon;
          return (
            <Card key={k.label} className={cn("p-4", i === 0 && "col-span-2 md:col-span-1")}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">{k.label}</span>
                <span className={cn("flex size-8 items-center justify-center rounded-lg", k.tone)}>
                  <Icon className="size-4" />
                </span>
              </div>
              <div className="mt-3 text-3xl font-semibold tabular-nums tracking-tight">{k.value}</div>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm shadow-card">
        <span className="font-medium text-muted-foreground">{ar.otherStats}</span>
        {minor.map((m) => {
          const content = (
            <>
              <span className="text-muted-foreground">{m.label}</span>
              <span className="font-semibold tabular-nums">{m.value}</span>
            </>
          );
          return m.href ? (
            <Link key={m.label} href={m.href} className="inline-flex items-center gap-1.5 rounded hover:text-primary">
              {content}
            </Link>
          ) : (
            <span key={m.label} className="inline-flex items-center gap-1.5">
              {content}
            </span>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={ar.recentComplaints} icon={<Inbox />} />
          {recent.length === 0 ? (
            <EmptyState icon={<Inbox />} title={ar.noComplaintsYet} description={ar.noComplaintsHint} />
          ) : (
            <ul className="divide-y divide-border">
              {recent.map((row) => {
                const who = String(row.telegramName || (row.telegramUsername ? `@${row.telegramUsername}` : "") || "—");
                return (
                  <li key={String(row._id)}>
                    <Link
                      href={`/complaints/${String(row._id)}`}
                      className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50 sm:px-5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-semibold tabular-nums" dir="ltr">
                            {String(row.orderNumber ?? "")}
                          </span>
                          <span className="truncate text-sm text-muted-foreground">
                            {typeName.get(String(row.requestTypeId)) ?? "—"}
                          </span>
                        </div>
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">
                          {who} · {relativeTime(row.createdAt as Date)}
                        </div>
                      </div>
                      <StatusBadge status={row.status} />
                      <ArrowLeft className="hidden size-4 text-muted-foreground transition-transform group-hover:-translate-x-0.5 sm:block" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title={ar.byComplaintType} icon={<FolderKanban />} />
            {types.length === 0 ? (
              <EmptyState title={ar.noRequestTabs} className="py-8" />
            ) : (
              <ul className="divide-y divide-border">
                {types.map((t) => {
                  const id = String(t._id);
                  const stat = perType.get(id) ?? { total: 0, pending: 0 };
                  return (
                    <li key={id}>
                      <Link
                        href={`/requests/${id}?status=PENDING`}
                        className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-muted/50 sm:px-5"
                      >
                        <span className="min-w-0 truncate font-medium">{String(t.name)}</span>
                        <span className="flex shrink-0 items-center gap-2 text-xs">
                          {stat.pending > 0 ? (
                            <span className="rounded-full bg-warning-soft px-2 py-0.5 font-medium text-warning">
                              {stat.pending} {ar.pending}
                            </span>
                          ) : null}
                          <span className="tabular-nums text-muted-foreground">{stat.total}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title={ar.recentActivity} icon={<Activity />} />
            {history.length === 0 ? (
              <EmptyState title={ar.noActivity} className="py-8" />
            ) : (
              <ol className="space-y-0 px-4 py-3 sm:px-5">
                {history.map((h, i) => {
                  const created = !h.previousStatus;
                  const number = orderNumberById.get(String(h.orderId));
                  return (
                    <li key={String(h._id)} className="relative flex gap-3 pb-3 last:pb-0">
                      {i < history.length - 1 ? (
                        <span aria-hidden className="absolute start-[5px] top-3 h-full w-px bg-border" />
                      ) : null}
                      <span
                        aria-hidden
                        className={cn(
                          "relative mt-1.5 size-[11px] shrink-0 rounded-full border-2 border-card ring-1",
                          created ? "bg-primary ring-primary/30" : "bg-muted-foreground/50 ring-border",
                        )}
                      />
                      <div className="min-w-0 text-sm">
                        <div className="leading-snug">
                          {created ? ar.complaintReceived : `${ar.statusChangedTo} ${complaintStatusLabel(h.newStatus)}`}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {number ? (
                            <Link href={`/complaints/${String(h.orderId)}`} className="font-medium hover:text-primary" dir="ltr">
                              {number}
                            </Link>
                          ) : null}
                          {number ? " · " : ""}
                          {relativeTime(h.createdAt as Date)}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
