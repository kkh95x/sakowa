"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastTone = "success" | "error" | "info";
type Toast = { id: number; text: string; tone: ToastTone };

const ERROR_PREFIXES = ["تعذر", "فشل", "حدث خطأ", "خطأ", "رمز التحقق غير صحيح", "أدخل", "اختر", "تأكيد كلمة المرور غير"];

function inferTone(text: string): ToastTone {
  const t = text.trim();
  return ERROR_PREFIXES.some((p) => t.startsWith(p)) ? "error" : "success";
}

const Ctx = createContext<(text: string, tone?: ToastTone) => void>(() => undefined);

function ToastViewport({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

const TONE_STYLE: Record<ToastTone, { icon: typeof Info; className: string }> = {
  success: { icon: CheckCircle2, className: "text-success" },
  error: { icon: AlertCircle, className: "text-danger" },
  info: { icon: Info, className: "text-info" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const push = useCallback((text: string, tone?: ToastTone) => {
    const id = ++seq.current;
    setToasts((t) => (t.some((x) => x.text === text) ? t : [...t.slice(-3), { id, text, tone: tone ?? inferTone(text) }]));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <ToastViewport>
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-3 bottom-4 z-[200] flex flex-col items-center gap-2 sm:inset-x-auto sm:start-5 sm:items-start"
        >
          <AnimatePresence initial={false}>
            {toasts.map((t) => {
              const style = TONE_STYLE[t.tone];
              const Icon = style.icon;
              return (
                <motion.div
                  key={t.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6, transition: { duration: 0.15 } }}
                  className="pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl border border-border bg-card px-3.5 py-3 text-sm text-foreground shadow-pop sm:w-auto sm:min-w-64"
                >
                  <Icon className={cn("mt-0.5 size-4 shrink-0", style.className)} />
                  <span className="leading-relaxed">{t.text}</span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </ToastViewport>
    </Ctx.Provider>
  );
}

export function useToast() {
  return useContext(Ctx);
}
