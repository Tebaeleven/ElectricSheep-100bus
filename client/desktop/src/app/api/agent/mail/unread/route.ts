import { isLoopbackRequest } from "@/lib/agent/guard";
import { listUnreadMail } from "@/lib/agent/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isLoopbackRequest(req)) {
    return new Response("loopback only", { status: 403 });
  }
  const locale = new URL(req.url).searchParams.get("locale") === "en" ? "en" : "ja";
  try {
    const messages = await listUnreadMail(locale);
    return Response.json({ ok: true, messages });
  } catch (err) {
    return Response.json({
      ok: false,
      messages: [],
      error: err instanceof Error ? err.message : "mail failed",
    });
  }
}
