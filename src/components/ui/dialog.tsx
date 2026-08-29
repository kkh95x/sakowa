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
  headerClassName,
  footerClassName,
  header,
  headerActions,
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
  headerClassName?: string;
  footerClassName?: string;
  header?: ReactNode;
  headerActions?: ReactNode;
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
            "fixed left-1/2 top-1/2 flex max-h-[min(calc(100dvh-1.5rem),880px)] min-h-0 -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto overscroll-contain rounded-3xl border border-border bg-card shadow-2xl outline-none [-webkit-overflow-scrolling:touch]",
            nested ? "z-[71]" : "z-50",
            SIZE_CLASS[size],
            className,
          )}
        >
          <header
            className={cn(
              "sticky top-0 z-10 flex shrink-0 items-start justify-between gap-3 border-b border-border bg-card px-5 py-4 sm:px-6",
              headerClassName,
            )}
          >
            {header ? (
              <div className="min-w-0 flex-1">{header}</div>
            ) : (
              <div className="min-w-0 space-y-1">
                <DialogPrimitive.Title className="text-lg font-bold leading-tight text-inherit">{title}</DialogPrimitive.Title>
                {description ? (
                  <DialogPrimitive.Description className="text-sm text-muted-foreground">
                    {description}
                  </DialogPrimitive.Description>
                ) : (
                  <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
                )}
              </div>
            )}
            {header ? <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title> : null}
            {header ? (
              <DialogPrimitive.Description className="sr-only">{description || title}</DialogPrimitive.Description>
            ) : null}
            {headerActions}
            <DialogPrimitive.Close
              className="rounded-xl p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label={ar.cancel}
            >
              <X className="size-5" />
            </DialogPrimitive.Close>
          </header>

          <div className={cn("px-5 py-4 sm:px-6", bodyClassName)}>
            {children}
          </div>

          {footer ? (
            <footer
              className={cn(
                "sticky bottom-0 z-10 flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border bg-card px-5 py-3 max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6",
                footerClassName,
              )}
            >
              {footer}
            </footer>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
