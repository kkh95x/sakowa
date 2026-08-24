export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  const { logJson } = await import("@/lib/log");
  // Delay slightly so Mongo connection is ready after boot.
  setTimeout(() => {
    void (async () => {
      try {
        const { TelegramService } = await import("@/lib/telegram/telegram-service");
        const results = await TelegramService.reconnectRunningBots();
        logJson("info", "telegram", "boot_reconnect", {
          total: results.length,
          ok: results.filter((r) => r.ok).length,
          failed: results.filter((r) => !r.ok).length,
        });
        for (const r of results.filter((x) => !x.ok)) {
          logJson("error", "telegram", "boot_reconnect_failed", {
            botId: r.botId,
            error: r.error ?? "unknown",
          });
        }
      } catch (err) {
        logJson("error", "telegram", "boot_reconnect_error", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();
  }, 1500);
}
