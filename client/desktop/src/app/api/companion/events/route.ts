import {
  isCompanionAuthorized,
  snapshotEvent,
  subscribe,
} from "@/lib/companion/store";
import type { CompanionEvent } from "@/lib/companion/protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isCompanionAuthorized(req)) {
    return new Response("unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: CompanionEvent) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          );
        } catch {
          /* closed */
        }
      };
      send(snapshotEvent());
      const unsub = subscribe(send);
      const ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          /* closed */
        }
      }, 15000);
      cleanup = () => {
        clearInterval(ping);
        unsub();
      };
      req.signal.addEventListener("abort", () => {
        cleanup?.();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      cleanup?.();
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
