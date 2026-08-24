"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { ar } from "@/i18n/ar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [totp, setTotp] = useState("");
  const [needsTotp, setNeedsTotp] = useState(false);
  const [optional2fa, setOptional2fa] = useState(false);
  const [role, setRole] = useState("ADMIN");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, totp: totp || undefined }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error === "INVALID_TOTP" ? ar.invalidTotp : ar.loginFailed);
      return;
    }
    if (data.requiresTwoFactor) {
      setNeedsTotp(true);
      return;
    }
    setRole(data.user?.role ?? "ADMIN");
    if (!data.user?.twoFactorEnabled) {
      setOptional2fa(true);
      return;
    }
    router.push(data.user.role === "SUPER_ADMIN" ? "/users" : "/dashboard");
    router.refresh();
  }

  if (optional2fa) {
    return (
      <div className="space-y-4 text-center">
        <h2 className="text-xl font-bold">{ar.protectAccount}</h2>
        <p className="text-sm text-muted-foreground">{ar.twoFactorRecommend}</p>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => router.push("/settings?setup2fa=1")}>
            {ar.enableNow}
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              router.push(role === "SUPER_ADMIN" ? "/users" : "/dashboard");
              router.refresh();
            }}
          >
            {ar.skip}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <Label htmlFor="username">{ar.username}</Label>
        <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="username" />
      </div>
      <div>
        <Label htmlFor="password">{ar.password}</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="pe-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            className="absolute end-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
            aria-label={showPassword ? ar.hidePassword : ar.showPassword}
            aria-pressed={showPassword}
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>
      {needsTotp && (
        <div>
          <Label htmlFor="totp">{ar.totpCode}</Label>
          <Input id="totp" value={totp} onChange={(e) => setTotp(e.target.value)} placeholder={ar.totpCode} />
        </div>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button type="submit" className="w-full" loading={loading}>
        {loading ? ar.loading : needsTotp ? ar.verify : ar.login}
      </Button>
    </form>
  );
}
