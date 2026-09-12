import { harnessStatus } from "@/lib/agent/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const status = await harnessStatus();
  return Response.json(status);
}
