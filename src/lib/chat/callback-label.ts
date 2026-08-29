export type InlineButton = { text?: string; callback_data?: string };

export function callbackButtonLabel(
  data: string | undefined,
  keyboard?: InlineButton[][] | null,
): string | null {
  if (!data) return null;
  for (const row of keyboard ?? []) {
    for (const btn of row) {
      if (btn.callback_data === data && btn.text?.trim()) return btn.text.trim();
    }
  }
  if (data === "confirm:yes") return "تأكيد";
  if (data === "confirm:no") return "إلغاء";
  if (data === "menu:my") return "طلباتي";
  if (data === "menu:help") return "المساعدة";
  if (data === "menu:requests") return "الخدمات";
  if (data.startsWith("y:")) return "نعم";
  if (data.startsWith("n:")) return "لا";
  if (data.startsWith("d:")) return "تم";
  return null;
}

export function isSlashCommand(text: string | null | undefined) {
  return Boolean(text?.trim().startsWith("/"));
}
