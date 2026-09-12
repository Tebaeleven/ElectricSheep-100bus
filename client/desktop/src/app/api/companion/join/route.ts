import {
  joinWithCode,
  listPets,
  listThreads,
  isPaired,
} from "@/lib/companion/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { code?: unknown };
  const code = typeof body.code === "string" ? body.code : "";
  const token = joinWithCode(code);
  if (!token) {
    return Response.json({ error: "invalid_code" }, { status: 401 });
  }
  return Response.json({
    token,
    pets: listPets(),
    paired: isPaired(),
    threads: listThreads(),
  });
}
