import { runAgentTurn } from "@/lib/agent/run";
import { grantsFromRequest, isLoopbackRequest } from "@/lib/agent/guard";
import { isLocale, type Locale } from "@/lib/i18n/types";
import type { AgentStreamEvent } from "@/lib/agent/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  if (!isLoopbackRequest(req)) {
    return new Response("loopback only", { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    petId?: string;
    locale?: string;
    sessionId?: string;
    message?: string;
    approval?: "allow" | "deny";
    choiceId?: string;
    grants?: unknown;
    config?: unknown;
    requireHarness?: boolean;
    history?: { role: "user" | "assistant"; content: string }[];
  };
  const locale: Locale = isLocale(body.locale) ? body.locale : "ja";
  const petId = typeof body.petId === "string" ? body.petId : "";
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: AgentStreamEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        await runAgentTurn(
          {
            petId,
            locale,
            sessionId: body.sessionId,
            message: body.message,
            approval: body.approval,
            choiceId: typeof body.choiceId === "string" ? body.choiceId : undefined,
            grants: grantsFromRequest(
              body.grants,
              req,
              body.requireHarness === true
            ),
            config: body.config,
            requireHarness: body.requireHarness === true,
            history: Array.isArray(body.history) ? body.history : undefined,
          },
          emit
        );
      } catch (err) {
        emit({
          type: "error",
          message: err instanceof Error ? err.message : "Agent failed",
        });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
