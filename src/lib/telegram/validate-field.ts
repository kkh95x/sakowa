import type { RequestField } from "@/types";

const EMAIL = /.+@.+\..+/;
const PHONE = /^\+?[0-9]{8,15}$/;
const URL = /^https?:\/\/\S+$/i;

export function validateFieldValue(field: RequestField, raw: string | undefined): string | null {
  const value = raw?.trim() ?? "";
  if (!value) {
    if (field.required && field.type !== "CHECKBOX" && field.type !== "CONFIRMATION") {
      return "هذا الحقل مطلوب.";
    }
    return null;
  }
  if (field.type === "EMAIL" && !EMAIL.test(value)) return "يرجى إدخال بريد إلكتروني صالح.";
  if (field.type === "NUMBER" && Number.isNaN(Number(value))) return "يرجى إدخال رقم صالح.";
  if (field.type === "PHONE" && !PHONE.test(value.replace(/[\s-]/g, ""))) {
    return "يرجى إدخال رقم هاتف صالح.";
  }
  if (field.type === "URL" && !URL.test(value)) return "يرجى إدخال رابط صالح.";
  if (field.validation?.min != null && value.length < field.validation.min) {
    return `يجب ألا يقل عن ${field.validation.min} أحرف.`;
  }
  if (field.validation?.max != null && value.length > field.validation.max) {
    return `يجب ألا يزيد عن ${field.validation.max} أحرف.`;
  }
  if (field.validation?.pattern) {
    try {
      if (!new RegExp(field.validation.pattern).test(value)) return "القيمة غير مطابقة للنمط المطلوب.";
    } catch {
      /* ignore invalid pattern */
    }
  }
  if ((field.type === "SELECT" || field.type === "RADIO") && field.options?.length) {
    const ok = field.options.some((o) => o.value === value || o.label === value);
    if (!ok) return "يرجى اختيار قيمة من القائمة.";
  }
  return null;
}

export function persistValue(field: RequestField, value: unknown) {
  if (field.type === "NUMBER" && value !== "" && value != null) return Number(value);
  if (field.type === "CHECKBOX" && Array.isArray(value)) return value;
  if (field.type === "CONFIRMATION") return Boolean(value);
  return value;
}
