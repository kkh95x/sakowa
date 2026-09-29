import type { RequestField } from "@/types";

export type ComplaintTemplateId = "cars" | "salaries" | "transport";

export type ComplaintTemplate = {
  id: ComplaintTemplateId;
  name: string;
  description: string;
  fields: Array<{
    name: string;
    label: string;
    telegramMessage: string;
    required: boolean;
  }>;
};

/** Short complaint forms. Every question is DYNAMIC so the user can answer with text or a voice clip. */
export const COMPLAINT_TEMPLATES: ComplaintTemplate[] = [
  {
    id: "cars",
    name: "شكاوي سيارات",
    description: "شكوى عن سيارة أو لوحة أو حادث. الإجابة بنص أو مقطع صوتي.",
    fields: [
      { name: "problem", label: "المشكلة", telegramMessage: "ما المشكلة؟", required: true },
      { name: "plate", label: "رقم اللوحة", telegramMessage: "ما رقم لوحة السيارة؟", required: true },
      { name: "place", label: "المكان", telegramMessage: "أين حدثت المشكلة؟", required: false },
    ],
  },
  {
    id: "salaries",
    name: "شكاوي رواتب",
    description: "شكوى عن راتب أو خصم أو تأخير. الإجابة بنص أو مقطع صوتي.",
    fields: [
      { name: "issue", label: "المشكلة", telegramMessage: "ما المشكلة في الراتب؟", required: true },
      { name: "month", label: "الشهر", telegramMessage: "عن أي شهر تتحدث؟", required: true },
      { name: "amount", label: "المبلغ", telegramMessage: "ما المبلغ المتأثر، إن وجد؟", required: false },
    ],
  },
  {
    id: "transport",
    name: "شكاوي مواصلات",
    description: "شكوى عن خط أو تأخير أو رحلة. الإجابة بنص أو مقطع صوتي.",
    fields: [
      { name: "issue", label: "المشكلة", telegramMessage: "ما مشكلة المواصلات؟", required: true },
      { name: "route", label: "الخط أو الوجهة", telegramMessage: "ما خط السير أو الوجهة؟", required: true },
      { name: "when", label: "الوقت", telegramMessage: "متى حدثت المشكلة؟", required: false },
    ],
  },
];

export function fieldsFromTemplate(template: ComplaintTemplate): RequestField[] {
  return template.fields.map((field, order) => ({
    id: crypto.randomUUID(),
    name: field.name,
    label: field.label,
    type: "DYNAMIC",
    required: field.required,
    sensitive: false,
    order,
    active: true,
    telegramMessage: field.telegramMessage,
    options: [],
  }));
}
