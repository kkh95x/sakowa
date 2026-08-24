import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2",
        className,
      )}
      {...props}
    />
  );
}
