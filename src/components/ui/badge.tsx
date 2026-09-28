import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type BadgeTone = "neutral" | "primary" | "success" | "warning" | "danger" | "info" | "accent";

const TONES: Record<BadgeTone, { box: string; dot: string }> = {
  neutral: { box: "bg-muted text-muted-foreground ring-border", dot: "bg-muted-foreground/60" },
  primary: { box: "bg-primary-soft text-primary ring-primary/15", dot: "bg-primary" },
  success: { box: "bg-success-soft text-success ring-success/15", dot: "bg-success" },
  warning: { box: "bg-warning-soft text-warning ring-warning/15", dot: "bg-warning" },
  danger: { box: "bg-danger-soft text-danger ring-danger/15", dot: "bg-danger" },
  info: { box: "bg-info-soft text-info ring-info/15", dot: "bg-info" },
  accent: { box: "bg-accent-soft text-accent-foreground ring-accent/20", dot: "bg-accent" },
};

export function badgeDotClass(tone: BadgeTone) {
  return TONES[tone].dot;
}

export function Badge({
  tone = "neutral",
  dot = false,
  className,
  children,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const t = TONES[tone];
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        t.box,
        className,
      )}
    >
      {dot ? <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", t.dot)} /> : null}
      <span className="truncate">{children}</span>
    </span>
  );
}
