import { collections, getDb } from "@/lib/db/client";
import { getCurrentUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { ar } from "@/i18n/ar";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
    return null;
  }
  if (user.role === "SUPER_ADMIN") redirect("/users");
  const db = await getDb();
  const [bots, pending, unread] = await Promise.all([
    db.collection(collections.bots).countDocuments({}),
    db.collection(collections.orders).countDocuments({ status: "PENDING" }),
    db.collection(collections.notifications).countDocuments({ recipientUserId: user.id, read: false }),
  ]);
  const cards = [
    { label: ar.bots, value: bots },
    { label: ar.pending, value: pending },
    { label: ar.notifications, value: unread },
  ];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{ar.dashboard}</h1>
        <p className="text-sm text-muted-foreground">
          {ar.welcomeUser} {user.displayName}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="text-sm text-muted-foreground">{c.label}</div>
            <div className="mt-2 text-3xl font-bold text-primary">{c.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
