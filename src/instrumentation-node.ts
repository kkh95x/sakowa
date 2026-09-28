export async function registerNode() {
  try {
    const dns = await import("node:dns");
    dns.setDefaultResultOrder("ipv4first");
  } catch {
    /* Node DNS API unavailable */
  }
  const { logJson } = await import("@/lib/log");
  // Delay slightly so Mongo connection is ready after boot.
  setTimeout(() => {
    void (async () => {
      try {
        const { migrate } = await import("@/lib/db/migrate");
        const { ensureSuperAdmin } = await import("@/lib/db/bootstrap");
        await migrate();
        const bootstrap = await ensureSuperAdmin();
        if (bootstrap.created) {
          logJson("info", "bootstrap", "super_admin_created", {
            username: bootstrap.username,
          });
        } else if (bootstrap.skipped) {
          logJson("warn", "bootstrap", "super_admin_skipped", {
            reason: bootstrap.reason ?? "unknown",
          });
        }
      } catch (err) {
        logJson("error", "bootstrap", "boot_error", {
          error: err instanceof Error ? err.message : String(err),
        });
      }

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

      try {
        const { startNotificationOutboxWorker } = await import("@/lib/notifications/outbox-worker");
        startNotificationOutboxWorker();
        logJson("info", "notifications", "outbox_worker_started", {});
      } catch (err) {
        logJson("error", "notifications", "outbox_worker_failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();
  }, 1500);
}
