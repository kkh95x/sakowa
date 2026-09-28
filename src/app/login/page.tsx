import { MessageSquareWarning } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";
import { ar } from "@/i18n/ar";

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-card">
            <MessageSquareWarning className="size-6" aria-hidden />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">{ar.brand}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{ar.tagline}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-card sm:p-7">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
