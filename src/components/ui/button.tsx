import type { ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Button({
  className,
  variant = "primary",
  loading = false,
  disabled,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "outline";
  loading?: boolean;
}) {
  const styles = {
    primary: "bg-primary text-primary-foreground hover:opacity-90",
    secondary: "bg-secondary text-primary-foreground hover:opacity-90",
    ghost: "bg-transparent hover:bg-muted",
    danger: "bg-danger text-white hover:opacity-90",
    outline: "border border-border bg-card hover:bg-muted",
  };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition disabled:opacity-50",
        styles[variant],
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading}
      {...props}
    >
      {loading ? <Loader2 className="size-4 shrink-0 animate-spin" /> : null}
      {children}
    </button>
  );
}
