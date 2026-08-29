export function nextFieldName(fields: { name?: string }[]): string {
  const used = new Set(fields.map((f) => String(f.name ?? "").trim()).filter(Boolean));
  let i = 1;
  while (used.has(`field_${i}`)) i += 1;
  return `field_${i}`;
}

export function ensureUniqueFieldNames<T extends { name: string }>(fields: T[]): T[] {
  const used = new Set<string>();
  return fields.map((field, i) => {
    let name = (field.name || "").trim() || `field_${i + 1}`;
    if (used.has(name)) {
      let n = 2;
      let candidate = `${name}_${n}`;
      while (used.has(candidate)) {
        n += 1;
        candidate = `${name}_${n}`;
      }
      name = candidate;
    }
    used.add(name);
    return name === field.name ? field : { ...field, name };
  });
}

export function duplicateFieldNames(fields: { name: string }[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const field of fields) {
    const name = (field.name || "").trim();
    if (!name) continue;
    if (seen.has(name)) dupes.add(name);
    seen.add(name);
  }
  return [...dupes];
}
