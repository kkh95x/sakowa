export function logJson(level: "info" | "warn" | "error", service: string, action: string, extra: Record<string, unknown> = {}) {
  const safe = { ...extra };
  for (const key of Object.keys(safe)) {
    if (/password|secret|token|totp|recovery|authorization/i.test(key)) delete safe[key];
  }
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service,
    action,
    ...safe,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
