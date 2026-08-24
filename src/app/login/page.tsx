import { LoginForm } from "@/components/auth/login-form";
import { ar } from "@/i18n/ar";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#1b6b4a22,_transparent_45%),linear-gradient(180deg,#f7f3ea,#ebe4d6)] p-4">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-xl">
        <div className="mb-8 text-center">
          <div className="text-3xl font-bold text-primary">{ar.brand}</div>
          <p className="mt-2 text-sm text-muted-foreground">{ar.tagline}</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
