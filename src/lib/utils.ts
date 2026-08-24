import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(value: string | Date) {
  return new Intl.DateTimeFormat("ar-SY", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Damascus",
  }).format(new Date(value));
}

export function relativeTime(value: string | Date) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "الآن";
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.round(hours / 24);
  return `منذ ${days} يوم`;
}
