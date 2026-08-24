import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { RequestTypeService } from "@/lib/requests/request-type-service";
import { AppShell } from "@/components/layout/app-shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
    return null;
  }
  const requestTypes =
    user.role === "ADMIN"
      ? (await RequestTypeService.list()).map((r) => ({
          id: String(r._id),
          name: String(r.name),
          slug: String(r.slug || r._id),
        }))
      : [];
  return (
    <Suspense fallback={<div className="min-h-screen bg-background p-6 text-sm text-muted-foreground">…</div>}>
      <AppShell user={user} requestTypes={requestTypes}>
        {children}
      </AppShell>
    </Suspense>
  );
}
