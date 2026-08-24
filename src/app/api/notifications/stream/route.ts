import { getCurrentUser } from "@/lib/auth/session";
import { NotificationService } from "@/lib/notifications/notification-service";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("UNAUTHORIZED", { status: 401 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = async () => {
        const unread = await NotificationService.unreadCount(user.id);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ unread })}\n\n`));
      };
      await send();
      const timer = setInterval(() => {
        send().catch(() => undefined);
      }, 4000);
      setTimeout(() => {
        clearInterval(timer);
        try {
          controller.close();
        } catch {
          /* closed */
        }
      }, 1000 * 60 * 5);
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
