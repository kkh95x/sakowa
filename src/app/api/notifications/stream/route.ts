import { getCurrentUser } from "@/lib/auth/session";
import { NotificationService } from "@/lib/notifications/notification-service";
import { ObjectId } from "mongodb";
import { logJson } from "@/lib/log";

function parseLastEventId(req: Request) {
  const header = req.headers.get("last-event-id") || req.headers.get("Last-Event-ID") || "";
  if (!header) return null;
  if (ObjectId.isValid(header) && String(new ObjectId(header)) === header) {
    return { id: header, at: new ObjectId(header).getTimestamp() };
  }
  const asDate = new Date(header);
  if (!Number.isNaN(asDate.getTime())) return { id: "", at: asDate };
  return null;
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("UNAUTHORIZED", { status: 401 });

  const encoder = new TextEncoder();
  const recovered = parseLastEventId(req);
  const stream = new ReadableStream({
    async start(controller) {
      let lastCreatedAt = recovered?.at ?? new Date(0);
      let closed = false;
      const send = async (replayMissed: boolean) => {
        if (closed) return;
        const unread = await NotificationService.unreadCount(user.id);
        const missed = replayMissed
          ? await NotificationService.listSince(user.id, lastCreatedAt, 50)
          : [];
        if (missed.length) {
          const latest = missed[missed.length - 1];
          lastCreatedAt = new Date(String(latest.createdAt));
          const id = String(latest._id);
          const payload = {
            unread,
            items: missed.map((n) => NotificationService.serialize(n as Record<string, unknown>)),
          };
          controller.enqueue(encoder.encode(`id: ${id}\nevent: notifications\ndata: ${JSON.stringify(payload)}\n\n`));
          return;
        }
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ unread, items: [] })}\n\n`),
        );
      };

      try {
        await send(true);
      } catch (err) {
        logJson("error", "notifications", "sse_initial_failed", {
          userId: user.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      const timer = setInterval(() => {
        send(true).catch((err) => {
          logJson("warn", "notifications", "sse_poll_failed", {
            userId: user.id,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }, 2500);

      const onAbort = () => {
        closed = true;
        clearInterval(timer);
        try {
          controller.close();
        } catch {
          /* closed */
        }
      };
      req.signal.addEventListener("abort", onAbort);
      const lifetime = setTimeout(onAbort, 1000 * 60 * 5);
      req.signal.addEventListener("abort", () => clearTimeout(lifetime));
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
