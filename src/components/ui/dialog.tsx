"use client";

import type { ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ar } from "@/i18n/ar";

const SIZE_CLASS = {
  sm: "w-[min(100%-1.5rem,28rem)]",
  md: "w-[min(100%-1.5rem,36rem)]",
  lg: "w-[min(100%-1.5rem,56rem)]",
  xl: "w-[min(100%-1.5rem,72rem)]",
} as const;

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
  className,
  bodyClassName,
  nested = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: keyof typeof SIZE_CLASS;
  className?: string;
  bodyClassName?: string;
  nested?: boolean;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 bg-black/45 backdrop-blur-[2px]",
            nested ? "z-[70]" : "z-50",
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-1/2 flex max-h-[min(92vh,880px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl outline-none",
            nested ? "z-[71]" : "z-50",
            SIZE_CLASS[size],
            className,
          )}
        >
          <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
            <div className="min-w-0 space-y-1">
              <DialogPrimitive.Title className="text-lg font-bold leading-tight">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="text-sm text-muted-foreground">
                  {description}
                </DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              className="rounded-xl p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label={ar.cancel}
            >
              <X className="size-5" />
            </DialogPrimitive.Close>
          </header>

          <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6", bodyClassName)}>
            {children}
          </div>

          {footer ? (
            <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border bg-card/95 px-5 py-3 sm:px-6">
              {footer}
            </footer>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
